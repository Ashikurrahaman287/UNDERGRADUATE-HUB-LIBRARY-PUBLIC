ALTER TABLE public.rental_requests
  ADD COLUMN IF NOT EXISTS rental_day_credit_id uuid;

ALTER TABLE public.rentals
  ALTER COLUMN started_at DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.rental_day_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.member_profiles(id) ON DELETE CASCADE,
  source_rental_id uuid NOT NULL UNIQUE REFERENCES public.rentals(id) ON DELETE RESTRICT,
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'consumed', 'expired')),
  consumed_by_rental_id uuid UNIQUE REFERENCES public.rentals(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conname = 'rental_requests_rental_day_credit_id_fkey'
      AND conrelid = 'public.rental_requests'::pg_catalog.regclass
  ) THEN
    ALTER TABLE public.rental_requests
      ADD CONSTRAINT rental_requests_rental_day_credit_id_fkey
      FOREIGN KEY (rental_day_credit_id)
      REFERENCES public.rental_day_credits(id)
      ON DELETE RESTRICT;
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS rental_requests_day_credit_unique_idx
  ON public.rental_requests (rental_day_credit_id)
  WHERE rental_day_credit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS rental_day_credits_member_expiry_idx
  ON public.rental_day_credits (member_id, status, expires_at);

ALTER TABLE public.rental_day_credits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rental_day_credits FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.rental_day_credits TO authenticated;
GRANT ALL ON public.rental_day_credits TO service_role;

