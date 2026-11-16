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
  FOR UPDATE;
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

REVOKE ALL ON FUNCTION public.submit_subscription_renewal(text, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.submit_subscription_renewal(text, text) TO authenticated;

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
  v_active_subscription public.member_subscriptions%ROWTYPE;
  v_next_started_at timestamptz;
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
    RETURN CASE WHEN v_payment.status = 'approved' THEN 'already_approved' ELSE 'already_rejected' END;
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
    WHERE fine.member_id = v_member.id AND fine.status = 'outstanding';
    IF v_payment.related_fine_id IS NULL
       OR NOT EXISTS (
            SELECT 1 FROM public.fine_ledger AS anchor
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

    SELECT * INTO v_active_subscription
    FROM public.member_subscriptions AS subscription
    WHERE subscription.member_id = v_member.id
      AND subscription.plan_id = v_plan.id
      AND subscription.status = 'active'
    ORDER BY subscription.ends_at DESC NULLS LAST, subscription.started_at DESC
    LIMIT 1
    FOR UPDATE;
    v_next_started_at := GREATEST(COALESCE(v_active_subscription.ends_at, v_now), v_now);
  END IF;

  UPDATE public.payment_submissions AS payment
  SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
      reviewed_at = v_now,
      reviewed_by = p_reviewer_session_id,
      admin_note = NULLIF(v_note, '')
  WHERE payment.id = v_payment.id AND payment.status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment was already reviewed.' USING ERRCODE = '55000';
  END IF;
  IF NOT p_approve THEN
    RETURN 'rejected';
  END IF;

  IF v_payment.payment_type = 'fine' THEN
    UPDATE public.fine_ledger AS fine
    SET status = 'paid', paid_at = v_now, payment_submission_id = v_payment.id
    WHERE fine.member_id = v_member.id AND fine.status = 'outstanding';
  ELSE
    UPDATE public.member_subscriptions AS subscription
    SET status = 'expired', updated_at = v_now
    WHERE subscription.member_id = v_member.id AND subscription.status = 'active';

    INSERT INTO public.member_subscriptions (
      member_id, plan_id, plan_name_snapshot, plan_price_snapshot,
      status, started_at, ends_at
    ) VALUES (
      v_member.id,
      v_plan.id,
      v_plan.name,
      v_plan.price_bdt,
      'active',
      COALESCE(v_next_started_at, v_now),
      COALESCE(v_next_started_at, v_now) + pg_catalog.make_interval(days => 30)
    );

    UPDATE public.member_profiles
    SET current_plan_id = v_plan.id, updated_at = v_now
    WHERE id = v_member.id;
  END IF;

  PERFORM public.auto_log_approved_finance_entry(v_payment.id, p_reviewer_session_id);
  RETURN 'approved';
END;
$$;

REVOKE ALL ON FUNCTION public.review_member_payment_submission(uuid, uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_member_payment_submission(uuid, uuid, boolean, text) TO service_role;

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
  AFTER INSERT OR UPDATE OF ends_at, status ON public.member_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.extend_rentals_for_subscription();

CREATE OR REPLACE FUNCTION public.sync_member_rental_subscription_period()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_subscription public.member_subscriptions%ROWTYPE;
BEGIN
  SELECT * INTO v_subscription
  FROM public.member_subscriptions AS subscription
  WHERE subscription.id = NEW.id;
  IF FOUND THEN
    UPDATE public.member_profiles AS member
    SET rental_subscription_start = v_subscription.started_at,
        rental_subscription_expires_at = v_subscription.ends_at,
        updated_at = pg_catalog.clock_timestamp()
    WHERE member.id = v_subscription.member_id;
  END IF;
  RETURN NEW;
END;
$$;
