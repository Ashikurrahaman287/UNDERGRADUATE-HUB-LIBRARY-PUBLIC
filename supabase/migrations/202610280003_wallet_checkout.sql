ALTER TABLE public.membership_applications
  DROP CONSTRAINT IF EXISTS membership_applications_payment_method_check;
ALTER TABLE public.membership_applications
  ADD CONSTRAINT membership_applications_payment_method_check
  CHECK (payment_method IN ('bkash', 'nagad', 'WALLET'));

ALTER TABLE public.wallet_transactions
  DROP CONSTRAINT IF EXISTS wallet_transactions_type_check,
  DROP CONSTRAINT IF EXISTS wallet_transactions_payment_method_check,
  ADD COLUMN IF NOT EXISTS related_membership_application_id uuid REFERENCES public.membership_applications(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS related_rental_request_id uuid REFERENCES public.rental_requests(id) ON DELETE SET NULL,
  ALTER COLUMN payer_phone DROP NOT NULL;

ALTER TABLE public.wallet_transactions
  ADD CONSTRAINT wallet_transactions_type_check
    CHECK (type IN ('TOPUP', 'LATE_FEE', 'SUBSCRIPTION_RENEWAL', 'MEMBERSHIP_APPLICATION', 'RENTAL_PAYMENT')),
  ADD CONSTRAINT wallet_transactions_payment_method_check
    CHECK (payment_method IN ('bkash', 'nagad', 'WALLET'));

CREATE UNIQUE INDEX IF NOT EXISTS wallet_transactions_membership_application_unique_idx
  ON public.wallet_transactions (related_membership_application_id)
  WHERE related_membership_application_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS wallet_transactions_rental_request_unique_idx
  ON public.wallet_transactions (related_rental_request_id)
  WHERE related_rental_request_id IS NOT NULL;

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
  v_plan public.subscription_plans%ROWTYPE;
  v_application_id uuid;
  v_fee numeric(12,2);
  v_wallet_transaction_id uuid;
  v_trx_id text := 'WALLET-MEM-' || pg_catalog.gen_random_uuid()::text;
BEGIN
  IF p_member_id IS NULL OR p_user_id IS NULL OR p_plan_id IS NULL
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
  IF EXISTS (
    SELECT 1 FROM public.member_subscriptions AS subscription
    WHERE subscription.member_id = v_member.id
      AND subscription.status = 'active'
      AND subscription.ends_at > v_now
  ) THEN
    RAISE EXCEPTION 'An active subscription already exists for this account.' USING ERRCODE = '55000';
  END IF;

  SELECT setting.value_number INTO v_fee
  FROM public.library_settings AS setting
  WHERE setting.key = 'membership_fee_bdt'
  FOR SHARE;
  IF v_fee IS DISTINCT FROM 99.00 THEN
    RAISE EXCEPTION 'The configured membership fee is unavailable for instant wallet approval.' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_plan
  FROM public.subscription_plans AS plan
  WHERE plan.id = p_plan_id AND plan.is_active = true
  FOR SHARE;
  IF NOT FOUND OR v_plan.duration_days <> 30 OR v_plan.price_bdt NOT IN (29.00, 49.00) THEN
    RAISE EXCEPTION 'Choose an active 30-day membership plan.' USING ERRCODE = '23514';
  END IF;
  IF v_member.wallet_balance < v_fee THEN
    RAISE EXCEPTION 'Your wallet balance is insufficient. Please top up or choose bKash/Nagad.' USING ERRCODE = '23514';
  END IF;

  UPDATE public.member_profiles
  SET wallet_balance = wallet_balance - v_fee,
      membership_status = 'active',
      current_plan_id = v_plan.id,
      updated_at = v_now
  WHERE id = v_member.id AND wallet_balance >= v_fee;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Your wallet balance is insufficient. Please top up or choose bKash/Nagad.' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.membership_applications (
    member_id, amount_bdt, payment_method, transaction_id,
    terms_accepted_at, terms_version, status, reviewed_at,
    admin_note
  ) VALUES (
    v_member.id, v_fee, 'WALLET', v_trx_id,
    v_now, p_terms_version, 'approved', v_now,
    'Paid from wallet; approved automatically.'
  ) RETURNING id INTO v_application_id;

  INSERT INTO public.member_subscriptions (
    member_id, plan_id, plan_name_snapshot, plan_price_snapshot,
    status, started_at, ends_at
  ) VALUES (
    v_member.id, v_plan.id, v_plan.name, v_plan.price_bdt,
    'active', v_now, v_now + pg_catalog.make_interval(days => v_plan.duration_days)
  );

  INSERT INTO public.wallet_transactions (
    user_id, amount, type, status, payment_method, trx_id,
    related_membership_application_id, admin_note, reviewed_at
  ) VALUES (
    v_member.id, v_fee, 'MEMBERSHIP_APPLICATION', 'APPROVED', 'WALLET', v_trx_id,
    v_application_id, 'Membership fee paid from wallet.', v_now
  ) RETURNING transaction_id INTO v_wallet_transaction_id;

  INSERT INTO public.notifications (member_id, type, title, message, channel, status)
  VALUES (
    v_member.id, 'membership_approved', 'Membership approved',
    'Your membership payment was deducted from your wallet and your membership is active.',
    'in_app', 'pending'
  );

  RETURN v_application_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_first_rental_request_with_wallet(
  p_member_id uuid,
  p_user_id uuid,
  p_book_id uuid,
  p_plan_id uuid,
  p_reservation_request_id uuid,
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
  v_plan public.subscription_plans%ROWTYPE;
  v_book public.books%ROWTYPE;
  v_request_id uuid;
  v_trx_id text := 'WALLET-RENT-' || pg_catalog.gen_random_uuid()::text;
BEGIN
  IF p_member_id IS NULL OR p_user_id IS NULL OR p_book_id IS NULL OR p_plan_id IS NULL
    OR p_terms_version IS NULL OR pg_catalog.length(p_terms_version) > 64 THEN
    RAISE EXCEPTION 'Invalid wallet rental request.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_member
  FROM public.member_profiles AS member
  WHERE member.id = p_member_id AND member.user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND OR v_member.membership_status <> 'active'
    OR v_member.is_id_verified IS NOT TRUE OR v_member.id_card_url IS NULL
    OR v_member.current_plan_id IS DISTINCT FROM p_plan_id THEN
    RAISE EXCEPTION 'An active, verified member with the assigned rental plan is required.' USING ERRCODE = '55000';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.fine_ledger AS fine
    WHERE fine.member_id = v_member.id AND fine.status = 'outstanding'
  ) THEN
    RAISE EXCEPTION 'Pay your outstanding overdue fees before requesting a rental.' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.member_subscriptions AS subscription
    WHERE subscription.member_id = v_member.id
  ) THEN
    RAISE EXCEPTION 'A first rental subscription payment is not available for this account.' USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_plan
  FROM public.subscription_plans AS plan
  WHERE plan.id = p_plan_id AND plan.is_active = true
  FOR SHARE;
  IF NOT FOUND OR v_plan.duration_days <> 30 OR v_plan.price_bdt <= 0 THEN
    RAISE EXCEPTION 'An active 30-day rental plan is required.' USING ERRCODE = '23514';
  END IF;
  IF v_member.wallet_balance < v_plan.price_bdt THEN
    RAISE EXCEPTION 'Your wallet balance is insufficient. Please top up or choose bKash/Nagad.' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_book
  FROM public.books AS book
  WHERE book.id = p_book_id
  FOR UPDATE;
  IF NOT FOUND OR v_book.is_active IS NOT TRUE OR v_book.availability <> 'available' THEN
    RAISE EXCEPTION 'This book is not available for a rental request.' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.rental_requests AS request
    WHERE request.member_id = v_member.id AND request.book_id = v_book.id
      AND request.status IN ('pending', 'approved')
  ) OR EXISTS (
    SELECT 1 FROM public.rentals AS rental
    WHERE rental.member_id = v_member.id AND rental.book_id = v_book.id
      AND rental.status IN ('pending', 'active', 'overdue', 'return_requested')
  ) THEN
    RAISE EXCEPTION 'You already have a pending request or rental for this book.' USING ERRCODE = '23505';
  END IF;

  IF p_reservation_request_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.reservation_requests AS reservation
    WHERE reservation.id = p_reservation_request_id
      AND reservation.member_id = v_member.id
      AND reservation.book_id = v_book.id
      AND reservation.status IN ('waiting', 'notified')
  ) THEN
    RAISE EXCEPTION 'The linked reservation is no longer available.' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.rental_requests (
    member_id, book_id, reservation_request_id, subscription_plan_id,
    rental_day_credit_id, amount_bdt, terms_accepted_at, terms_version, status
  ) VALUES (
    v_member.id, v_book.id, p_reservation_request_id, v_plan.id,
    NULL, v_plan.price_bdt, v_now, p_terms_version, 'pending'
  ) RETURNING id INTO v_request_id;

  UPDATE public.member_profiles
  SET wallet_balance = wallet_balance - v_plan.price_bdt, updated_at = v_now
  WHERE id = v_member.id AND wallet_balance >= v_plan.price_bdt;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Your wallet balance is insufficient. Please top up or choose bKash/Nagad.' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.wallet_transactions (
    user_id, amount, type, status, payment_method, trx_id,
    related_rental_request_id, admin_note, reviewed_at
  ) VALUES (
    v_member.id, v_plan.price_bdt, 'RENTAL_PAYMENT', 'APPROVED', 'WALLET', v_trx_id,
    v_request_id, 'First subscription payment paid from wallet.', v_now
  );

  INSERT INTO public.member_subscriptions (
    member_id, plan_id, plan_name_snapshot, plan_price_snapshot,
    status, started_at, ends_at
  ) VALUES (
    v_member.id, v_plan.id, v_plan.name, v_plan.price_bdt,
    'active', v_now, v_now + pg_catalog.make_interval(days => v_plan.duration_days)
  );

  INSERT INTO public.rentals (
    rental_request_id, member_id, book_id, subscription_plan_id,
    plan_name_snapshot, plan_price_snapshot, started_at, subscription_ends_at, status
  ) VALUES (
    v_request_id, v_member.id, v_book.id, v_plan.id,
    v_plan.name, v_plan.price_bdt, NULL, NULL, 'pending'
  );

  UPDATE public.books
  SET availability = 'unavailable', updated_at = v_now
  WHERE id = v_book.id AND availability = 'available';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The requested book is no longer available.' USING ERRCODE = '23514';
  END IF;

  UPDATE public.rental_requests
  SET status = 'approved', reviewed_at = v_now,
      admin_note = 'Paid from wallet; approved for handover.'
  WHERE id = v_request_id AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The rental request could not be approved.' USING ERRCODE = '55000';
  END IF;

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_membership_with_wallet(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_membership_with_wallet(uuid, uuid, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.submit_first_rental_request_with_wallet(uuid, uuid, uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_first_rental_request_with_wallet(uuid, uuid, uuid, uuid, uuid, text) TO service_role;