ALTER TABLE public.member_profiles
  ADD COLUMN IF NOT EXISTS rental_subscription_start timestamptz,
  ADD COLUMN IF NOT EXISTS rental_subscription_expires_at timestamptz;

UPDATE public.member_profiles AS member
SET rental_subscription_start = (
      SELECT subscription.started_at
      FROM public.member_subscriptions AS subscription
      WHERE subscription.member_id = member.id
        AND (member.current_plan_id IS NULL OR subscription.plan_id = member.current_plan_id)
      ORDER BY subscription.started_at DESC, subscription.ends_at DESC, subscription.id DESC
      LIMIT 1
    ),
    rental_subscription_expires_at = (
      SELECT subscription.ends_at
      FROM public.member_subscriptions AS subscription
      WHERE subscription.member_id = member.id
        AND (member.current_plan_id IS NULL OR subscription.plan_id = member.current_plan_id)
      ORDER BY subscription.started_at DESC, subscription.ends_at DESC, subscription.id DESC
      LIMIT 1
    )
WHERE EXISTS (
  SELECT 1 FROM public.member_subscriptions AS subscription
  WHERE subscription.member_id = member.id
    AND (member.current_plan_id IS NULL OR subscription.plan_id = member.current_plan_id)
);

CREATE OR REPLACE FUNCTION public.sync_member_rental_subscription_period()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  UPDATE public.member_profiles AS member
  SET rental_subscription_start = NEW.started_at,
      rental_subscription_expires_at = NEW.ends_at,
      updated_at = pg_catalog.clock_timestamp()
  WHERE member.id = NEW.member_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS member_subscriptions_sync_rental_period ON public.member_subscriptions;
CREATE TRIGGER member_subscriptions_sync_rental_period
  AFTER INSERT OR UPDATE OF started_at, ends_at ON public.member_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.sync_member_rental_subscription_period();

