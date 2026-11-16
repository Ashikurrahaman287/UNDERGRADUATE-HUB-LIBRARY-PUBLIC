CREATE OR REPLACE FUNCTION public.submit_wallet_transaction(
  p_amount numeric,
  p_type text,
  p_payment_method text,
  p_trx_id text,
  p_payer_phone text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_member public.member_profiles%ROWTYPE;
  v_plan public.subscription_plans%ROWTYPE;
  v_transaction_id uuid;
  v_outstanding numeric(12,2);
  v_trx_id text := pg_catalog.upper(pg_catalog.btrim(p_trx_id));
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 100000
    OR p_type NOT IN ('TOPUP', 'LATE_FEE', 'SUBSCRIPTION_RENEWAL')
    OR p_payment_method NOT IN ('bkash', 'nagad')
    OR v_trx_id !~ '^[A-Z0-9-]{6,64}$'
    OR p_payer_phone IS NULL OR p_payer_phone NOT LIKE 'pii:v1:%' THEN
    RAISE EXCEPTION 'Invalid wallet payment details.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_member FROM public.member_profiles AS member
  WHERE member.user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member profile not found.' USING ERRCODE = 'P0002';
  END IF;
  IF p_type IN ('TOPUP', 'SUBSCRIPTION_RENEWAL')
    AND (v_member.is_id_verified IS NOT TRUE
      OR v_member.verification_status <> 'APPROVED'
      OR v_member.id_card_url IS NULL) THEN
    RAISE EXCEPTION 'User ID not verified.' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.wallet_transactions AS transaction
    WHERE transaction.user_id = v_member.id AND transaction.type = p_type AND transaction.status = 'PENDING'
  ) THEN
    RAISE EXCEPTION 'A payment of this type is already awaiting verification.' USING ERRCODE = '55000';
  END IF;

  IF p_type = 'LATE_FEE' THEN
    SELECT COALESCE(pg_catalog.sum(fine.amount_bdt), 0) INTO v_outstanding
    FROM public.fine_ledger AS fine
    WHERE fine.member_id = v_member.id AND fine.status = 'outstanding';
    IF v_outstanding <= 0 OR v_outstanding <> p_amount THEN
      RAISE EXCEPTION 'The payment must match the current outstanding late fee total.' USING ERRCODE = '23514';
    END IF;
  ELSIF p_type = 'SUBSCRIPTION_RENEWAL' THEN
    IF v_member.membership_status <> 'active' OR v_member.current_plan_id IS NULL THEN
      RAISE EXCEPTION 'An active membership with an assigned plan is required.' USING ERRCODE = '23514';
    END IF;
    SELECT * INTO v_plan FROM public.subscription_plans AS plan
    WHERE plan.id = v_member.current_plan_id AND plan.is_active AND plan.duration_days = 30
    FOR SHARE;
    IF NOT FOUND OR p_amount <> v_plan.price_bdt THEN
      RAISE EXCEPTION 'The payment must match the assigned 30-day subscription plan.' USING ERRCODE = '23514';
    END IF;
  END IF;

  INSERT INTO public.wallet_transactions (user_id, amount, type, payment_method, trx_id, payer_phone)
  VALUES (v_member.id, p_amount, p_type, p_payment_method, v_trx_id, p_payer_phone)
  RETURNING transaction_id INTO v_transaction_id;

  RETURN v_transaction_id;
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
  IF v_member.is_id_verified IS NOT TRUE
    OR v_member.verification_status <> 'APPROVED'
    OR v_member.id_card_url IS NULL THEN
    RAISE EXCEPTION 'User ID not verified.' USING ERRCODE = '42501';
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

REVOKE ALL ON FUNCTION public.submit_wallet_transaction(numeric, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_wallet_transaction(numeric, text, text, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.submit_subscription_renewal(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_subscription_renewal(text, text) TO authenticated;