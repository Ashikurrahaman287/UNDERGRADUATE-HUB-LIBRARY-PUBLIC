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
    nullif(pg_catalog.btrim(p_admin_note), ''),
    CASE WHEN p_approve THEN 'Membership approved.' ELSE 'Membership rejected.' END
  );
BEGIN
  IF p_approve IS NULL THEN
    RAISE EXCEPTION 'A review decision is required.' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.admin_sessions AS session
    WHERE session.id = p_reviewer_session_id
      AND session.expires_at > v_now
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
    WHERE plan.id = p_plan_id
      AND plan.is_active = true
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The selected subscription plan is unavailable.' USING ERRCODE = '23514';
    END IF;
    IF v_plan.duration_days <> 30 OR v_plan.price_bdt NOT IN (29.00, 49.00) THEN
      RAISE EXCEPTION 'Choose an active 30-day subscription plan priced at ৳29 or ৳49.' USING ERRCODE = '23514';
    END IF;
    IF v_member.membership_status IN ('active', 'suspended') THEN
      RAISE EXCEPTION 'This member is not eligible for activation.' USING ERRCODE = '55000';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM public.member_subscriptions AS subscription
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
    SET membership_status = 'active', current_plan_id = v_plan.id, updated_at = v_now
    WHERE id = v_member.id;

    INSERT INTO public.member_subscriptions (
      member_id, plan_id, plan_name_snapshot, plan_price_snapshot,
      status, started_at, ends_at
    ) VALUES (
      v_member.id, v_plan.id, v_plan.name, v_plan.price_bdt,
      'active', v_now, v_now + pg_catalog.make_interval(days => v_plan.duration_days)
    );

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

CREATE OR REPLACE FUNCTION public.archive_admin_book(
  p_book_id uuid,
  p_reviewer_session_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_book public.books%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.admin_sessions AS session
    WHERE session.id = p_reviewer_session_id
      AND session.expires_at > v_now
  ) THEN
    RAISE EXCEPTION 'Admin session is no longer valid.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_book
  FROM public.books AS book
  WHERE book.id = p_book_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Book not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_book.is_active IS NOT TRUE THEN
    RETURN 'already_archived';
  END IF;

  IF EXISTS (SELECT 1 FROM public.rentals AS rental WHERE rental.book_id = v_book.id AND rental.status IN ('pending', 'active', 'overdue'))
    OR EXISTS (SELECT 1 FROM public.rental_requests AS request WHERE request.book_id = v_book.id AND request.status = 'pending')
    OR EXISTS (SELECT 1 FROM public.reservation_requests AS reservation WHERE reservation.book_id = v_book.id AND reservation.status IN ('waiting', 'notified')) THEN
    RAISE EXCEPTION 'Book has active rentals, requests, or reservations.' USING ERRCODE = '55000';
  END IF;

  UPDATE public.books SET is_active = false, updated_at = v_now WHERE id = v_book.id;
  RETURN 'archived';
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_issued_book_availability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.availability <> 'unavailable'
    AND EXISTS (
      SELECT 1 FROM public.rentals AS rental
      WHERE rental.book_id = NEW.id AND rental.status IN ('pending', 'active', 'overdue')
    ) THEN
    RAISE EXCEPTION 'A book with an unresolved rental cannot be marked available or limited.' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_issued_book_availability ON public.books;
CREATE TRIGGER protect_issued_book_availability
  BEFORE UPDATE OF availability ON public.books
  FOR EACH ROW EXECUTE FUNCTION public.protect_issued_book_availability();

REVOKE ALL ON FUNCTION public.review_membership_application(uuid, uuid, uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_membership_application(uuid, uuid, uuid, boolean, text) TO service_role;
REVOKE ALL ON FUNCTION public.archive_admin_book(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archive_admin_book(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.protect_issued_book_availability() FROM PUBLIC, anon, authenticated, service_role;
