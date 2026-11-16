CREATE TABLE IF NOT EXISTS public.referral_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id uuid NOT NULL REFERENCES public.referrals(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.member_profiles(id) ON DELETE CASCADE,
  bonus_days_awarded integer NOT NULL DEFAULT 10 CHECK (bonus_days_awarded = 10),
  status text NOT NULL CHECK (status IN ('locked', 'claimed')),
  locked_at timestamptz,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT referral_rewards_referral_member_unique UNIQUE (referral_id, member_id),
  CONSTRAINT referral_rewards_status_timestamps_check CHECK (
    (status = 'locked' AND locked_at IS NOT NULL AND claimed_at IS NULL)
    OR (status = 'claimed' AND claimed_at IS NOT NULL)
  )
);

ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.referral_rewards FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.referral_rewards TO authenticated;
GRANT ALL ON public.referral_rewards TO service_role;
CREATE POLICY "Members can read their referral rewards"
  ON public.referral_rewards FOR SELECT TO authenticated
  USING (member_id IN (SELECT id FROM public.member_profiles WHERE user_id = auth.uid()));

CREATE OR REPLACE TRIGGER referral_rewards_set_updated_at
  BEFORE UPDATE ON public.referral_rewards
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Rewards from the previous system were already applied to subscription rows.
-- Record those claims and backfill the profile expiry without extending subscriptions again.
WITH completed_referral_members AS (
  SELECT referral.id AS referral_id, referral.referrer_id AS member_id,
         referral.bonus_days_awarded, referral.completed_at
  FROM public.referrals AS referral
  WHERE referral.status = 'completed'
  UNION ALL
  SELECT referral.id AS referral_id, referral.referee_id AS member_id,
         referral.bonus_days_awarded, referral.completed_at
  FROM public.referrals AS referral
  WHERE referral.status = 'completed'
), inserted_claims AS (
  INSERT INTO public.referral_rewards (
    referral_id, member_id, bonus_days_awarded, status, claimed_at
  )
  SELECT referral_id, member_id, 10, 'claimed', COALESCE(completed_at, now())
  FROM completed_referral_members
  ON CONFLICT (referral_id, member_id) DO NOTHING
  RETURNING member_id, bonus_days_awarded
), claim_days AS (
  SELECT member_id, pg_catalog.sum(bonus_days_awarded)::integer AS days
  FROM inserted_claims
  GROUP BY member_id
)
UPDATE public.member_profiles AS member
SET membership_expires_at = GREATEST(COALESCE(member.membership_expires_at, now()), now())
      + pg_catalog.make_interval(days => claim_days.days),
    updated_at = now()
FROM claim_days
WHERE member.id = claim_days.member_id;

CREATE OR REPLACE FUNCTION public.reward_pending_member_referrals(p_member_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_referral record;
  v_member record;
  v_reward_status text;
  v_reward_id uuid;
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

    FOR v_member IN
      SELECT member.id, member.membership_status, member.membership_expires_at
      FROM public.member_profiles AS member
      WHERE member.id IN (v_referral.referrer_id, v_referral.referee_id)
      ORDER BY member.id
      FOR UPDATE
    LOOP
      v_reward_status := CASE
        WHEN v_member.membership_status = 'active'
          AND v_member.membership_expires_at > v_now + INTERVAL '5 days'
          THEN 'claimed'
        ELSE 'locked'
      END;

      INSERT INTO public.referral_rewards (
        referral_id, member_id, bonus_days_awarded, status, locked_at, claimed_at
      ) VALUES (
        v_referral.id, v_member.id, 10, v_reward_status,
        CASE WHEN v_reward_status = 'locked' THEN v_now ELSE NULL END,
        CASE WHEN v_reward_status = 'claimed' THEN v_now ELSE NULL END
      )
      ON CONFLICT (referral_id, member_id) DO NOTHING
      RETURNING id INTO v_reward_id;
      IF NOT FOUND THEN
        CONTINUE;
      END IF;

      IF v_reward_status = 'claimed' THEN
        UPDATE public.member_profiles AS member
        SET membership_expires_at = GREATEST(COALESCE(member.membership_expires_at, v_now), v_now)
              + INTERVAL '10 days',
            updated_at = v_now
        WHERE member.id = v_member.id;

        UPDATE public.member_subscriptions AS subscription
        SET ends_at = GREATEST(subscription.ends_at, v_now) + INTERVAL '10 days',
            updated_at = v_now
        WHERE subscription.id = (
          SELECT candidate.id
          FROM public.member_subscriptions AS candidate
          WHERE candidate.member_id = v_member.id
            AND candidate.status = 'active'
            AND candidate.ends_at > v_now
          ORDER BY candidate.ends_at DESC, candidate.id DESC
          LIMIT 1
          FOR UPDATE
        );

        INSERT INTO public.notifications (member_id, type, title, message)
        VALUES (v_member.id, 'payment_approved', 'Referral reward earned',
          'Your referral reward of 10 days has been added to your membership.');
      ELSE
        INSERT INTO public.notifications (member_id, type, title, message)
        VALUES (v_member.id, 'payment_approved', 'Referral reward locked',
          'Your 10-day referral reward is locked and will be applied when you renew your membership or rental subscription.');
      END IF;
    END LOOP;

    v_reward_count := v_reward_count + 1;
  END LOOP;

  RETURN v_reward_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_locked_referral_rewards_on_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_reward record;
  v_total_days integer := 0;
  v_now timestamptz := pg_catalog.clock_timestamp();
BEGIN
  IF NEW.status <> 'active' OR NEW.ends_at IS NULL OR NEW.ends_at <= v_now THEN
    RETURN NEW;
  END IF;

  FOR v_reward IN
    SELECT reward.id, reward.bonus_days_awarded
    FROM public.referral_rewards AS reward
    WHERE reward.member_id = NEW.member_id
      AND reward.status = 'locked'
    ORDER BY reward.id
    FOR UPDATE
  LOOP
    UPDATE public.referral_rewards
    SET status = 'claimed', claimed_at = v_now, updated_at = v_now
    WHERE id = v_reward.id AND status = 'locked';
    IF FOUND THEN
      v_total_days := v_total_days + v_reward.bonus_days_awarded;
    END IF;
  END LOOP;

  IF v_total_days = 0 THEN
    RETURN NEW;
  END IF;

  UPDATE public.member_profiles AS member
  SET membership_expires_at = GREATEST(COALESCE(member.membership_expires_at, v_now), v_now)
        + pg_catalog.make_interval(days => v_total_days),
      updated_at = v_now
  WHERE member.id = NEW.member_id;

  UPDATE public.member_subscriptions AS subscription
  SET ends_at = GREATEST(subscription.ends_at, v_now) + pg_catalog.make_interval(days => v_total_days),
      updated_at = v_now
  WHERE subscription.id = NEW.id;

  INSERT INTO public.notifications (member_id, type, title, message)
  VALUES (NEW.member_id, 'payment_approved', 'Locked referral reward applied',
    pg_catalog.format('Your locked referral reward of %s days has been applied to your renewed subscription.', v_total_days));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS member_subscriptions_apply_locked_referral_rewards ON public.member_subscriptions;
CREATE TRIGGER member_subscriptions_apply_locked_referral_rewards
  AFTER INSERT ON public.member_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.apply_locked_referral_rewards_on_subscription();

REVOKE ALL ON FUNCTION public.reward_pending_member_referrals(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.apply_locked_referral_rewards_on_subscription() FROM PUBLIC, anon, authenticated, service_role;