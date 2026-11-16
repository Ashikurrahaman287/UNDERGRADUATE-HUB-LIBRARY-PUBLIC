-- Expire subscriptions and accrue idempotent daily overdue liabilities.

CREATE TABLE IF NOT EXISTS public.fine_accrual_control (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  accrual_start_date date NOT NULL
);

INSERT INTO public.fine_accrual_control (singleton, accrual_start_date)
VALUES (true, (pg_catalog.statement_timestamp() AT TIME ZONE 'Asia/Dhaka')::date)
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.fine_accrual_cursors (
  rental_id uuid PRIMARY KEY REFERENCES public.rentals(id) ON DELETE CASCADE,
  next_fine_date date NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

ALTER TABLE public.fine_accrual_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fine_accrual_cursors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fine_accrual_control, public.fine_accrual_cursors FROM PUBLIC, anon, authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.fine_ledger
    WHERE rental_id IS NOT NULL
    GROUP BY rental_id, fine_date
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate fine records exist for a rental and business date; review them before enabling accrual.';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS fine_ledger_rental_business_date_uidx
  ON public.fine_ledger (rental_id, fine_date)
  WHERE rental_id IS NOT NULL;

REVOKE ALL ON public.fine_ledger FROM authenticated;
GRANT SELECT ON public.fine_ledger TO authenticated;
GRANT ALL ON public.fine_ledger TO service_role;

DROP POLICY IF EXISTS "Members see own fines" ON public.fine_ledger;
DROP POLICY IF EXISTS "Members update own fines only for status changes" ON public.fine_ledger;
CREATE POLICY "Members see own fines"
  ON public.fine_ledger FOR SELECT TO authenticated
  USING (member_id IN (SELECT id FROM public.member_profiles WHERE user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.enforce_active_subscription_for_rental_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.member_profiles AS member
    JOIN public.member_subscriptions AS subscription
      ON subscription.member_id = member.id
    JOIN public.subscription_plans AS plan
      ON plan.id = subscription.plan_id
    WHERE member.id = NEW.member_id
      AND member.membership_status = 'active'
      AND (member.current_plan_id IS NULL OR member.current_plan_id = NEW.subscription_plan_id)
      AND subscription.plan_id = NEW.subscription_plan_id
      AND subscription.status = 'active'
      AND subscription.ends_at > pg_catalog.clock_timestamp()
      AND plan.is_active = true
  ) THEN
    RAISE EXCEPTION 'An active member subscription is required for a rental request.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rental_requests_require_active_subscription ON public.rental_requests;
CREATE TRIGGER rental_requests_require_active_subscription
  BEFORE INSERT ON public.rental_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_active_subscription_for_rental_request();

CREATE OR REPLACE FUNCTION public.accrue_overdue_fines()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_business_date date;
  v_last_fine_date date;
  v_accrual_start_date date;
  v_daily_rate numeric(12,2);
  v_expired_subscriptions integer := 0;
  v_rentals_marked_overdue integer := 0;
  v_fine_entries_created integer := 0;
  v_catch_up_rentals_pending integer := 0;
  v_rental record;
  v_subscription_end timestamptz;
  v_expiry_business_date date;
  v_first_fine_date date;
  v_last_eligible_date date;
  v_next_fine_date date;
  v_batch_last_date date;
  v_fine_date date;
  v_inserted integer;
BEGIN
  v_business_date := (v_now AT TIME ZONE 'Asia/Dhaka')::date;

  SELECT setting.value_number INTO v_daily_rate
  FROM public.library_settings AS setting
  WHERE setting.key = 'fine_per_day_bdt';

  IF NOT FOUND
    OR v_daily_rate IS NULL
    OR v_daily_rate <= 0
    OR v_daily_rate > 1000
    OR v_daily_rate::text !~ '^[0-9]+([.][0-9]+)?$' THEN
    RAISE EXCEPTION 'The configured daily fine rate is missing or invalid.' USING ERRCODE = '22023';
  END IF;

  SELECT control.accrual_start_date INTO v_accrual_start_date
  FROM public.fine_accrual_control AS control
  WHERE control.singleton = true;
  IF NOT FOUND OR v_accrual_start_date > v_business_date THEN
    RAISE EXCEPTION 'The fine accrual start date is missing or invalid.' USING ERRCODE = '22023';
  END IF;

  v_last_fine_date := v_business_date - 1;

  UPDATE public.member_subscriptions AS subscription
  SET status = 'expired', updated_at = v_now
  WHERE subscription.status = 'active'
    AND subscription.ends_at IS NOT NULL
    AND subscription.ends_at <= v_now;
  GET DIAGNOSTICS v_expired_subscriptions = ROW_COUNT;

  FOR v_rental IN
    SELECT rental.id,
           rental.member_id,
           rental.subscription_ends_at,
           rental.returned_at,
           rental.status
    FROM public.rentals AS rental
    WHERE rental.status IN ('active', 'overdue', 'returned')
      AND (rental.status <> 'returned' OR rental.returned_at IS NOT NULL)
    ORDER BY rental.id
    FOR UPDATE OF rental
  LOOP
    SELECT subscription.ends_at INTO v_subscription_end
    FROM public.member_profiles AS member
    JOIN public.member_subscriptions AS subscription
      ON subscription.member_id = member.id
    WHERE member.id = v_rental.member_id
      AND (member.current_plan_id IS NULL OR subscription.plan_id = member.current_plan_id)
      AND subscription.status IN ('active', 'expired')
      AND subscription.ends_at IS NOT NULL
    ORDER BY subscription.started_at DESC, subscription.ends_at DESC, subscription.id DESC
    LIMIT 1
    FOR SHARE OF subscription;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    v_expiry_business_date := GREATEST(
      (v_subscription_end AT TIME ZONE 'Asia/Dhaka')::date,
      COALESCE(
        (v_rental.subscription_ends_at AT TIME ZONE 'Asia/Dhaka')::date,
        (v_subscription_end AT TIME ZONE 'Asia/Dhaka')::date
      )
    );
    v_first_fine_date := GREATEST(v_expiry_business_date + 1, v_accrual_start_date);
    v_last_eligible_date := v_last_fine_date;

    IF v_rental.status = 'active'
      AND v_rental.returned_at IS NULL
      AND v_first_fine_date <= v_business_date THEN
      UPDATE public.rentals AS rental
      SET status = 'overdue', updated_at = v_now
      WHERE rental.id = v_rental.id AND rental.status = 'active';
      IF FOUND THEN
        v_rentals_marked_overdue := v_rentals_marked_overdue + 1;
      END IF;
    END IF;

    IF v_rental.returned_at IS NOT NULL THEN
      v_last_eligible_date := LEAST(
        v_last_eligible_date,
        (v_rental.returned_at AT TIME ZONE 'Asia/Dhaka')::date - 1
      );
    END IF;

    IF v_first_fine_date > v_last_eligible_date THEN
      CONTINUE;
    END IF;

    INSERT INTO public.fine_accrual_cursors (rental_id, next_fine_date)
    VALUES (v_rental.id, v_first_fine_date)
    ON CONFLICT (rental_id) DO NOTHING;

    SELECT accrual_cursor.next_fine_date INTO v_next_fine_date
    FROM public.fine_accrual_cursors AS accrual_cursor
    WHERE accrual_cursor.rental_id = v_rental.id
    FOR UPDATE;

    IF v_next_fine_date < v_first_fine_date THEN
      v_next_fine_date := v_first_fine_date;
      UPDATE public.fine_accrual_cursors AS accrual_cursor
      SET next_fine_date = v_next_fine_date, updated_at = v_now
      WHERE accrual_cursor.rental_id = v_rental.id;
    END IF;

    IF v_next_fine_date > v_last_eligible_date THEN
      CONTINUE;
    END IF;

    v_batch_last_date := LEAST(v_last_eligible_date, v_next_fine_date + 30);
    FOR v_fine_date IN
      SELECT day_to_accrue::date
      FROM pg_catalog.generate_series(
        v_next_fine_date::timestamp,
        v_batch_last_date::timestamp,
        interval '1 day'
      ) AS series(day_to_accrue)
    LOOP
      INSERT INTO public.fine_ledger (member_id, rental_id, amount_bdt, fine_date, reason, status)
      VALUES (
        v_rental.member_id,
        v_rental.id,
        v_daily_rate,
        v_fine_date,
        pg_catalog.format('Overdue after subscription and rental term expiry; configured rate BDT %s per day.', v_daily_rate),
        'outstanding'
      )
      ON CONFLICT (rental_id, fine_date) WHERE rental_id IS NOT NULL DO NOTHING;

      GET DIAGNOSTICS v_inserted = ROW_COUNT;
      v_fine_entries_created := v_fine_entries_created + v_inserted;
    END LOOP;

    v_next_fine_date := v_batch_last_date + 1;
    UPDATE public.fine_accrual_cursors AS accrual_cursor
    SET next_fine_date = v_next_fine_date, updated_at = v_now
    WHERE accrual_cursor.rental_id = v_rental.id;

    IF v_next_fine_date <= v_last_eligible_date THEN
      v_catch_up_rentals_pending := v_catch_up_rentals_pending + 1;
    END IF;
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'business_date', v_business_date,
    'subscriptions_expired', v_expired_subscriptions,
    'rentals_marked_overdue', v_rentals_marked_overdue,
    'fine_entries_created', v_fine_entries_created,
    'catch_up_rentals_pending', v_catch_up_rentals_pending
  );
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_active_subscription_for_rental_request() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.accrue_overdue_fines() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.accrue_overdue_fines() TO service_role;
