ALTER TABLE public.member_profiles
  ADD COLUMN IF NOT EXISTS referral_code text,
  ADD COLUMN IF NOT EXISTS wallet_balance numeric(12,2) NOT NULL DEFAULT 0;

UPDATE public.member_profiles AS member
SET referral_code = 'ref_' || pg_catalog.substr(pg_catalog.md5(member.id::text), 1, 10)
WHERE member.referral_code IS NULL;

ALTER TABLE public.member_profiles
  ALTER COLUMN referral_code SET NOT NULL,
  ALTER COLUMN referral_code SET DEFAULT ('ref_' || pg_catalog.substr(pg_catalog.md5(pg_catalog.gen_random_uuid()::text), 1, 10));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.member_profiles'::regclass
      AND conname = 'member_profiles_wallet_balance_nonnegative'
  ) THEN
    ALTER TABLE public.member_profiles
      ADD CONSTRAINT member_profiles_wallet_balance_nonnegative CHECK (wallet_balance >= 0);
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS member_profiles_referral_code_uidx
  ON public.member_profiles (referral_code);

CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES public.member_profiles(id) ON DELETE CASCADE,
  referred_user_id uuid NOT NULL UNIQUE REFERENCES public.member_profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'rewarded')),
  reward_days_granted integer NOT NULL DEFAULT 10 CHECK (reward_days_granted > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT referrals_not_self CHECK (referrer_id <> referred_user_id)
);

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  transaction_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.member_profiles(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  type text NOT NULL CHECK (type IN ('TOPUP', 'LATE_FEE', 'SUBSCRIPTION_RENEWAL')),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'FAILED')),
  payment_method text NOT NULL CHECK (payment_method IN ('bkash', 'nagad')),
  trx_id text NOT NULL,
  payer_phone text NOT NULL,
  admin_note text,
  reviewed_at timestamptz,
  reviewed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS referrals_referrer_created_idx
  ON public.referrals (referrer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS wallet_transactions_user_created_idx
  ON public.wallet_transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS wallet_transactions_status_created_idx
  ON public.wallet_transactions (status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS wallet_transactions_trx_id_active_uidx
  ON public.wallet_transactions (pg_catalog.upper(trx_id))
  WHERE status IN ('PENDING', 'APPROVED');

CREATE OR REPLACE FUNCTION public.prevent_duplicate_wallet_trx_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_trx_id text := pg_catalog.upper(pg_catalog.btrim(NEW.trx_id));
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_trx_id, 0));
  IF EXISTS (
    SELECT 1 FROM public.payment_submissions AS payment
    WHERE pg_catalog.upper(payment.transaction_id) = v_trx_id
      AND payment.status IN ('pending', 'approved')
  ) THEN
    RAISE EXCEPTION 'This transaction ID has already been submitted for review.' USING ERRCODE = '23505';
  END IF;
  NEW.trx_id := v_trx_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_duplicate_payment_submission_trx_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_trx_id text := pg_catalog.upper(pg_catalog.btrim(NEW.transaction_id));
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_trx_id, 0));
  IF EXISTS (
    SELECT 1 FROM public.wallet_transactions AS transaction
    WHERE pg_catalog.upper(transaction.trx_id) = v_trx_id
      AND transaction.status IN ('PENDING', 'APPROVED')
  ) THEN
    RAISE EXCEPTION 'This transaction ID has already been submitted for review.' USING ERRCODE = '23505';
  END IF;
  NEW.transaction_id := v_trx_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wallet_transactions_global_trx_id ON public.wallet_transactions;
CREATE TRIGGER wallet_transactions_global_trx_id
  BEFORE INSERT ON public.wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_duplicate_wallet_trx_id();

DROP TRIGGER IF EXISTS payment_submissions_global_trx_id ON public.payment_submissions;
CREATE TRIGGER payment_submissions_global_trx_id
  BEFORE INSERT OR UPDATE OF transaction_id ON public.payment_submissions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_duplicate_payment_submission_trx_id();

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.referrals, public.wallet_transactions TO authenticated;
GRANT ALL ON public.referrals, public.wallet_transactions TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.referrals, public.wallet_transactions FROM authenticated;

