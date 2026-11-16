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
    AND amount_bdt = 0
  );

CREATE OR REPLACE FUNCTION public.enforce_active_subscription_for_rental_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.amount_bdt <> 0 OR NEW.rental_day_credit_id IS NOT NULL THEN
    RAISE EXCEPTION 'Book requests are covered by the member subscription and cannot include a per-book charge.'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.member_profiles AS member
    JOIN public.member_subscriptions AS subscription
      ON subscription.member_id = member.id
    JOIN public.subscription_plans AS plan
      ON plan.id = subscription.plan_id
    WHERE member.id = NEW.member_id
      AND member.membership_status = 'active'
      AND (member.current_plan_id IS NULL OR member.current_plan_id = NEW.subscription_plan_id)
      AND subscription.plan_id = NEW.subscription_plan_id
      AND subscription.status = 'active'
      AND subscription.ends_at > pg_catalog.clock_timestamp()
      AND plan.is_active = true
      AND plan.duration_days = 30
  ) THEN
    RAISE EXCEPTION 'An active 30-day subscription is required to request a book.'
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
  v_subscription public.member_subscriptions%ROWTYPE;
  v_plan public.subscription_plans%ROWTYPE;
  v_book public.books%ROWTYPE;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_note text := COALESCE(NULLIF(pg_catalog.btrim(p_admin_note), ''), 'Rental approved and ready for handover.');
  v_has_payment boolean := false;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_sessions AS session
    WHERE session.id = p_reviewer_session_id
      AND session.expires_at > v_now
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

  SELECT * INTO v_subscription
  FROM public.member_subscriptions AS subscription
  WHERE subscription.member_id = v_request.member_id
    AND subscription.plan_id = v_request.subscription_plan_id
    AND (v_member.current_plan_id IS NULL OR v_member.current_plan_id = subscription.plan_id)
    AND subscription.status = 'active'
    AND subscription.ends_at > v_now
  ORDER BY subscription.ends_at DESC
  LIMIT 1
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'An active 30-day subscription is required to approve this request.' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_plan
  FROM public.subscription_plans AS plan
  WHERE plan.id = v_request.subscription_plan_id
    AND plan.is_active = true
    AND plan.duration_days = 30
    AND plan.price_bdt > 0
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'An active 30-day subscription plan is required.' USING ERRCODE = '23514';
  END IF;

  IF v_request.amount_bdt = 0 THEN
    IF v_request.rental_day_credit_id IS NOT NULL THEN
      SELECT * INTO v_credit
      FROM public.rental_day_credits AS credit
      WHERE credit.id = v_request.rental_day_credit_id
      FOR UPDATE;
      IF NOT FOUND OR v_credit.member_id <> v_request.member_id
        OR v_credit.status <> 'reserved' OR v_credit.expires_at <= v_now THEN
        RAISE EXCEPTION 'The legacy carryover record is no longer valid.' USING ERRCODE = '23514';
      END IF;
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.payment_submissions AS payment
      WHERE payment.payment_type = 'rental'
        AND payment.related_rental_request_id = v_request.id
    ) THEN
      RAISE EXCEPTION 'Subscription-covered requests must not include a per-book payment.' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF v_request.rental_day_credit_id IS NOT NULL
      OR v_request.amount_bdt <> v_plan.price_bdt THEN
      RAISE EXCEPTION 'The legacy rental amount does not match its plan.' USING ERRCODE = '23514';
    END IF;
    SELECT * INTO v_payment
    FROM public.payment_submissions AS payment
    WHERE payment.payment_type = 'rental'
      AND payment.related_rental_request_id = v_request.id
    FOR UPDATE;
    v_has_payment := FOUND;
    IF NOT v_has_payment OR v_payment.member_id <> v_request.member_id
      OR v_payment.status <> 'pending'
      OR v_payment.amount_bdt <> v_request.amount_bdt THEN
      RAISE EXCEPTION 'A matching pending legacy rental payment is required.' USING ERRCODE = '23514';
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
       OR (rental.book_id = v_request.book_id AND rental.status IN ('pending', 'active', 'overdue', 'return_requested'))
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
      RAISE EXCEPTION 'The legacy rental payment was already reviewed.' USING ERRCODE = '55000';
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
  v_subscription public.member_subscriptions%ROWTYPE;
  v_plan public.subscription_plans%ROWTYPE;
  v_book public.books%ROWTYPE;
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

  SELECT * INTO v_subscription
  FROM public.member_subscriptions AS subscription
  WHERE subscription.member_id = v_rental.member_id
    AND subscription.plan_id = v_rental.subscription_plan_id
    AND (v_member.current_plan_id IS NULL OR v_member.current_plan_id = subscription.plan_id)
    AND subscription.status = 'active'
    AND subscription.ends_at > v_now
  ORDER BY subscription.ends_at DESC
  LIMIT 1
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Renew the 30-day subscription before receiving another book.' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_plan
  FROM public.subscription_plans AS plan
  WHERE plan.id = v_rental.subscription_plan_id
    AND plan.is_active = true AND plan.duration_days = 30
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'An active 30-day subscription plan is required.' USING ERRCODE = '23514';
  END IF;

  IF v_request.amount_bdt > 0 THEN
    IF v_request.amount_bdt <> v_plan.price_bdt OR v_request.rental_day_credit_id IS NOT NULL THEN
      RAISE EXCEPTION 'The legacy rental amount no longer matches the subscription plan.' USING ERRCODE = '23514';
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
      RAISE EXCEPTION 'The legacy rental payment could not be verified.' USING ERRCODE = '23514';
    END IF;
  ELSIF v_request.amount_bdt <> 0 OR EXISTS (
    SELECT 1 FROM public.payment_submissions AS payment
    WHERE payment.payment_type = 'rental'
      AND payment.related_rental_request_id = v_request.id
  ) THEN
    RAISE EXCEPTION 'A subscription-covered rental must not have a per-book payment.' USING ERRCODE = '23514';
  END IF;

  IF v_request.rental_day_credit_id IS NOT NULL THEN
    SELECT * INTO v_credit
    FROM public.rental_day_credits AS credit
    WHERE credit.id = v_request.rental_day_credit_id
    FOR UPDATE;
    IF NOT FOUND OR v_credit.member_id <> v_rental.member_id
      OR v_credit.status <> 'reserved' OR v_credit.expires_at <= v_now THEN
      RAISE EXCEPTION 'The legacy carryover record is no longer valid.' USING ERRCODE = '23514';
    END IF;
    UPDATE public.rental_day_credits AS credit
    SET status = 'consumed', consumed_by_rental_id = v_rental.id, updated_at = v_now
    WHERE credit.id = v_credit.id AND credit.status = 'reserved';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The legacy carryover record was already used.' USING ERRCODE = '23505';
    END IF;
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
      subscription_ends_at = v_subscription.ends_at, updated_at = v_now
  WHERE rental.id = v_rental.id AND rental.status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The rental was already handed over.' USING ERRCODE = '55000';
  END IF;

  RETURN 'handed_over';
END;
$$;

CREATE OR REPLACE FUNCTION public.extend_rentals_for_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.status = 'active' AND NEW.ends_at > pg_catalog.clock_timestamp() THEN
    UPDATE public.rentals AS rental
    SET subscription_ends_at = NEW.ends_at,
        status = CASE WHEN rental.status = 'overdue' THEN 'active' ELSE rental.status END,
        updated_at = pg_catalog.clock_timestamp()
    WHERE rental.member_id = NEW.member_id
      AND rental.status IN ('active', 'overdue', 'return_requested')
      AND rental.started_at IS NOT NULL
      AND (rental.subscription_ends_at IS NULL OR rental.subscription_ends_at < NEW.ends_at);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS member_subscriptions_extend_rentals ON public.member_subscriptions;
CREATE TRIGGER member_subscriptions_extend_rentals
  AFTER INSERT ON public.member_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.extend_rentals_for_subscription();

REVOKE ALL ON FUNCTION public.extend_rentals_for_subscription() FROM PUBLIC, anon, authenticated, service_role;