CREATE POLICY "Members read their own rental day credits"
  ON public.rental_day_credits FOR SELECT TO authenticated
  USING (member_id IN (SELECT id FROM public.member_profiles WHERE user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.reservation_candidate_is_eligible(
  p_reservation_id uuid,
  p_exclude_rental_request_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.reservation_requests AS reservation
    JOIN public.member_profiles AS member ON member.id = reservation.member_id
    JOIN public.books AS book ON book.id = reservation.book_id
    WHERE reservation.id = p_reservation_id
      AND reservation.status IN ('waiting', 'notified')
      AND member.membership_status = 'active'
      AND book.is_active = true
      AND (
        EXISTS (
          SELECT 1
          FROM public.member_subscriptions AS subscription
          JOIN public.subscription_plans AS plan ON plan.id = subscription.plan_id
          WHERE subscription.member_id = member.id
            AND (member.current_plan_id IS NULL OR subscription.plan_id = member.current_plan_id)
            AND subscription.status = 'active'
            AND subscription.ends_at > pg_catalog.statement_timestamp()
            AND plan.is_active = true
        )
        OR EXISTS (
          SELECT 1
          FROM public.rental_day_credits AS credit
          WHERE credit.member_id = member.id
            AND credit.expires_at > pg_catalog.statement_timestamp()
            AND (
              credit.status = 'available'
              OR (
                credit.status = 'reserved'
                AND p_exclude_rental_request_id IS NOT NULL
                AND EXISTS (
                  SELECT 1
                  FROM public.rental_requests AS request
                  WHERE request.id = p_exclude_rental_request_id
                    AND request.rental_day_credit_id = credit.id
                    AND request.member_id = member.id
                    AND request.status = 'pending'
                )
              )
            )
        )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.rentals AS rental
        WHERE rental.member_id = member.id
          AND rental.book_id = reservation.book_id
          AND rental.status IN ('pending', 'active', 'overdue')
          AND (
            p_exclude_rental_request_id IS NULL
            OR rental.rental_request_id IS DISTINCT FROM p_exclude_rental_request_id
          )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.rental_requests AS request
        WHERE request.member_id = member.id
          AND request.book_id = reservation.book_id
          AND request.status IN ('pending', 'approved')
          AND request.reservation_request_id IS DISTINCT FROM reservation.id
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.create_book_reservation(p_book_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_member public.member_profiles%ROWTYPE;
  v_book public.books%ROWTYPE;
  v_reservation_id uuid;
  v_now timestamptz := pg_catalog.clock_timestamp();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sign in before reserving a book.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_member
  FROM public.member_profiles AS member
  WHERE member.user_id = v_user_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'A member profile is required to reserve a book.' USING ERRCODE = '23514';
  END IF;
  IF v_member.membership_status <> 'active' THEN
    RAISE EXCEPTION 'An active library membership is required to reserve a book.' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.member_subscriptions AS subscription
    JOIN public.subscription_plans AS plan ON plan.id = subscription.plan_id
    WHERE subscription.member_id = v_member.id
      AND (v_member.current_plan_id IS NULL OR subscription.plan_id = v_member.current_plan_id)
      AND subscription.status = 'active'
      AND subscription.ends_at > v_now
      AND plan.is_active = true
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.rental_day_credits AS credit
    WHERE credit.member_id = v_member.id
      AND credit.status = 'available'
      AND credit.expires_at > v_now
  ) THEN
    RAISE EXCEPTION 'A current subscription or unexpired rental-day credit is required to reserve a book.' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_book
  FROM public.books AS book
  WHERE book.id = p_book_id
    AND book.is_active = true
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The book was not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_book.availability = 'available' THEN
    RAISE EXCEPTION 'Reservations are available only for books that are currently unavailable.' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.rental_requests AS request
    WHERE request.member_id = v_member.id
      AND request.book_id = v_book.id
      AND request.status IN ('pending', 'approved')
  ) THEN
    RAISE EXCEPTION 'A pending rental request already exists for this book.' USING ERRCODE = '23505';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.rentals AS rental
    WHERE rental.member_id = v_member.id
      AND rental.book_id = v_book.id
      AND rental.status IN ('pending', 'active', 'overdue')
  ) THEN
    RAISE EXCEPTION 'An active rental already exists for this book.' USING ERRCODE = '23505';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.reservation_requests AS reservation
    WHERE reservation.member_id = v_member.id
      AND reservation.book_id = v_book.id
      AND reservation.status IN ('waiting', 'notified')
  ) THEN
    RAISE EXCEPTION 'You already have an active reservation for this book.' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.reservation_requests (member_id, book_id, status, requested_at)
  VALUES (v_member.id, v_book.id, 'waiting', v_now)
  RETURNING id INTO v_reservation_id;

  RETURN v_reservation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_rental_day_credit_for_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_credit public.rental_day_credits%ROWTYPE;
BEGIN
  IF NEW.rental_day_credit_id IS NULL THEN
    IF NEW.amount_bdt <= 0 THEN
      RAISE EXCEPTION 'A paid rental request must have a positive amount.' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.amount_bdt <> 0 THEN
    RAISE EXCEPTION 'A carryover rental request cannot include a new charge.' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_credit
  FROM public.rental_day_credits AS credit
  WHERE credit.id = NEW.rental_day_credit_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_credit.member_id <> NEW.member_id
    OR v_credit.status <> 'available'
    OR v_credit.expires_at <= pg_catalog.clock_timestamp() THEN
    RAISE EXCEPTION 'The remaining rental days are unavailable or expired.' USING ERRCODE = '23514';
  END IF;

  UPDATE public.rental_day_credits
  SET status = 'reserved', updated_at = pg_catalog.clock_timestamp()
  WHERE id = v_credit.id;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_rejected_rental_day_credit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.status = 'pending'
    AND NEW.status = 'rejected'
    AND NEW.rental_day_credit_id IS NOT NULL THEN
    UPDATE public.rental_day_credits AS credit
    SET status = CASE
          WHEN credit.expires_at > pg_catalog.clock_timestamp() THEN 'available'
          ELSE 'expired'
        END,
        updated_at = pg_catalog.clock_timestamp()
    WHERE credit.id = NEW.rental_day_credit_id
      AND credit.status = 'reserved';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rental_requests_reserve_day_credit ON public.rental_requests;
DROP TRIGGER IF EXISTS z_rental_requests_reserve_day_credit ON public.rental_requests;
CREATE TRIGGER z_rental_requests_reserve_day_credit
  BEFORE INSERT ON public.rental_requests
  FOR EACH ROW EXECUTE FUNCTION public.reserve_rental_day_credit_for_request();

DROP TRIGGER IF EXISTS rental_requests_release_rejected_day_credit ON public.rental_requests;
CREATE TRIGGER rental_requests_release_rejected_day_credit
  AFTER UPDATE OF status ON public.rental_requests
  FOR EACH ROW EXECUTE FUNCTION public.release_rejected_rental_day_credit();

DROP POLICY IF EXISTS "Members create own rental requests" ON public.rental_requests;
CREATE POLICY "Members create own rental requests"
  ON public.rental_requests FOR INSERT TO authenticated
  WITH CHECK (
    member_id IN (SELECT id FROM public.member_profiles WHERE user_id = auth.uid())
    AND status = 'pending'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND admin_note IS NULL
    AND (
      (rental_day_credit_id IS NULL AND amount_bdt > 0)
      OR (
        rental_day_credit_id IS NOT NULL
        AND amount_bdt = 0
        AND EXISTS (
          SELECT 1 FROM public.rental_day_credits AS credit
          WHERE credit.id = rental_day_credit_id
            AND credit.member_id = rental_requests.member_id
            AND credit.status = 'reserved'
            AND credit.expires_at > pg_catalog.statement_timestamp()
        )
      )
    )
  );

CREATE OR REPLACE FUNCTION public.enforce_active_subscription_for_rental_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.member_profiles AS member
    JOIN public.subscription_plans AS plan ON plan.id = NEW.subscription_plan_id
    WHERE member.id = NEW.member_id
      AND member.membership_status = 'active'
      AND (member.current_plan_id IS NULL OR member.current_plan_id = NEW.subscription_plan_id)
      AND plan.is_active = true
      AND plan.duration_days = 30
  ) THEN
    RAISE EXCEPTION 'An active member and 30-day plan are required for a rental request.'
      USING ERRCODE = '23514';
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
  v_credit public.rental_day_credits%ROWTYPE;
  v_member public.member_profiles%ROWTYPE;
  v_plan public.subscription_plans%ROWTYPE;
  v_book public.books%ROWTYPE;
  v_started_at timestamptz := pg_catalog.clock_timestamp();
  v_note text := COALESCE(NULLIF(pg_catalog.btrim(p_admin_note), ''), 'Rental approved and ready for handover.');
  v_has_payment boolean := false;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_sessions AS session
    WHERE session.id = p_reviewer_session_id
      AND session.expires_at > v_started_at
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
  FOR SHARE;
  IF NOT FOUND OR v_member.membership_status <> 'active' THEN
    RAISE EXCEPTION 'The member is not eligible for rental.' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_plan
  FROM public.subscription_plans AS plan
  WHERE plan.id = v_request.subscription_plan_id
    AND plan.is_active = true
    AND plan.duration_days = 30
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'An active 30-day rental plan is required.' USING ERRCODE = '23514';
  END IF;

  IF v_request.rental_day_credit_id IS NOT NULL THEN
    SELECT * INTO v_credit
    FROM public.rental_day_credits AS credit
    WHERE credit.id = v_request.rental_day_credit_id
    FOR UPDATE;
    IF NOT FOUND
      OR v_credit.member_id <> v_request.member_id
      OR v_credit.status <> 'reserved'
      OR v_credit.expires_at <= v_started_at
      OR v_request.amount_bdt <> 0 THEN
      RAISE EXCEPTION 'A valid carryover credit is required for this request.' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.payment_submissions AS payment
      WHERE payment.payment_type = 'rental'
        AND payment.related_rental_request_id = v_request.id
    ) THEN
      RAISE EXCEPTION 'A carryover request must not have a new rental payment.' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF v_request.amount_bdt <= 0 OR v_request.amount_bdt <> v_plan.price_bdt THEN
      RAISE EXCEPTION 'The request price does not match its active rental plan.' USING ERRCODE = '23514';
    END IF;
    SELECT * INTO v_payment
    FROM public.payment_submissions AS payment
    WHERE payment.payment_type = 'rental'
      AND payment.related_rental_request_id = v_request.id
    FOR UPDATE;
    v_has_payment := FOUND;
    IF NOT v_has_payment
      OR v_payment.member_id <> v_request.member_id
      OR v_payment.status <> 'pending'
      OR v_payment.amount_bdt <> v_request.amount_bdt THEN
      RAISE EXCEPTION 'A matching pending rental payment is required.' USING ERRCODE = '23514';
    END IF;
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
       OR (rental.book_id = v_request.book_id AND rental.status IN ('pending', 'active', 'overdue'))
  ) THEN
    RAISE EXCEPTION 'A conflicting rental already exists.' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.rentals (
    rental_request_id, member_id, book_id, subscription_plan_id,
    plan_name_snapshot, plan_price_snapshot, started_at, subscription_ends_at, status
  ) VALUES (
    v_request.id, v_request.member_id, v_request.book_id, v_plan.id,
    v_plan.name, v_plan.price_bdt, NULL, NULL, 'pending'
  );

  UPDATE public.books AS book
  SET availability = 'unavailable', updated_at = v_started_at
  WHERE book.id = v_book.id AND book.availability = 'available';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The requested book is no longer available.' USING ERRCODE = '23514';
  END IF;

  UPDATE public.rental_requests AS request
  SET status = 'approved', reviewed_at = v_started_at,
      reviewed_by = p_reviewer_session_id, admin_note = v_note
  WHERE request.id = v_request.id AND request.status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The rental request was already processed.' USING ERRCODE = '55000';
  END IF;

  IF v_has_payment THEN
    UPDATE public.payment_submissions AS payment
    SET status = 'approved', reviewed_at = v_started_at,
        reviewed_by = p_reviewer_session_id, admin_note = v_note
    WHERE payment.id = v_payment.id AND payment.status = 'pending';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The rental payment was already reviewed.' USING ERRCODE = '55000';
    END IF;
  END IF;

  INSERT INTO public.notifications (member_id, type, title, message, channel, status)
  VALUES (
    v_request.member_id,
    'rental_approved',
    'Rental request approved',
    pg_catalog.format('Your request for %s is approved and waiting for book handover.', v_book.title),
    'in_app',
    'pending'
  );

  RETURN 'approved';
