CREATE OR REPLACE FUNCTION public.apply_membership_with_wallet(
  p_member_id uuid,
  p_user_id uuid,
  p_plan_id uuid,
  p_terms_version text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_member public.member_profiles%ROWTYPE;
  v_application_id uuid;
  v_fee numeric(12,2);
  v_trx_id text := 'WALLET-MEM-' || pg_catalog.gen_random_uuid()::text;
BEGIN
  IF p_member_id IS NULL OR p_user_id IS NULL
    OR p_terms_version IS NULL OR pg_catalog.length(p_terms_version) > 64 THEN
    RAISE EXCEPTION 'Invalid wallet membership application.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_member
  FROM public.member_profiles AS member
  WHERE member.id = p_member_id AND member.user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member profile not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_member.membership_status IN ('active', 'suspended') THEN
    RAISE EXCEPTION 'This account is not eligible for a new membership application.' USING ERRCODE = '55000';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.membership_applications AS application
    WHERE application.member_id = v_member.id
      AND application.status IN ('pending', 'approved')
  ) THEN
    RAISE EXCEPTION 'A membership application is already pending or approved.' USING ERRCODE = '55000';
  END IF;

  SELECT setting.value_number INTO v_fee
  FROM public.library_settings AS setting
  WHERE setting.key = 'membership_fee_bdt'
  FOR SHARE;
  IF v_fee IS DISTINCT FROM 99.00 THEN
    RAISE EXCEPTION 'The configured membership fee is unavailable for wallet payment.' USING ERRCODE = '23514';
  END IF;
  IF v_member.wallet_balance < v_fee THEN
    RAISE EXCEPTION 'Your wallet balance is insufficient. Please top up or choose bKash/Nagad.' USING ERRCODE = '23514';
  END IF;

  UPDATE public.member_profiles
  SET wallet_balance = wallet_balance - v_fee, updated_at = v_now
  WHERE id = v_member.id AND wallet_balance >= v_fee;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Your wallet balance is insufficient. Please top up or choose bKash/Nagad.' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.membership_applications (
    member_id, amount_bdt, payment_method, transaction_id,
    terms_accepted_at, terms_version, status
  ) VALUES (
    v_member.id, v_fee, 'WALLET', v_trx_id,
    v_now, p_terms_version, 'pending'
  ) RETURNING id INTO v_application_id;

  INSERT INTO public.wallet_transactions (
    user_id, amount, type, status, payment_method, trx_id,
    related_membership_application_id, admin_note, reviewed_at
  ) VALUES (
    v_member.id, v_fee, 'MEMBERSHIP_APPLICATION', 'APPROVED', 'WALLET', v_trx_id,
    v_application_id, 'Membership application fee paid from wallet.', v_now
  );

  INSERT INTO public.notifications (member_id, type, title, message, channel, status)
  VALUES (
    v_member.id, 'membership_submitted', 'Membership application submitted',
    'Your application and wallet payment were received. An administrator will review your ID and assign your 30-day plan.',
    'in_app', 'pending'
  );

  RETURN v_application_id;
END;
$$;

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
  v_wallet_transaction public.wallet_transactions%ROWTYPE;
  v_plan public.subscription_plans%ROWTYPE;
  v_membership_fee numeric(12,2);
  v_payment_count integer;
  v_wallet_payment_count integer;
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
  IF p_approve AND v_application.status = 'approved' THEN RETURN 'already_approved'; END IF;
  IF NOT p_approve AND v_application.status = 'rejected' THEN RETURN 'already_rejected'; END IF;
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

  IF v_application.payment_method = 'WALLET' THEN
    IF v_payment_count <> 0 THEN
      RAISE EXCEPTION 'A wallet-paid application cannot also have an external membership payment.' USING ERRCODE = '23514';
    END IF;
    SELECT pg_catalog.count(*) INTO v_wallet_payment_count
    FROM public.wallet_transactions AS transaction
    WHERE transaction.related_membership_application_id = v_application.id
      AND transaction.type = 'MEMBERSHIP_APPLICATION';
    IF v_wallet_payment_count <> 1 THEN
      RAISE EXCEPTION 'A unique approved wallet payment is required.' USING ERRCODE = '23514';
    END IF;
    SELECT * INTO v_wallet_transaction
    FROM public.wallet_transactions AS transaction
    WHERE transaction.related_membership_application_id = v_application.id
      AND transaction.type = 'MEMBERSHIP_APPLICATION'
    FOR UPDATE;
    IF v_wallet_transaction.user_id <> v_application.member_id
      OR v_wallet_transaction.amount <> v_application.amount_bdt
      OR v_wallet_transaction.payment_method <> 'WALLET'
      OR v_wallet_transaction.status <> 'APPROVED'
      OR v_wallet_transaction.trx_id <> v_application.transaction_id THEN
      RAISE EXCEPTION 'The wallet payment does not match this application.' USING ERRCODE = '23514';
    END IF;
  ELSE
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
  END IF;

  IF p_approve THEN
    SELECT setting.value_number INTO v_membership_fee
    FROM public.library_settings AS setting
    WHERE setting.key = 'membership_fee_bdt'
    FOR SHARE;
    IF v_membership_fee IS DISTINCT FROM 99.00 OR v_application.amount_bdt <> v_membership_fee
      OR (v_application.payment_method <> 'WALLET' AND (v_payment.amount_bdt <> v_membership_fee OR v_payment.status <> 'pending')) THEN
      RAISE EXCEPTION 'A paid application for the configured ৳99 membership fee is required.' USING ERRCODE = '23514';
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

    IF v_application.payment_method <> 'WALLET' THEN
      UPDATE public.payment_submissions
      SET status = 'approved', reviewed_at = v_now,
          reviewed_by = p_reviewer_session_id, admin_note = v_note
      WHERE id = v_payment.id AND status = 'pending';
      IF NOT FOUND THEN
        RAISE EXCEPTION 'The payment has already been reviewed.' USING ERRCODE = '55000';
      END IF;
    END IF;

    UPDATE public.member_profiles
    SET membership_status = 'active', current_plan_id = v_plan.id,
        rental_subscription_start = NULL, rental_subscription_expires_at = NULL,
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
  IF v_application.payment_method = 'WALLET' THEN
    UPDATE public.member_profiles
    SET wallet_balance = wallet_balance + v_wallet_transaction.amount, updated_at = v_now
    WHERE id = v_member.id;
    UPDATE public.wallet_transactions
    SET status = 'FAILED', reviewed_at = v_now, reviewed_by = p_reviewer_session_id,
        admin_note = v_note || ' Wallet fee refunded.'
    WHERE transaction_id = v_wallet_transaction.transaction_id AND status = 'APPROVED';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The wallet payment has already been refunded or reviewed.' USING ERRCODE = '55000';
    END IF;
  ELSE
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

REVOKE ALL ON FUNCTION public.apply_membership_with_wallet(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_membership_with_wallet(uuid, uuid, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.review_membership_application(uuid, uuid, uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_membership_application(uuid, uuid, uuid, boolean, text) TO service_role;