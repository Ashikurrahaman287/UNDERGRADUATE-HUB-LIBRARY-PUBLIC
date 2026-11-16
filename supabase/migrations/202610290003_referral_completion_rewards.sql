ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

ALTER TABLE public.referrals
  DROP CONSTRAINT IF EXISTS referrals_status_check;

UPDATE public.referrals
SET status = 'completed',
    completed_at = COALESCE(completed_at, updated_at)
WHERE status = 'rewarded';

ALTER TABLE public.referrals
  ADD CONSTRAINT referrals_status_check
  CHECK (status IN ('pending', 'completed'));

CREATE OR REPLACE FUNCTION public.reward_pending_member_referrals(p_member_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_referral record;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_reward_count integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.member_profiles AS member
    WHERE member.id = p_member_id AND member.membership_status = 'active'
  ) THEN
    RETURN 0;
  END IF;

  FOR v_referral IN
    SELECT referral.id, referral.referrer_id, referral.referee_id
    FROM public.referrals AS referral
    WHERE referral.referee_id = p_member_id
      AND referral.status = 'pending'
    ORDER BY referral.id
    FOR UPDATE
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_referral.id::text, 0));

    UPDATE public.referrals
    SET status = 'completed', completed_at = v_now,
        bonus_days_awarded = 10, updated_at = v_now
    WHERE id = v_referral.id AND status = 'pending';
    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    UPDATE public.member_profiles AS member
    SET membership_expires_at = GREATEST(COALESCE(member.membership_expires_at, v_now), v_now)
          + pg_catalog.make_interval(days => 10),
        updated_at = v_now
    WHERE member.id IN (v_referral.referrer_id, v_referral.referee_id);

    UPDATE public.member_subscriptions AS subscription
    SET ends_at = GREATEST(subscription.ends_at, v_now) + pg_catalog.make_interval(days => 10),
        updated_at = v_now
    WHERE subscription.id IN (
      SELECT DISTINCT ON (candidate.member_id) candidate.id
      FROM public.member_subscriptions AS candidate
      WHERE candidate.member_id IN (v_referral.referrer_id, v_referral.referee_id)
        AND candidate.status = 'active'
        AND candidate.ends_at > v_now
      ORDER BY candidate.member_id, candidate.ends_at DESC, candidate.id DESC
    );

    INSERT INTO public.notifications (member_id, type, title, message)
    VALUES
      (v_referral.referrer_id, 'payment_approved', 'Referral reward earned', 'Your friend activated their membership. You both received 10 bonus days.'),
      (v_referral.referee_id, 'payment_approved', 'Welcome referral reward', 'Your membership is active. You and your friend received 10 bonus days.');

    v_reward_count := v_reward_count + 1;
  END LOOP;

  RETURN v_reward_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.try_complete_referral_on_member_activation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.membership_status = 'active' AND TG_OP = 'INSERT' THEN
    PERFORM public.reward_pending_member_referrals(NEW.id);
  ELSIF NEW.membership_status = 'active'
    AND TG_OP = 'UPDATE'
    AND OLD.membership_status IS DISTINCT FROM NEW.membership_status THEN
    PERFORM public.reward_pending_member_referrals(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.try_complete_referral_on_signup_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.reward_pending_member_referrals(NEW.referee_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.try_complete_referral_on_rental_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.reward_pending_member_referrals(NEW.member_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS member_subscriptions_try_referral_reward ON public.member_subscriptions;
DROP TRIGGER IF EXISTS payment_submissions_try_referral_reward ON public.payment_submissions;
DROP FUNCTION IF EXISTS public.try_reward_referral_after_subscription_change();
DROP FUNCTION IF EXISTS public.try_reward_referral_after_first_payment();

DROP TRIGGER IF EXISTS member_profiles_complete_referral_on_activation ON public.member_profiles;
CREATE TRIGGER member_profiles_complete_referral_on_activation
  AFTER UPDATE OF membership_status ON public.member_profiles
  FOR EACH ROW EXECUTE FUNCTION public.try_complete_referral_on_member_activation();

DROP TRIGGER IF EXISTS member_profiles_complete_referral_on_insert ON public.member_profiles;
CREATE TRIGGER member_profiles_complete_referral_on_insert
  AFTER INSERT ON public.member_profiles
  FOR EACH ROW EXECUTE FUNCTION public.try_complete_referral_on_member_activation();

DROP TRIGGER IF EXISTS referrals_complete_when_friend_active ON public.referrals;
CREATE TRIGGER referrals_complete_when_friend_active
  AFTER INSERT ON public.referrals
  FOR EACH ROW EXECUTE FUNCTION public.try_complete_referral_on_signup_link();

DROP TRIGGER IF EXISTS rental_requests_complete_referral_on_approval ON public.rental_requests;
CREATE TRIGGER rental_requests_complete_referral_on_approval
  AFTER UPDATE OF status ON public.rental_requests
  FOR EACH ROW EXECUTE FUNCTION public.try_complete_referral_on_rental_approval();

REVOKE ALL ON FUNCTION public.reward_pending_member_referrals(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.try_complete_referral_on_member_activation() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.try_complete_referral_on_signup_link() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.try_complete_referral_on_rental_approval() FROM PUBLIC, anon, authenticated, service_role;

DO $$
DECLARE
  v_member_id uuid;
BEGIN
  FOR v_member_id IN
    SELECT DISTINCT referral.referee_id
    FROM public.referrals AS referral
    JOIN public.member_profiles AS member ON member.id = referral.referee_id
    WHERE referral.status = 'pending'
      AND member.membership_status = 'active'
  LOOP
    PERFORM public.reward_pending_member_referrals(v_member_id);
  END LOOP;
END;
$$;