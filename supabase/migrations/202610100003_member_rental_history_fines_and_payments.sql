ALTER TABLE public.rentals
  ADD COLUMN IF NOT EXISTS return_requested_at timestamptz;

ALTER TABLE public.rentals
  DROP CONSTRAINT IF EXISTS rentals_status_check;

ALTER TABLE public.rentals
  ADD CONSTRAINT rentals_status_check
  CHECK (status IN ('pending', 'active', 'overdue', 'return_requested', 'returned', 'cancelled'));

DROP INDEX IF EXISTS public.active_rental_per_book_idx;

CREATE UNIQUE INDEX active_rental_per_book_idx
  ON public.rentals (book_id)
  WHERE status IN ('pending', 'active', 'overdue', 'return_requested');

ALTER TABLE public.fine_ledger
  ADD COLUMN IF NOT EXISTS original_amount_bdt numeric(10,2),
  ADD COLUMN IF NOT EXISTS review_note text,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.admin_sessions(id);

CREATE TABLE IF NOT EXISTS public.fine_ledger_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fine_id uuid NOT NULL REFERENCES public.fine_ledger(id) ON DELETE RESTRICT,
  admin_session_id uuid NOT NULL REFERENCES public.admin_sessions(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('override', 'waive')),
  previous_amount_bdt numeric(10,2) NOT NULL,
  new_amount_bdt numeric(10,2) NOT NULL,
  previous_status text NOT NULL,
  new_status text NOT NULL,
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rental_return_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rental_id uuid NOT NULL UNIQUE REFERENCES public.rentals(id) ON DELETE RESTRICT,
  member_id uuid NOT NULL REFERENCES public.member_profiles(id) ON DELETE RESTRICT,
  admin_session_id uuid NOT NULL REFERENCES public.admin_sessions(id) ON DELETE RESTRICT,
  received_at timestamptz NOT NULL,
  due_at timestamptz NOT NULL,
  returned_early boolean NOT NULL,
  carryover_days integer NOT NULL CHECK (carryover_days >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fine_ledger_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_return_receipts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.fine_ledger_adjustments, public.rental_return_receipts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.fine_ledger_adjustments, public.rental_return_receipts TO service_role;
GRANT SELECT ON public.rental_return_receipts TO authenticated;

CREATE POLICY "Members read their own rental return receipts"
  ON public.rental_return_receipts FOR SELECT TO authenticated
  USING (member_id IN (SELECT id FROM public.member_profiles WHERE user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.request_rental_return(
  p_rental_id uuid,
  p_payment_method text DEFAULT NULL,
  p_transaction_id text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_member public.member_profiles%ROWTYPE;
  v_rental public.rentals%ROWTYPE;
  v_total_fines numeric(10,2);
  v_related_fine_id uuid;
  v_txid text := pg_catalog.regexp_replace(pg_catalog.btrim(COALESCE(p_transaction_id, '')), '[[:space:]]+', '', 'g');
  v_now timestamptz;
  v_next_fine_date date;
  v_last_fine_date date;
  v_attempt integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sign in before requesting a return.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_member
  FROM public.member_profiles AS member
  WHERE member.user_id = v_user_id
  FOR SHARE;

  IF NOT FOUND OR v_member.membership_status <> 'active' THEN
    RAISE EXCEPTION 'An active member profile is required to request a return.' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_rental
  FROM public.rentals AS rental
  WHERE rental.id = p_rental_id AND rental.member_id = v_member.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rental not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_rental.status NOT IN ('active', 'overdue', 'return_requested') OR v_rental.returned_at IS NOT NULL THEN
    RAISE EXCEPTION 'Only a handed-over book can be returned.' USING ERRCODE = '55000';
  END IF;

  FOR v_attempt IN 1..128 LOOP
    PERFORM public.accrue_overdue_fines();

    SELECT cursor.next_fine_date INTO v_next_fine_date
    FROM public.fine_accrual_cursors AS cursor
    WHERE cursor.rental_id = v_rental.id;

    v_last_fine_date := ((pg_catalog.clock_timestamp() AT TIME ZONE 'Asia/Dhaka')::date) - 1;

    IF NOT FOUND OR v_next_fine_date > v_last_fine_date THEN
      EXIT;
    END IF;
  END LOOP;

  SELECT COALESCE(pg_catalog.sum(fine.amount_bdt), 0),
         (pg_catalog.array_agg(fine.id ORDER BY fine.fine_date, fine.id))[1]
  INTO v_total_fines, v_related_fine_id
  FROM public.fine_ledger AS fine
  WHERE fine.member_id = v_member.id
    AND fine.status = 'outstanding';

  IF v_total_fines > 0 THEN
    IF p_payment_method IS NULL
       OR p_payment_method NOT IN ('bkash', 'nagad')
       OR v_txid !~ '^[A-Za-z0-9-]{6,64}$' THEN
      RAISE EXCEPTION 'Submit bKash or Nagad and a valid TXID to pay the outstanding fine and request return.' USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.payment_submissions AS payment
      WHERE payment.transaction_id = v_txid
        AND payment.status IN ('pending', 'approved')
    ) THEN
      RAISE EXCEPTION 'This TXID has already been submitted.' USING ERRCODE = '23505';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.payment_submissions AS payment
      WHERE payment.member_id = v_member.id
        AND payment.payment_type = 'fine'
        AND payment.status = 'pending'
    ) THEN
      RAISE EXCEPTION 'A fine payment is already awaiting verification.' USING ERRCODE = '23505';
    END IF;

    INSERT INTO public.payment_submissions (
      member_id,
      payment_type,
      related_fine_id,
      payment_method,
      amount_bdt,
      transaction_id,
      status
    ) VALUES (
      v_member.id,
      'fine',
      v_related_fine_id,
      p_payment_method,
      v_total_fines,
      v_txid,
      'pending'
    );
  ELSIF p_transaction_id IS NOT NULL OR p_payment_method IS NOT NULL THEN
    RAISE EXCEPTION 'There are no outstanding fines for this rental.' USING ERRCODE = '22023';
  END IF;

  IF v_rental.status = 'return_requested' AND v_total_fines = 0 THEN
    RETURN 'already_requested';
  END IF;

  IF v_rental.status <> 'return_requested' THEN
    v_now := pg_catalog.clock_timestamp();

    UPDATE public.rentals AS rental
    SET status = 'return_requested',
        return_requested_at = v_now,
        updated_at = v_now
    WHERE rental.id = v_rental.id
      AND rental.status IN ('active', 'overdue');

    IF NOT FOUND THEN
      RAISE EXCEPTION 'The return request could not be recorded.' USING ERRCODE = '55000';
    END IF;
  END IF;

  RETURN CASE
    WHEN v_total_fines > 0 THEN 'payment_pending_return_requested'
    ELSE 'return_requested'
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_subscription_renewal(
  p_payment_method text,
  p_transaction_id text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_member public.member_profiles%ROWTYPE;
  v_plan public.subscription_plans%ROWTYPE;
  v_txid text := pg_catalog.regexp_replace(pg_catalog.btrim(COALESCE(p_transaction_id, '')), '[[:space:]]+', '', 'g');
  v_payment_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sign in before renewing.' USING ERRCODE = '42501';
  END IF;

  IF p_payment_method NOT IN ('bkash', 'nagad') OR v_txid !~ '^[A-Za-z0-9-]{6,64}$' THEN
    RAISE EXCEPTION 'Choose bKash or Nagad and enter a valid TXID.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_member
  FROM public.member_profiles AS member
  WHERE member.user_id = v_user_id
  FOR SHARE;

  IF NOT FOUND OR v_member.membership_status <> 'active' OR v_member.current_plan_id IS NULL THEN
    RAISE EXCEPTION 'An active member with an assigned rental plan is required.' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_plan
  FROM public.subscription_plans AS plan
  WHERE plan.id = v_member.current_plan_id
    AND plan.is_active = true
    AND plan.duration_days = 30
  FOR SHARE;

  IF NOT FOUND OR v_plan.price_bdt <= 0 THEN
    RAISE EXCEPTION 'An active 30-day plan is required.' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.member_subscriptions AS subscription
    WHERE subscription.member_id = v_member.id
      AND subscription.plan_id = v_plan.id
      AND subscription.status = 'active'
      AND subscription.ends_at > pg_catalog.clock_timestamp()
  ) THEN
    RAISE EXCEPTION 'Your current 30-day cycle is still active.' USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.payment_submissions AS payment
    WHERE payment.member_id = v_member.id
      AND payment.payment_type = 'renewal'
      AND payment.status = 'pending'
  ) THEN
    RAISE EXCEPTION 'A renewal payment is already awaiting verification.' USING ERRCODE = '23505';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.payment_submissions AS payment
    WHERE payment.transaction_id = v_txid
      AND payment.status IN ('pending', 'approved')
  ) THEN
    RAISE EXCEPTION 'This TXID has already been submitted.' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.payment_submissions (
    member_id,
    payment_type,
    payment_method,
    amount_bdt,
    transaction_id,
    status
  )
  VALUES (
    v_member.id,
    'renewal',
    p_payment_method,
    v_plan.price_bdt,
    v_txid,
    'pending'
  )
  RETURNING id INTO v_payment_id;

  RETURN v_payment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_member_payment_submission(
  p_payment_id uuid,
  p_reviewer_session_id uuid,
  p_approve boolean,
  p_admin_note text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_payment public.payment_submissions%ROWTYPE;
  v_member public.member_profiles%ROWTYPE;
  v_plan public.subscription_plans%ROWTYPE;
  v_total_outstanding numeric(10,2);
  v_note text := pg_catalog.left(pg_catalog.btrim(COALESCE(p_admin_note, '')), 1000);
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.admin_sessions AS session
    WHERE session.id = p_reviewer_session_id
      AND session.expires_at > v_now
  ) THEN
    RAISE EXCEPTION 'Admin session is no longer valid.' USING ERRCODE = '42501';
  END IF;

  IF p_approve IS NULL THEN
    RAISE EXCEPTION 'A review decision is required.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_payment
  FROM public.payment_submissions AS payment
  WHERE payment.id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND OR v_payment.payment_type NOT IN ('fine', 'renewal') THEN
    RAISE EXCEPTION 'Fine or renewal payment not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_payment.status <> 'pending' THEN
    RETURN CASE
      WHEN v_payment.status = 'approved' THEN 'already_approved'
      ELSE 'already_rejected'
    END;
  END IF;

  SELECT * INTO v_member
  FROM public.member_profiles AS member
  WHERE member.id = v_payment.member_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found.' USING ERRCODE = 'P0002';
  END IF;

  IF p_approve AND v_payment.payment_type = 'fine' THEN
    SELECT COALESCE(pg_catalog.sum(fine.amount_bdt), 0)
    INTO v_total_outstanding
    FROM public.fine_ledger AS fine
    WHERE fine.member_id = v_member.id
      AND fine.status = 'outstanding';

    IF v_payment.related_fine_id IS NULL
       OR NOT EXISTS (
            SELECT 1
            FROM public.fine_ledger AS anchor
            WHERE anchor.id = v_payment.related_fine_id
              AND anchor.member_id = v_member.id
              AND anchor.status = 'outstanding'
          )
       OR v_total_outstanding <= 0
       OR v_total_outstanding <> v_payment.amount_bdt THEN
      RAISE EXCEPTION 'The submitted fine payment no longer matches the member outstanding balance.' USING ERRCODE = '23514';
    END IF;
  ELSIF p_approve AND v_payment.payment_type = 'renewal' THEN
    IF v_member.membership_status <> 'active' OR v_member.current_plan_id IS NULL THEN
      RAISE EXCEPTION 'The member is not eligible for renewal.' USING ERRCODE = '23514';
    END IF;

    SELECT * INTO v_plan
    FROM public.subscription_plans AS plan
    WHERE plan.id = v_member.current_plan_id
      AND plan.is_active = true
      AND plan.duration_days = 30
    FOR SHARE;

    IF NOT FOUND OR v_payment.amount_bdt <> v_plan.price_bdt THEN
      RAISE EXCEPTION 'The renewal amount does not match the active 30-day plan.' USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.member_subscriptions AS subscription
      WHERE subscription.member_id = v_member.id
        AND subscription.plan_id = v_plan.id
        AND subscription.status = 'active'
        AND subscription.ends_at > v_now
    ) THEN
      RAISE EXCEPTION 'The member already has an active 30-day cycle.' USING ERRCODE = '55000';
    END IF;
  END IF;

  UPDATE public.payment_submissions AS payment
  SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
      reviewed_at = v_now,
      reviewed_by = p_reviewer_session_id,
      admin_note = NULLIF(v_note, '')
  WHERE payment.id = v_payment.id
    AND payment.status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment was already reviewed.' USING ERRCODE = '55000';
  END IF;

  IF NOT p_approve THEN
    RETURN 'rejected';
  END IF;

  IF v_payment.payment_type = 'fine' THEN
    UPDATE public.fine_ledger AS fine
    SET status = 'paid',
        paid_at = v_now,
        payment_submission_id = v_payment.id
    WHERE fine.member_id = v_member.id
      AND fine.status = 'outstanding';
  ELSE
    UPDATE public.member_subscriptions AS subscription
    SET status = 'expired',
        updated_at = v_now
    WHERE subscription.member_id = v_member.id
      AND subscription.status = 'active';

    INSERT INTO public.member_subscriptions (
      member_id,
      plan_id,
      plan_name_snapshot,
      plan_price_snapshot,
      status,
      started_at,
      ends_at
    ) VALUES (
      v_member.id,
      v_plan.id,
      v_plan.name,
      v_plan.price_bdt,
      'active',
      v_now,
      v_now + pg_catalog.make_interval(days => 30)
    );

    UPDATE public.member_profiles
    SET current_plan_id = v_plan.id,
        updated_at = v_now
    WHERE id = v_member.id;
  END IF;

  RETURN 'approved';
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_review_fine(
  p_fine_id uuid,
  p_admin_session_id uuid,
  p_action text,
  p_amount_bdt numeric DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_fine public.fine_ledger%ROWTYPE;
  v_new_amount numeric(10,2);
  v_new_status text;
  v_note text := pg_catalog.left(pg_catalog.btrim(COALESCE(p_note, '')), 1000);
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.admin_sessions AS session
    WHERE session.id = p_admin_session_id
      AND session.expires_at > v_now
  ) THEN
    RAISE EXCEPTION 'Admin session is no longer valid.' USING ERRCODE = '42501';
  END IF;

  IF p_action NOT IN ('override', 'waive') OR pg_catalog.length(v_note) < 3 THEN
    RAISE EXCEPTION 'Choose an action and provide a short audit note.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_fine
  FROM public.fine_ledger AS fine
  WHERE fine.id = p_fine_id
  FOR UPDATE;

  IF NOT FOUND OR v_fine.status <> 'outstanding' THEN
    RAISE EXCEPTION 'Only outstanding fines can be adjusted.' USING ERRCODE = '55000';
  END IF;

  IF p_action = 'override' THEN
    IF p_amount_bdt IS NULL OR p_amount_bdt <= 0 OR p_amount_bdt > 1000000 THEN
      RAISE EXCEPTION 'Enter an override greater than BDT 0 and no more than BDT 1,000,000; use waive to forgive a fine.' USING ERRCODE = '22023';
    END IF;
    v_new_amount := p_amount_bdt;
    v_new_status := 'outstanding';
  ELSE
    v_new_amount := v_fine.amount_bdt;
    v_new_status := 'waived';
  END IF;

  INSERT INTO public.fine_ledger_adjustments (
    fine_id,
    admin_session_id,
    action,
    previous_amount_bdt,
    new_amount_bdt,
    previous_status,
    new_status,
    note
  ) VALUES (
    v_fine.id,
    p_admin_session_id,
    p_action,
    v_fine.amount_bdt,
    v_new_amount,
    v_fine.status,
    v_new_status,
    v_note
  );

  UPDATE public.fine_ledger AS fine
  SET amount_bdt = v_new_amount,
      original_amount_bdt = COALESCE(fine.original_amount_bdt, v_fine.amount_bdt),
      status = v_new_status,
      reviewed_by = p_admin_session_id,
      review_note = v_note
  WHERE fine.id = v_fine.id;

  RETURN v_new_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_send_fine_reminder(p_fine_id uuid, p_admin_session_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_fine public.fine_ledger%ROWTYPE;
  v_now timestamptz := pg_catalog.clock_timestamp();
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.admin_sessions AS session
    WHERE session.id = p_admin_session_id
      AND session.expires_at > v_now
  ) THEN
    RAISE EXCEPTION 'Admin session is no longer valid.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_fine
  FROM public.fine_ledger AS fine
  WHERE fine.id = p_fine_id
  FOR SHARE;

  IF NOT FOUND OR v_fine.status <> 'outstanding' THEN
    RAISE EXCEPTION 'Only outstanding fines can receive a reminder.' USING ERRCODE = '55000';
  END IF;

  RETURN public.enqueue_member_notification(
    v_fine.member_id,
    'fine_created',
    'Outstanding library fine',
    pg_catalog.format('Your fine of BDT %s remains unpaid. Submit its TXID from your Payments page.', v_fine.amount_bdt),
    pg_catalog.format('fine-reminder:%s:%s', v_fine.id, (v_now AT TIME ZONE 'Asia/Dhaka')::date)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.receive_rental(p_rental_id uuid, p_reviewer_session_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_rental public.rentals%ROWTYPE;
  v_book public.books%ROWTYPE;
  v_created_credit boolean := false;
  v_days integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.admin_sessions AS session
    WHERE session.id = p_reviewer_session_id
      AND session.expires_at > v_now
  ) THEN
    RAISE EXCEPTION 'Admin session is no longer valid.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_rental
  FROM public.rentals AS rental
  WHERE rental.id = p_rental_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rental not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_rental.status = 'returned' THEN
    RETURN 'already_returned';
  END IF;

  IF v_rental.status NOT IN ('active', 'overdue', 'return_requested') OR v_rental.returned_at IS NOT NULL THEN
    RAISE EXCEPTION 'Only a handed-over book can be received.' USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_book
  FROM public.books AS book
  WHERE book.id = v_rental.book_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Book record not found.' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.rentals AS rental
  SET status = 'returned',
      returned_at = v_now,
      updated_at = v_now
  WHERE rental.id = v_rental.id
    AND rental.status IN ('active', 'overdue', 'return_requested');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The rental was already received.' USING ERRCODE = '55000';
  END IF;

  UPDATE public.books
  SET availability = 'available',
      updated_at = v_now
  WHERE id = v_book.id;

  IF v_rental.subscription_ends_at IS NOT NULL AND v_rental.subscription_ends_at > v_now THEN
    v_days := GREATEST(
      0,
      CEIL(EXTRACT(EPOCH FROM (v_rental.subscription_ends_at - v_now)) / 86400)::integer
    );

    INSERT INTO public.rental_day_credits (
      member_id,
      source_rental_id,
      expires_at,
      status
    ) VALUES (
      v_rental.member_id,
      v_rental.id,
      v_rental.subscription_ends_at,
      'available'
    )
    ON CONFLICT (source_rental_id) DO NOTHING;

    v_created_credit := FOUND;
  END IF;

  INSERT INTO public.rental_return_receipts (
    rental_id,
    member_id,
    admin_session_id,
    received_at,
    due_at,
    returned_early,
    carryover_days
  ) VALUES (
    v_rental.id,
    v_rental.member_id,
    p_reviewer_session_id,
    v_now,
    COALESCE(v_rental.subscription_ends_at, v_now),
    COALESCE(v_rental.subscription_ends_at > v_now, false),
    CASE WHEN v_created_credit THEN v_days ELSE 0 END
  );

  RETURN CASE
    WHEN v_created_credit THEN 'returned_with_credit'
    ELSE 'returned'
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.request_rental_return(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_rental_return(uuid, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.submit_subscription_renewal(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_subscription_renewal(text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.review_member_payment_submission(uuid, uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_member_payment_submission(uuid, uuid, boolean, text) TO service_role;

REVOKE ALL ON FUNCTION public.admin_review_fine(uuid, uuid, text, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_fine(uuid, uuid, text, numeric, text) TO service_role;

REVOKE ALL ON FUNCTION public.admin_send_fine_reminder(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_send_fine_reminder(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.receive_rental(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.receive_rental(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_member_transactional_sms()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.channel = 'in_app'
     AND NEW.status = 'pending'
     AND NEW.event_key IS NOT NULL
     AND NEW.type IN (
       'subscription_expiring',
       'subscription_expired',
       'book_issued',
       'book_returned',
       'payment_approved',
       'payment_rejected',
       'fine_created'
     ) THEN
    INSERT INTO public.notifications (
      member_id,
      type,
      title,
      message,
      channel,
      scheduled_at,
      status,
      event_key
    ) VALUES (
      NEW.member_id,
      NEW.type,
      NEW.title,
      NEW.message,
      'sms',
      COALESCE(NEW.scheduled_at, pg_catalog.clock_timestamp()),
      'pending',
      pg_catalog.format('%s:sms', NEW.event_key)
    )
    ON CONFLICT (member_id, event_key) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notifications_enqueue_transactional_sms ON public.notifications;
CREATE TRIGGER notifications_enqueue_transactional_sms
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_member_transactional_sms();

REVOKE ALL ON FUNCTION public.enqueue_member_transactional_sms() FROM PUBLIC, anon, authenticated, service_role;
