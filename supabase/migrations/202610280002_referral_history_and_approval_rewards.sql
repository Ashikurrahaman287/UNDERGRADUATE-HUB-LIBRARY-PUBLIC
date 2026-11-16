ALTER TABLE public.referrals
  RENAME COLUMN referred_user_id TO referee_id;

ALTER TABLE public.referrals
  RENAME COLUMN reward_days_granted TO bonus_days_awarded;

ALTER TABLE public.referrals
  RENAME CONSTRAINT referrals_referred_user_id_fkey TO referrals_referee_id_fkey;

ALTER TABLE public.referrals
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE TRIGGER referrals_set_updated_at
  BEFORE UPDATE ON public.referrals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

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

  INSERT INTO public.referrals (referrer_id, referee_id)
  VALUES (v_referrer_id, p_member_id)
  ON CONFLICT (referee_id) DO NOTHING;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.reward_pending_member_referrals(p_member_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_referral record;
  v_referrer_subscription_id uuid;
  v_referee_subscription_id uuid;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_reward_count integer := 0;
BEGIN
  FOR v_referral IN
    SELECT referral.id, referral.referrer_id, referral.referee_id, referral.bonus_days_awarded
    FROM public.referrals AS referral
    WHERE referral.status = 'pending'
      AND (referral.referrer_id = p_member_id OR referral.referee_id = p_member_id)
    ORDER BY referral.id
    FOR UPDATE
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_referral.id::text, 0));

    IF NOT EXISTS (
      SELECT 1
      FROM public.payment_submissions AS payment
      JOIN public.rental_requests AS request
        ON request.id = payment.related_rental_request_id
      JOIN public.subscription_plans AS plan
        ON plan.id = request.subscription_plan_id
      WHERE payment.member_id = v_referral.referee_id
        AND payment.payment_type = 'rental'
        AND payment.status = 'approved'
        AND payment.amount_bdt = 29
        AND request.member_id = v_referral.referee_id
        AND request.amount_bdt = 29
        AND plan.price_bdt = 29
        AND plan.duration_days = 30
    ) THEN
      CONTINUE;
    END IF;

    PERFORM 1
    FROM public.member_subscriptions AS subscription
    WHERE subscription.member_id IN (v_referral.referrer_id, v_referral.referee_id)
      AND subscription.status = 'active'
      AND subscription.ends_at > v_now
    ORDER BY subscription.member_id, subscription.id
    FOR UPDATE;

    SELECT subscription.id INTO v_referrer_subscription_id
    FROM public.member_subscriptions AS subscription
    WHERE subscription.member_id = v_referral.referrer_id
      AND subscription.status = 'active'
      AND subscription.ends_at > v_now
    ORDER BY subscription.ends_at DESC, subscription.id DESC
    LIMIT 1;

    SELECT subscription.id INTO v_referee_subscription_id
    FROM public.member_subscriptions AS subscription
    WHERE subscription.member_id = v_referral.referee_id
      AND subscription.status = 'active'
      AND subscription.ends_at > v_now
    ORDER BY subscription.ends_at DESC, subscription.id DESC
    LIMIT 1;

    IF v_referrer_subscription_id IS NULL OR v_referee_subscription_id IS NULL THEN
      CONTINUE;
    END IF;

    UPDATE public.referrals AS referral
    SET status = 'rewarded', updated_at = v_now
    WHERE referral.id = v_referral.id AND referral.status = 'pending';
    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    UPDATE public.member_subscriptions AS subscription
    SET ends_at = subscription.ends_at + pg_catalog.make_interval(days => v_referral.bonus_days_awarded),
        updated_at = v_now
    WHERE subscription.id IN (v_referrer_subscription_id, v_referee_subscription_id);

    INSERT INTO public.notifications (member_id, type, title, message)
    VALUES
      (v_referral.referrer_id, 'payment_approved', 'Referral reward earned',
       'You''ve earned 10 bonus reading days through the Undergraduate Hub Referral Program!'),
      (v_referral.referee_id, 'payment_approved', 'Referral reward earned',
       'You''ve earned 10 bonus reading days through the Undergraduate Hub Referral Program!');

    v_reward_count := v_reward_count + 1;
  END LOOP;

  RETURN v_reward_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.try_reward_referral_after_subscription_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.reward_pending_member_referrals(NEW.member_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.try_reward_referral_after_first_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM NEW.status
    AND NEW.payment_type = 'rental' AND NEW.amount_bdt = 29 THEN
    PERFORM public.reward_pending_member_referrals(NEW.member_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS member_subscriptions_reward_referral ON public.member_subscriptions;
DROP FUNCTION IF EXISTS public.reward_member_referral_on_subscription();

DROP TRIGGER IF EXISTS member_subscriptions_try_referral_reward ON public.member_subscriptions;
CREATE TRIGGER member_subscriptions_try_referral_reward
  AFTER INSERT OR UPDATE OF status, ends_at ON public.member_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.try_reward_referral_after_subscription_change();

DROP TRIGGER IF EXISTS payment_submissions_try_referral_reward ON public.payment_submissions;
CREATE TRIGGER payment_submissions_try_referral_reward
  AFTER UPDATE OF status ON public.payment_submissions
  FOR EACH ROW EXECUTE FUNCTION public.try_reward_referral_after_first_payment();

REVOKE ALL ON FUNCTION public.link_member_referral(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_member_referral(uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.reward_pending_member_referrals(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.try_reward_referral_after_subscription_change() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.try_reward_referral_after_first_payment() FROM PUBLIC, anon, authenticated, service_role;