CREATE POLICY "Members can view referrals they are part of"
  ON public.referrals FOR SELECT TO authenticated
  USING (
    referrer_id IN (SELECT id FROM public.member_profiles WHERE user_id = auth.uid())
    OR referred_user_id IN (SELECT id FROM public.member_profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Members can view their wallet transactions"
  ON public.wallet_transactions FOR SELECT TO authenticated
  USING (user_id IN (SELECT id FROM public.member_profiles WHERE user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.prevent_member_wallet_identity_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() = NEW.user_id THEN
      NEW.referral_code := 'ref_' || pg_catalog.substr(pg_catalog.md5(pg_catalog.gen_random_uuid()::text), 1, 10);
      NEW.wallet_balance := 0;
    END IF;
    RETURN NEW;
  END IF;

  IF auth.uid() = OLD.user_id AND (
    NEW.referral_code IS DISTINCT FROM OLD.referral_code
    OR NEW.wallet_balance IS DISTINCT FROM OLD.wallet_balance
  ) THEN
    RAISE EXCEPTION 'Referral codes and wallet balances are system-managed.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS member_profiles_protect_wallet_identity ON public.member_profiles;
CREATE TRIGGER member_profiles_protect_wallet_identity
  BEFORE INSERT OR UPDATE ON public.member_profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_member_wallet_identity_changes();

CREATE OR REPLACE FUNCTION public.link_member_referral(p_member_id uuid, p_referral_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_referrer_id uuid;
BEGIN
  SELECT member.id INTO v_referrer_id
  FROM public.member_profiles AS member
  WHERE member.referral_code = pg_catalog.lower(pg_catalog.btrim(p_referral_code));

  IF v_referrer_id IS NULL OR v_referrer_id = p_member_id THEN
    RETURN false;
  END IF;

  INSERT INTO public.referrals (referrer_id, referred_user_id)
  VALUES (v_referrer_id, p_member_id)
  ON CONFLICT (referred_user_id) DO NOTHING;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.link_member_referral(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_member_referral(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.reward_member_referral_on_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_referral record;
  v_referrer_subscription_id uuid;
  v_referred_subscription_id uuid;
  v_now timestamptz := pg_catalog.clock_timestamp();
BEGIN
  IF NEW.status <> 'active' OR NOT EXISTS (
    SELECT 1 FROM public.subscription_plans AS plan
    WHERE plan.id = NEW.plan_id AND plan.duration_days = 30
  ) THEN
    RETURN NEW;
  END IF;

  FOR v_referral IN
    SELECT referral.id, referral.referrer_id, referral.referred_user_id, referral.reward_days_granted
    FROM public.referrals AS referral
    WHERE referral.status = 'pending'
      AND (referral.referrer_id = NEW.member_id OR referral.referred_user_id = NEW.member_id)
    ORDER BY referral.created_at, referral.id
    FOR UPDATE
  LOOP
    SELECT subscription.id INTO v_referrer_subscription_id
    FROM public.member_subscriptions AS subscription
    JOIN public.subscription_plans AS plan ON plan.id = subscription.plan_id
    WHERE subscription.member_id = v_referral.referrer_id AND plan.duration_days = 30
    ORDER BY subscription.started_at DESC, subscription.id DESC
    LIMIT 1
    FOR UPDATE OF subscription;

    SELECT subscription.id INTO v_referred_subscription_id
    FROM public.member_subscriptions AS subscription
    JOIN public.subscription_plans AS plan ON plan.id = subscription.plan_id
    WHERE subscription.member_id = v_referral.referred_user_id AND plan.duration_days = 30
    ORDER BY subscription.started_at DESC, subscription.id DESC
    LIMIT 1
    FOR UPDATE OF subscription;

    IF v_referrer_subscription_id IS NULL OR v_referred_subscription_id IS NULL THEN
      CONTINUE;
    END IF;

    UPDATE public.member_subscriptions AS subscription
    SET ends_at = GREATEST(COALESCE(subscription.ends_at, v_now), v_now)
        + pg_catalog.make_interval(days => v_referral.reward_days_granted),
        status = 'active',
        updated_at = v_now
    WHERE subscription.id IN (v_referrer_subscription_id, v_referred_subscription_id);

    UPDATE public.referrals AS referral
    SET status = 'rewarded'
    WHERE referral.id = v_referral.id AND referral.status = 'pending';

    INSERT INTO public.notifications (member_id, type, title, message)
    VALUES
      (v_referral.referrer_id, 'payment_approved', 'Referral reward earned',
       pg_catalog.format('You and your invited member each received %s bonus subscription days.', v_referral.reward_days_granted)),
      (v_referral.referred_user_id, 'payment_approved', 'Referral reward earned',
       pg_catalog.format('You and your referrer each received %s bonus subscription days.', v_referral.reward_days_granted));
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS member_subscriptions_reward_referral ON public.member_subscriptions;
CREATE TRIGGER member_subscriptions_reward_referral
  AFTER INSERT ON public.member_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.reward_member_referral_on_subscription();

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

REVOKE ALL ON FUNCTION public.submit_wallet_transaction(numeric, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_wallet_transaction(numeric, text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_wallet_transaction(
  p_transaction_id uuid,
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
  v_transaction public.wallet_transactions%ROWTYPE;
  v_member public.member_profiles%ROWTYPE;
  v_plan public.subscription_plans%ROWTYPE;
  v_subscription_id uuid;
  v_subscription_ends_at timestamptz;
  v_outstanding numeric(12,2);
  v_fine_ids uuid[];
  v_note text := pg_catalog.left(pg_catalog.btrim(COALESCE(p_admin_note, '')), 1000);
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_sessions AS session
    WHERE session.id = p_reviewer_session_id AND session.expires_at > v_now
  ) THEN
    RAISE EXCEPTION 'Admin session is no longer valid.' USING ERRCODE = '42501';
  END IF;
  IF p_approve IS NULL THEN
    RAISE EXCEPTION 'A review decision is required.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_transaction FROM public.wallet_transactions AS transaction
  WHERE transaction.transaction_id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet transaction not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_transaction.status <> 'PENDING' THEN
    RETURN CASE WHEN v_transaction.status = 'APPROVED' THEN 'already_approved' ELSE 'already_failed' END;
  END IF;

  SELECT * INTO v_member FROM public.member_profiles AS member
  WHERE member.id = v_transaction.user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found.' USING ERRCODE = 'P0002';
  END IF;

  IF p_approve AND v_transaction.type = 'LATE_FEE' THEN
    SELECT COALESCE(pg_catalog.array_agg(locked_fine.id), ARRAY[]::uuid[])
    INTO v_fine_ids
    FROM (
      SELECT fine.id
      FROM public.fine_ledger AS fine
      WHERE fine.member_id = v_member.id AND fine.status = 'outstanding'
      ORDER BY fine.id
      FOR UPDATE
    ) AS locked_fine;

    SELECT COALESCE(pg_catalog.sum(fine.amount_bdt), 0) INTO v_outstanding
    FROM public.fine_ledger AS fine
    WHERE fine.id = ANY(v_fine_ids);
    IF v_outstanding <= 0 OR v_outstanding <> v_transaction.amount THEN
      RAISE EXCEPTION 'Outstanding late fees changed after payment submission.' USING ERRCODE = '23514';
    END IF;
  ELSIF p_approve AND v_transaction.type = 'SUBSCRIPTION_RENEWAL' THEN
    IF v_member.membership_status <> 'active' OR v_member.current_plan_id IS NULL THEN
      RAISE EXCEPTION 'The member is not eligible for a subscription payment.' USING ERRCODE = '23514';
    END IF;
    SELECT * INTO v_plan FROM public.subscription_plans AS plan
    WHERE plan.id = v_member.current_plan_id AND plan.is_active AND plan.duration_days = 30
    FOR SHARE;
    IF NOT FOUND OR v_transaction.amount <> v_plan.price_bdt THEN
      RAISE EXCEPTION 'The transaction does not match the assigned 30-day plan.' USING ERRCODE = '23514';
    END IF;
  END IF;

  UPDATE public.wallet_transactions AS transaction
  SET status = CASE WHEN p_approve THEN 'APPROVED' ELSE 'FAILED' END,
      reviewed_at = v_now,
      reviewed_by = p_reviewer_session_id,
      admin_note = NULLIF(v_note, '')
  WHERE transaction.transaction_id = v_transaction.transaction_id
    AND transaction.status = 'PENDING';

  IF NOT p_approve THEN
    INSERT INTO public.notifications (member_id, type, title, message)
    VALUES (v_member.id, 'payment_rejected', 'Payment needs review',
      pg_catalog.format('Your %s payment of BDT %s was not approved. %s',
        pg_catalog.lower(v_transaction.type), v_transaction.amount, COALESCE(NULLIF(v_note, ''), 'Please contact the library.')));
    RETURN 'rejected';
  END IF;

  IF v_transaction.type = 'TOPUP' THEN
    UPDATE public.member_profiles
    SET wallet_balance = wallet_balance + v_transaction.amount, updated_at = v_now
    WHERE id = v_member.id;
  ELSIF v_transaction.type = 'LATE_FEE' THEN
    UPDATE public.fine_ledger AS fine
    SET status = 'paid', paid_at = v_now
    WHERE fine.id = ANY(v_fine_ids) AND fine.status = 'outstanding';
  ELSE
    SELECT subscription.id, subscription.ends_at
    INTO v_subscription_id, v_subscription_ends_at
    FROM public.member_subscriptions AS subscription
    WHERE subscription.member_id = v_member.id
      AND subscription.plan_id = v_plan.id
      AND subscription.status = 'active'
      AND subscription.ends_at > v_now
    ORDER BY subscription.ends_at DESC, subscription.id DESC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
      UPDATE public.member_subscriptions AS subscription
      SET ends_at = v_subscription_ends_at + pg_catalog.make_interval(days => 30), updated_at = v_now
      WHERE subscription.id = v_subscription_id;
    ELSE
      UPDATE public.member_subscriptions AS subscription
      SET status = 'expired', updated_at = v_now
      WHERE subscription.member_id = v_member.id AND subscription.status = 'active';

      INSERT INTO public.member_subscriptions (
        member_id, plan_id, plan_name_snapshot, plan_price_snapshot, status, started_at, ends_at
      ) VALUES (
        v_member.id, v_plan.id, v_plan.name, v_plan.price_bdt, 'active', v_now,
        v_now + pg_catalog.make_interval(days => 30)
      );
    END IF;

    UPDATE public.member_profiles
    SET current_plan_id = v_plan.id, updated_at = v_now
    WHERE id = v_member.id;
  END IF;

  INSERT INTO public.notifications (member_id, type, title, message)
  VALUES (v_member.id, 'payment_approved', 'Payment verified',
    CASE v_transaction.type
      WHEN 'TOPUP' THEN pg_catalog.format('BDT %s was added to your account balance.', v_transaction.amount)
      WHEN 'LATE_FEE' THEN 'Your outstanding late fees have been cleared.'
      ELSE 'Your 30-day subscription is now active or extended.'
    END);
  RETURN 'approved';
END;
$$;

REVOKE ALL ON FUNCTION public.review_wallet_transaction(uuid, uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_wallet_transaction(uuid, uuid, boolean, text) TO service_role;

CREATE OR REPLACE FUNCTION public.block_rentals_with_outstanding_fines()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.fine_ledger AS fine
    WHERE fine.member_id = NEW.member_id AND fine.status = 'outstanding'
  ) THEN
    RAISE EXCEPTION 'Outstanding late fees must be paid before requesting another rental.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rental_requests_block_unpaid_fines ON public.rental_requests;
CREATE TRIGGER rental_requests_block_unpaid_fines
  BEFORE INSERT ON public.rental_requests
  FOR EACH ROW EXECUTE FUNCTION public.block_rentals_with_outstanding_fines();

REVOKE ALL ON FUNCTION public.prevent_member_wallet_identity_changes() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.reward_member_referral_on_subscription() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.block_rentals_with_outstanding_fines() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.prevent_duplicate_wallet_trx_id() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.prevent_duplicate_payment_submission_trx_id() FROM PUBLIC, anon, authenticated, service_role;