END;
$$;

CREATE OR REPLACE FUNCTION public.handover_rental(
  p_rental_id uuid,
  p_reviewer_session_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_rental public.rentals%ROWTYPE;
  v_request public.rental_requests%ROWTYPE;
  v_payment public.payment_submissions%ROWTYPE;
  v_credit public.rental_day_credits%ROWTYPE;
  v_member public.member_profiles%ROWTYPE;
  v_plan public.subscription_plans%ROWTYPE;
  v_book public.books%ROWTYPE;
  v_ends_at timestamptz;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_sessions AS session
    WHERE session.id = p_reviewer_session_id AND session.expires_at > v_now
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
  IF v_rental.status = 'active' THEN
    RETURN 'already_handed_over';
  END IF;
  IF v_rental.status <> 'pending' OR v_rental.rental_request_id IS NULL THEN
    RAISE EXCEPTION 'Only an approved rental awaiting handover can be handed over.' USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_request
  FROM public.rental_requests AS request
  WHERE request.id = v_rental.rental_request_id
    AND request.member_id = v_rental.member_id
    AND request.book_id = v_rental.book_id
    AND request.status = 'approved'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The approved rental request could not be verified.' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_member
  FROM public.member_profiles AS member
  WHERE member.id = v_rental.member_id AND member.membership_status = 'active'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The member is not eligible for handover.' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_plan
  FROM public.subscription_plans AS plan
  WHERE plan.id = v_rental.subscription_plan_id
    AND plan.is_active = true AND plan.duration_days = 30
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'An active 30-day rental plan is required.' USING ERRCODE = '23514';
  END IF;

  IF v_request.rental_day_credit_id IS NOT NULL THEN
    SELECT * INTO v_credit
    FROM public.rental_day_credits AS credit
    WHERE credit.id = v_request.rental_day_credit_id
    FOR UPDATE;
    IF NOT FOUND OR v_credit.member_id <> v_rental.member_id
      OR v_credit.status <> 'reserved' OR v_credit.expires_at <= v_now THEN
      RAISE EXCEPTION 'The carried rental days have expired or are no longer available.' USING ERRCODE = '23514';
    END IF;
    v_ends_at := v_credit.expires_at;
    UPDATE public.rental_day_credits AS credit
    SET status = 'consumed', consumed_by_rental_id = v_rental.id, updated_at = v_now
    WHERE credit.id = v_credit.id AND credit.status = 'reserved';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The carried rental days were already used.' USING ERRCODE = '23505';
    END IF;
  ELSE
    IF v_request.amount_bdt <> v_plan.price_bdt OR v_request.amount_bdt <= 0 THEN
      RAISE EXCEPTION 'The approved rental amount no longer matches the plan.' USING ERRCODE = '23514';
    END IF;
    SELECT * INTO v_payment
    FROM public.payment_submissions AS payment
    WHERE payment.payment_type = 'rental'
      AND payment.related_rental_request_id = v_request.id
      AND payment.member_id = v_rental.member_id
      AND payment.status = 'approved'
      AND payment.amount_bdt = v_request.amount_bdt
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'A verified rental payment is required for handover.' USING ERRCODE = '23514';
    END IF;
    v_ends_at := v_now + pg_catalog.make_interval(days => 30);
  END IF;

  SELECT * INTO v_book
  FROM public.books AS book
  WHERE book.id = v_rental.book_id
  FOR UPDATE;
  IF NOT FOUND OR v_book.is_active IS NOT TRUE OR v_book.availability <> 'unavailable' THEN
    RAISE EXCEPTION 'The approved book is no longer ready for handover.' USING ERRCODE = '23514';
  END IF;

  UPDATE public.rentals AS rental
  SET status = 'active', started_at = v_now,
      subscription_ends_at = v_ends_at, updated_at = v_now
  WHERE rental.id = v_rental.id AND rental.status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The rental was already handed over.' USING ERRCODE = '55000';
  END IF;

  RETURN 'handed_over';
END;
$$;

CREATE OR REPLACE FUNCTION public.receive_rental(
  p_rental_id uuid,
  p_reviewer_session_id uuid
)
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
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_sessions AS session
    WHERE session.id = p_reviewer_session_id AND session.expires_at > v_now
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
  IF v_rental.status NOT IN ('active', 'overdue') OR v_rental.returned_at IS NOT NULL THEN
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
  SET status = 'returned', returned_at = v_now, updated_at = v_now
  WHERE rental.id = v_rental.id AND rental.status IN ('active', 'overdue');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The rental was already received.' USING ERRCODE = '55000';
  END IF;

  UPDATE public.books AS book
  SET availability = 'available', updated_at = v_now
  WHERE book.id = v_book.id;

  IF v_rental.subscription_ends_at IS NOT NULL AND v_rental.subscription_ends_at > v_now THEN
    INSERT INTO public.rental_day_credits (member_id, source_rental_id, expires_at, status)
    VALUES (v_rental.member_id, v_rental.id, v_rental.subscription_ends_at, 'available')
    ON CONFLICT (source_rental_id) DO NOTHING;
    v_created_credit := FOUND;
  END IF;

  RETURN CASE WHEN v_created_credit THEN 'returned_with_credit' ELSE 'returned' END;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_member_book_issued()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM 'active'
    AND NEW.status = 'active'
    AND NEW.started_at IS NOT NULL THEN
    PERFORM public.enqueue_member_notification(
      NEW.member_id,
      'book_issued',
      'Book handed over',
      'Your 30-day rental period has started. Check your dashboard for the due date.',
      pg_catalog.format('rental:%s:issued', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rentals_notify_book_issued ON public.rentals;
CREATE TRIGGER rentals_notify_book_issued
  AFTER UPDATE OF status ON public.rentals
  FOR EACH ROW EXECUTE FUNCTION public.notify_member_book_issued();

REVOKE ALL ON FUNCTION public.reserve_rental_day_credit_for_request() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.release_rejected_rental_day_credit() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.approve_rental_request(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handover_rental(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.receive_rental(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_rental_request(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.handover_rental(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.receive_rental(uuid, uuid) TO service_role;