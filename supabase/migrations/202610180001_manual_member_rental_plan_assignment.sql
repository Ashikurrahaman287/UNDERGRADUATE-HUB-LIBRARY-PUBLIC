DROP FUNCTION IF EXISTS public.admin_approve_pending_member(uuid, uuid);

CREATE FUNCTION public.admin_approve_pending_member(
  p_member_id uuid,
  p_plan_id uuid,
  p_reviewer_session_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_member public.member_profiles%ROWTYPE;
  v_plan public.subscription_plans%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_sessions AS session
    WHERE session.id = p_reviewer_session_id AND session.expires_at > v_now
  ) THEN
    RAISE EXCEPTION 'Admin session is no longer valid.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_member
  FROM public.member_profiles AS member
  WHERE member.id = p_member_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member profile not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_member.membership_status = 'active' THEN
    RETURN 'already_active';
  END IF;
  IF v_member.membership_status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending members can be activated.' USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_plan
  FROM public.subscription_plans AS plan
  WHERE plan.id = p_plan_id
    AND plan.is_active = true
    AND plan.duration_days = 30
    AND plan.price_bdt IN (29.00, 49.00)
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Choose an active 30-day rental plan.' USING ERRCODE = '23514';
  END IF;

  UPDATE public.member_profiles
  SET membership_status = 'active',
      membership_expires_at = v_now + INTERVAL '1 year',
      current_plan_id = v_plan.id,
      updated_at = v_now
  WHERE id = v_member.id;
  RETURN 'approved';
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_assign_member_rental_plan(
  p_member_id uuid,
  p_plan_id uuid,
  p_reviewer_session_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_member public.member_profiles%ROWTYPE;
  v_plan public.subscription_plans%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_sessions AS session
    WHERE session.id = p_reviewer_session_id AND session.expires_at > v_now
  ) THEN
    RAISE EXCEPTION 'Admin session is no longer valid.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_member
  FROM public.member_profiles AS member
  WHERE member.id = p_member_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member profile not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_member.membership_status <> 'active' THEN
    RAISE EXCEPTION 'Only active members can receive a rental plan.' USING ERRCODE = '55000';
  END IF;
  IF v_member.current_plan_id IS NOT NULL THEN
    RETURN 'already_assigned';
  END IF;

  SELECT * INTO v_plan
  FROM public.subscription_plans AS plan
  WHERE plan.id = p_plan_id
    AND plan.is_active = true
    AND plan.duration_days = 30
    AND plan.price_bdt IN (29.00, 49.00)
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Choose an active 30-day rental plan.' USING ERRCODE = '23514';
  END IF;

  UPDATE public.member_profiles
  SET current_plan_id = v_plan.id, updated_at = v_now
  WHERE id = v_member.id AND current_plan_id IS NULL;
  RETURN 'assigned';
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
    RAISE EXCEPTION 'Sign in before submitting payment.' USING ERRCODE = '42501';
  END IF;
  IF p_payment_method NOT IN ('bkash', 'nagad') OR v_txid !~ '^[A-Za-z0-9-]{6,64}$' THEN
    RAISE EXCEPTION 'Choose bKash or Nagad and enter a valid TXID.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_member
  FROM public.member_profiles AS member
  WHERE member.user_id = v_user_id
  FOR UPDATE;
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
      AND payment.payment_type IN ('rental', 'renewal')
      AND payment.status = 'pending'
  ) THEN
    RAISE EXCEPTION 'A subscription payment is already awaiting review.' USING ERRCODE = '23505';
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
    member_id, payment_type, payment_method, amount_bdt, transaction_id, status
  ) VALUES (
    v_member.id, 'renewal', p_payment_method, v_plan.price_bdt, v_txid, 'pending'
  ) RETURNING id INTO v_payment_id;
  RETURN v_payment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_approve_pending_member(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_assign_member_rental_plan(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_subscription_renewal(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_approve_pending_member(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_assign_member_rental_plan(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.submit_subscription_renewal(text, text) TO authenticated;