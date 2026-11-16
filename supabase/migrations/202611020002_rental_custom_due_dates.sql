CREATE TABLE IF NOT EXISTS public.rental_due_date_extension_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rental_id uuid NOT NULL REFERENCES public.rentals(id) ON DELETE RESTRICT,
  reviewer_admin_session_id uuid NOT NULL REFERENCES public.admin_sessions(id) ON DELETE RESTRICT,
  previous_due_at timestamptz,
  new_due_at timestamptz NOT NULL,
  extension_method text NOT NULL CHECK (extension_method IN ('days', 'date')),
  days_added integer NOT NULL CHECK (days_added > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rental_due_date_extension_audit_rental_created_idx
  ON public.rental_due_date_extension_audit (rental_id, created_at DESC);

ALTER TABLE public.rental_due_date_extension_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rental_due_date_extension_audit FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.rental_due_date_extension_audit TO service_role;

CREATE OR REPLACE FUNCTION public.admin_extend_rental_due_date(
  p_rental_id uuid,
  p_reviewer_session_id uuid,
  p_custom_days integer DEFAULT NULL,
  p_new_due_date date DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_rental public.rentals%ROWTYPE;
  v_base_due_at timestamptz;
  v_new_due_at timestamptz;
  v_days_added integer;
  v_method text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_sessions AS session
    WHERE session.id = p_reviewer_session_id AND session.expires_at > v_now
  ) THEN
    RAISE EXCEPTION 'Admin session is no longer valid.' USING ERRCODE = '42501';
  END IF;

  IF (p_custom_days IS NULL) = (p_new_due_date IS NULL) THEN
    RAISE EXCEPTION 'Choose exactly one due-date extension method.' USING ERRCODE = '22023';
  END IF;
  IF p_custom_days IS NOT NULL AND p_custom_days NOT BETWEEN 1 AND 3650 THEN
    RAISE EXCEPTION 'Custom days must be between 1 and 3650.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_rental
  FROM public.rentals AS rental
  WHERE rental.id = p_rental_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rental not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_rental.status NOT IN ('active', 'overdue') OR v_rental.returned_at IS NOT NULL THEN
    RAISE EXCEPTION 'Only issued, unreturned rentals can be extended.' USING ERRCODE = '55000';
  END IF;

  v_base_due_at := GREATEST(COALESCE(v_rental.subscription_ends_at, v_now), v_now);
  IF p_custom_days IS NOT NULL THEN
    v_method := 'days';
    v_days_added := p_custom_days;
    v_new_due_at := v_base_due_at + pg_catalog.make_interval(days => p_custom_days);
  ELSE
    v_method := 'date';
    v_new_due_at := (p_new_due_date + time '23:59:59.999') AT TIME ZONE 'Asia/Dhaka';
    IF v_new_due_at <= v_base_due_at THEN
      RAISE EXCEPTION 'The new due date must be later than the current due date.' USING ERRCODE = '22023';
    END IF;
    IF v_new_due_at > v_base_due_at + INTERVAL '3650 days' THEN
      RAISE EXCEPTION 'The new due date cannot be more than 3650 days out.' USING ERRCODE = '22023';
    END IF;
    v_days_added := GREATEST(1, pg_catalog.ceil(EXTRACT(EPOCH FROM (v_new_due_at - v_base_due_at)) / 86400)::integer);
  END IF;

  UPDATE public.rentals
  SET subscription_ends_at = v_new_due_at,
      status = 'active',
      updated_at = v_now
  WHERE id = p_rental_id;

  INSERT INTO public.rental_due_date_extension_audit (
    rental_id, reviewer_admin_session_id, previous_due_at,
    new_due_at, extension_method, days_added
  ) VALUES (
    p_rental_id, p_reviewer_session_id, v_rental.subscription_ends_at,
    v_new_due_at, v_method, v_days_added
  );

  RETURN 'extended';
END;
$$;

REVOKE ALL ON FUNCTION public.admin_extend_rental_due_date(uuid, uuid, integer, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_extend_rental_due_date(uuid, uuid, integer, date) TO service_role;