REVOKE ALL ON FUNCTION public.sync_member_rental_subscription_period() FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.review_membership_application(
  p_application_id uuid,
  p_plan_id uuid,
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
  v_application public.membership_applications%ROWTYPE;
  v_member public.member_profiles%ROWTYPE;
  v_payment public.payment_submissions%ROWTYPE;
  v_plan public.subscription_plans%ROWTYPE;
  v_membership_fee numeric(12, 2);
  v_payment_count integer;
  v_note text := COALESCE(
    NULLIF(pg_catalog.btrim(p_admin_note), ''),
    CASE WHEN p_approve THEN 'Membership approved.' ELSE 'Membership rejected.' END
  );
BEGIN
  IF p_approve IS NULL THEN
    RAISE EXCEPTION 'A review decision is required.' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.admin_sessions AS session
    WHERE session.id = p_reviewer_session_id AND session.expires_at > v_now
  ) THEN
    RAISE EXCEPTION 'Admin session is no longer valid.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_application
  FROM public.membership_applications AS application
  WHERE application.id = p_application_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Membership application not found.' USING ERRCODE = 'P0002';
  END IF;
  IF p_approve AND v_application.status = 'approved' THEN
    RETURN 'already_approved';
  END IF;
  IF NOT p_approve AND v_application.status = 'rejected' THEN
    RETURN 'already_rejected';
  END IF;
  IF v_application.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending membership applications can be reviewed.' USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_member
  FROM public.member_profiles AS member
  WHERE member.id = v_application.member_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Membership profile not found.' USING ERRCODE = 'P0002';
  END IF;

  SELECT pg_catalog.count(*) INTO v_payment_count
  FROM public.payment_submissions AS payment
  WHERE payment.related_membership_application_id = v_application.id
    AND payment.payment_type = 'membership';
  IF v_payment_count > 1 OR (p_approve AND v_payment_count <> 1) THEN
    RAISE EXCEPTION 'A unique membership payment submission is required.' USING ERRCODE = '23514';
  END IF;

  IF v_payment_count = 1 THEN
    SELECT * INTO v_payment
    FROM public.payment_submissions AS payment
    WHERE payment.related_membership_application_id = v_application.id
      AND payment.payment_type = 'membership'
    FOR UPDATE;
    IF v_payment.member_id <> v_application.member_id
      OR v_payment.amount_bdt <> v_application.amount_bdt
      OR v_payment.payment_method <> v_application.payment_method
      OR v_payment.transaction_id <> v_application.transaction_id THEN
      RAISE EXCEPTION 'The payment details do not match this application.' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF p_approve THEN
    SELECT setting.value_number INTO v_membership_fee
    FROM public.library_settings AS setting
    WHERE setting.key = 'membership_fee_bdt'
    FOR SHARE;
    IF v_membership_fee IS DISTINCT FROM 99.00
      OR v_application.amount_bdt <> v_membership_fee
      OR v_payment.amount_bdt <> v_membership_fee
      OR v_payment.status <> 'pending' THEN
      RAISE EXCEPTION 'A pending payment for the configured ৳99 membership fee is required.' USING ERRCODE = '23514';
    END IF;

    SELECT * INTO v_plan
    FROM public.subscription_plans AS plan
    WHERE plan.id = p_plan_id AND plan.is_active = true
    FOR SHARE;
    IF NOT FOUND OR v_plan.duration_days <> 30 OR v_plan.price_bdt NOT IN (29.00, 49.00) THEN
      RAISE EXCEPTION 'Choose an active 30-day subscription plan priced at ৳29 or ৳49.' USING ERRCODE = '23514';
    END IF;
    IF v_member.membership_status IN ('active', 'suspended') THEN
      RAISE EXCEPTION 'This member is not eligible for activation.' USING ERRCODE = '55000';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.member_subscriptions AS subscription
      WHERE subscription.member_id = v_member.id
        AND subscription.status = 'active'
        AND subscription.ends_at > v_now
    ) THEN
      RAISE EXCEPTION 'An active subscription already exists for this member.' USING ERRCODE = '23505';
    END IF;

    UPDATE public.payment_submissions
    SET status = 'approved', reviewed_at = v_now,
        reviewed_by = p_reviewer_session_id, admin_note = v_note
    WHERE id = v_payment.id AND status = 'pending';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The payment has already been reviewed.' USING ERRCODE = '55000';
    END IF;

    UPDATE public.member_profiles
    SET membership_status = 'active',
        current_plan_id = v_plan.id,
        rental_subscription_start = NULL,
        rental_subscription_expires_at = NULL,
        updated_at = v_now
    WHERE id = v_member.id;

    UPDATE public.membership_applications
    SET status = 'approved', reviewed_at = v_now,
        reviewed_by = p_reviewer_session_id, admin_note = v_note
    WHERE id = v_application.id AND status = 'pending';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The application has already been reviewed.' USING ERRCODE = '55000';
    END IF;
    RETURN 'approved';
  END IF;

  IF v_member.membership_status IN ('active', 'suspended') THEN
    RAISE EXCEPTION 'An active or suspended membership cannot be rejected through this application.' USING ERRCODE = '55000';
  END IF;
  IF v_payment_count = 1 AND v_payment.status = 'approved' THEN
    RAISE EXCEPTION 'An approved payment cannot be rejected as a pending application.' USING ERRCODE = '55000';
  END IF;
  IF v_payment_count = 1 AND v_payment.status = 'pending' THEN
    UPDATE public.payment_submissions
    SET status = 'rejected', reviewed_at = v_now,
        reviewed_by = p_reviewer_session_id, admin_note = v_note
    WHERE id = v_payment.id AND status = 'pending';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The payment has already been reviewed.' USING ERRCODE = '55000';
    END IF;
  END IF;

  UPDATE public.member_profiles
  SET membership_status = 'rejected', updated_at = v_now
  WHERE id = v_member.id;
  UPDATE public.membership_applications
  SET status = 'rejected', reviewed_at = v_now,
      reviewed_by = p_reviewer_session_id, admin_note = v_note
  WHERE id = v_application.id AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The application has already been reviewed.' USING ERRCODE = '55000';
  END IF;
  RETURN 'rejected';
END;
$$;

DROP POLICY IF EXISTS "Members create own rental requests" ON public.rental_requests;
CREATE POLICY "Members create own rental requests"
  ON public.rental_requests FOR INSERT TO authenticated
  WITH CHECK (
    member_id IN (SELECT id FROM public.member_profiles WHERE user_id = auth.uid())
    AND status = 'pending'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND admin_note IS NULL
    AND subscription_plan_id IS NOT NULL
    AND rental_day_credit_id IS NULL
    AND amount_bdt >= 0
  );

CREATE OR REPLACE FUNCTION public.enforce_active_subscription_for_rental_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_member public.member_profiles%ROWTYPE;
  v_plan public.subscription_plans%ROWTYPE;
  v_has_active_subscription boolean;
