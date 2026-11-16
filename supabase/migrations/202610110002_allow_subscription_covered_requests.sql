CREATE OR REPLACE FUNCTION public.reserve_rental_day_credit_for_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_credit public.rental_day_credits%ROWTYPE;
BEGIN
  IF NEW.rental_day_credit_id IS NULL THEN
    IF NEW.amount_bdt = 0 THEN
      RETURN NEW;
    END IF;
    IF NEW.amount_bdt < 0 THEN
      RAISE EXCEPTION 'A rental request amount cannot be negative.' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.amount_bdt <> 0 THEN
    RAISE EXCEPTION 'A carryover rental request cannot include a new charge.' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_credit
  FROM public.rental_day_credits AS credit
  WHERE credit.id = NEW.rental_day_credit_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_credit.member_id <> NEW.member_id
    OR v_credit.status <> 'available'
    OR v_credit.expires_at <= pg_catalog.clock_timestamp() THEN
    RAISE EXCEPTION 'The remaining rental days are unavailable or expired.' USING ERRCODE = '23514';
  END IF;

  UPDATE public.rental_day_credits
  SET status = 'reserved', updated_at = pg_catalog.clock_timestamp()
  WHERE id = v_credit.id;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_rental_day_credit_for_request() FROM PUBLIC, anon, authenticated, service_role;