BEGIN
  SELECT * INTO v_member
  FROM public.member_profiles AS member
  WHERE member.id = NEW.member_id
  FOR SHARE;
  IF NOT FOUND OR v_member.membership_status <> 'active'
    OR v_member.current_plan_id IS DISTINCT FROM NEW.subscription_plan_id THEN
    RAISE EXCEPTION 'An active member with the assigned rental plan is required.' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_plan
  FROM public.subscription_plans AS plan
  WHERE plan.id = NEW.subscription_plan_id
  FOR SHARE;
  IF NOT FOUND
    OR v_plan.is_active IS NOT TRUE OR v_plan.duration_days <> 30 OR v_plan.price_bdt <= 0 THEN
    RAISE EXCEPTION 'An active member and assigned 30-day plan are required for a rental request.' USING ERRCODE = '23514';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.member_subscriptions AS subscription
    WHERE subscription.member_id = NEW.member_id
      AND subscription.plan_id = NEW.subscription_plan_id
      AND subscription.status = 'active'
      AND subscription.ends_at > pg_catalog.clock_timestamp()
  ) INTO v_has_active_subscription;

  IF v_has_active_subscription THEN
    IF NEW.amount_bdt <> 0 OR NEW.rental_day_credit_id IS NOT NULL THEN
      RAISE EXCEPTION 'Requests during an active subscription do not require another payment.' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.member_subscriptions AS subscription
      WHERE subscription.member_id = NEW.member_id
    ) THEN
      RAISE EXCEPTION 'The rental subscription has expired; submit a renewal payment first.' USING ERRCODE = '23514';
    END IF;
    IF NEW.amount_bdt <> v_plan.price_bdt OR NEW.rental_day_credit_id IS NOT NULL THEN
      RAISE EXCEPTION 'The first rental request must include one 30-day subscription payment.' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_rental_request(
  p_request_id uuid,
  p_reviewer_session_id uuid,
  p_admin_note text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_request public.rental_requests%ROWTYPE;
  v_payment public.payment_submissions%ROWTYPE;
  v_member public.member_profiles%ROWTYPE;
  v_subscription public.member_subscriptions%ROWTYPE;
  v_plan public.subscription_plans%ROWTYPE;
  v_book public.books%ROWTYPE;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_note text := COALESCE(NULLIF(pg_catalog.btrim(p_admin_note), ''), 'Rental approved and ready for handover.');
  v_has_payment boolean := false;
  v_start_subscription boolean := false;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_sessions AS session
    WHERE session.id = p_reviewer_session_id AND session.expires_at > v_now
  ) THEN
    RAISE EXCEPTION 'Admin session is no longer valid.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_request
  FROM public.rental_requests AS request
  WHERE request.id = p_request_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rental request not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_request.status = 'approved' THEN
    RETURN 'already_approved';
  END IF;
  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending rental requests can be approved.' USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_member
  FROM public.member_profiles AS member
  WHERE member.id = v_request.member_id
  FOR UPDATE;
  IF NOT FOUND OR v_member.membership_status <> 'active'
    OR v_member.current_plan_id IS DISTINCT FROM v_request.subscription_plan_id THEN
    RAISE EXCEPTION 'The member is not eligible for this rental plan.' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_plan
  FROM public.subscription_plans AS plan
  WHERE plan.id = v_request.subscription_plan_id
    AND plan.is_active = true AND plan.duration_days = 30 AND plan.price_bdt > 0
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'An active 30-day rental plan is required.' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_subscription
  FROM public.member_subscriptions AS subscription
  WHERE subscription.member_id = v_request.member_id
    AND subscription.plan_id = v_request.subscription_plan_id
    AND subscription.status = 'active'
    AND subscription.ends_at > v_now
  ORDER BY subscription.ends_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF v_request.amount_bdt <> 0 OR v_request.rental_day_credit_id IS NOT NULL THEN
      RAISE EXCEPTION 'A member with an active subscription must not be charged per book.' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.payment_submissions AS payment
      WHERE payment.payment_type = 'rental' AND payment.related_rental_request_id = v_request.id
    ) THEN
      RAISE EXCEPTION 'A subscription-covered rental must not include a separate payment.' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.member_subscriptions AS subscription
      WHERE subscription.member_id = v_request.member_id
    ) THEN
      RAISE EXCEPTION 'The member must renew their expired subscription before requesting another book.' USING ERRCODE = '23514';
    END IF;
    IF v_request.amount_bdt <> v_plan.price_bdt OR v_request.rental_day_credit_id IS NOT NULL THEN
      RAISE EXCEPTION 'The first rental request must match the 30-day subscription price.' USING ERRCODE = '23514';
    END IF;
    SELECT * INTO v_payment
    FROM public.payment_submissions AS payment
    WHERE payment.payment_type = 'rental'
      AND payment.related_rental_request_id = v_request.id
    FOR UPDATE;
    v_has_payment := FOUND;
    IF NOT v_has_payment OR v_payment.member_id <> v_request.member_id
      OR v_payment.status <> 'pending'
      OR v_payment.amount_bdt <> v_plan.price_bdt THEN
      RAISE EXCEPTION 'A matching pending first-subscription payment is required.' USING ERRCODE = '23514';
    END IF;
    v_start_subscription := true;
  END IF;

  SELECT * INTO v_book
  FROM public.books AS book
  WHERE book.id = v_request.book_id
  FOR UPDATE;
  IF NOT FOUND OR v_book.is_active IS NOT TRUE OR v_book.availability <> 'available' THEN
    RAISE EXCEPTION 'The requested book is no longer available.' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.rentals AS rental
    WHERE rental.rental_request_id = v_request.id
       OR (rental.book_id = v_request.book_id AND rental.status IN ('pending', 'active', 'overdue', 'return_requested'))
  ) THEN
    RAISE EXCEPTION 'A conflicting rental already exists.' USING ERRCODE = '23505';
  END IF;

  IF v_start_subscription THEN
    INSERT INTO public.member_subscriptions (
      member_id, plan_id, plan_name_snapshot, plan_price_snapshot,
      status, started_at, ends_at
    ) VALUES (
      v_member.id, v_plan.id, v_plan.name, v_plan.price_bdt,
      'active', v_now, v_now + pg_catalog.make_interval(days => 30)
    );
  END IF;

  INSERT INTO public.rentals (
    rental_request_id, member_id, book_id, subscription_plan_id,
    plan_name_snapshot, plan_price_snapshot, started_at, subscription_ends_at, status
  ) VALUES (
    v_request.id, v_request.member_id, v_request.book_id, v_plan.id,
    v_plan.name, v_plan.price_bdt, NULL, NULL, 'pending'
  );

  UPDATE public.books AS book
  SET availability = 'unavailable', updated_at = v_now
  WHERE book.id = v_book.id AND book.availability = 'available';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The requested book is no longer available.' USING ERRCODE = '23514';
  END IF;

  UPDATE public.rental_requests AS request
  SET status = 'approved', reviewed_at = v_now,
      reviewed_by = p_reviewer_session_id, admin_note = v_note
  WHERE request.id = v_request.id AND request.status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The rental request was already processed.' USING ERRCODE = '55000';
  END IF;

  IF v_has_payment THEN
    UPDATE public.payment_submissions AS payment
    SET status = 'approved', reviewed_at = v_now,
        reviewed_by = p_reviewer_session_id, admin_note = v_note
    WHERE payment.id = v_payment.id AND payment.status = 'pending';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The first-subscription payment was already reviewed.' USING ERRCODE = '55000';
    END IF;
  END IF;

  INSERT INTO public.notifications (member_id, type, title, message, channel, status)
  VALUES (
    v_request.member_id,
    'rental_approved',
    'Rental request approved',
    CASE WHEN v_start_subscription
      THEN pg_catalog.format('Your first rental request for %s was approved. Your 30-day subscription starts today.', v_book.title)
      ELSE pg_catalog.format('Your request for %s is approved and waiting for book handover.', v_book.title)
    END,
    'in_app',
    'pending'
  );

  RETURN 'approved';
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
  WHERE plan.id = v_member.current_plan_id AND plan.is_active = true AND plan.duration_days = 30
  FOR SHARE;
  IF NOT FOUND OR v_plan.price_bdt <= 0 THEN
    RAISE EXCEPTION 'An active 30-day plan is required.' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.member_subscriptions AS subscription
    WHERE subscription.member_id = v_member.id AND subscription.plan_id = v_plan.id
  ) THEN
    RAISE EXCEPTION 'Submit the first subscription payment with your first book request.' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.member_subscriptions AS subscription
    WHERE subscription.member_id = v_member.id AND subscription.plan_id = v_plan.id
      AND subscription.status = 'active' AND subscription.ends_at > pg_catalog.clock_timestamp()
  ) THEN
    RAISE EXCEPTION 'Your current 30-day cycle is still active.' USING ERRCODE = '55000';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.payment_submissions AS payment
    WHERE payment.member_id = v_member.id AND payment.payment_type = 'renewal' AND payment.status = 'pending'
  ) THEN
    RAISE EXCEPTION 'A renewal payment is already awaiting verification.' USING ERRCODE = '23505';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.payment_submissions AS payment
    WHERE payment.transaction_id = v_txid AND payment.status IN ('pending', 'approved')
  ) THEN
    RAISE EXCEPTION 'This TXID has already been submitted.' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.payment_submissions (
    member_id, payment_type, payment_method, amount_bdt, transaction_id, status
  ) VALUES (
    v_member.id, 'renewal', p_payment_method, v_plan.price_bdt, v_txid, 'pending'
  ) RETURNING id INTO v_payment_id;
  RETURN v_payment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.review_membership_application(uuid, uuid, uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_membership_application(uuid, uuid, uuid, boolean, text) TO service_role;
REVOKE ALL ON FUNCTION public.enforce_active_subscription_for_rental_request() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.approve_rental_request(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_rental_request(uuid, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.submit_subscription_renewal(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_subscription_renewal(text, text) TO authenticated;
