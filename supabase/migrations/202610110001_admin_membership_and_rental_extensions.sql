ALTER TABLE public.member_profiles
  ADD COLUMN IF NOT EXISTS membership_expires_at timestamptz;

CREATE OR REPLACE FUNCTION public.set_membership_expiry_on_activation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.membership_status IS DISTINCT FROM OLD.membership_status
    AND NEW.membership_status = 'active' THEN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'Membership activation must be reviewed by an administrator.' USING ERRCODE = '42501';
    END IF;
    NEW.membership_expires_at := pg_catalog.clock_timestamp() + INTERVAL '1 year';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS member_profiles_set_membership_expiry ON public.member_profiles;
CREATE TRIGGER member_profiles_set_membership_expiry
  BEFORE UPDATE OF membership_status ON public.member_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_membership_expiry_on_activation();

CREATE OR REPLACE FUNCTION public.admin_approve_pending_member(
  p_member_id uuid,
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

  UPDATE public.member_profiles
  SET membership_status = 'active',
      membership_expires_at = v_now + INTERVAL '1 year',
      updated_at = v_now
  WHERE id = v_member.id;
  RETURN 'approved';
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_extend_member_membership(
  p_member_id uuid,
  p_months integer,
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
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_sessions AS session
    WHERE session.id = p_reviewer_session_id AND session.expires_at > v_now
  ) THEN
    RAISE EXCEPTION 'Admin session is no longer valid.' USING ERRCODE = '42501';
  END IF;
  IF p_months IS NULL OR p_months NOT IN (1, 6, 12) THEN
    RAISE EXCEPTION 'Choose a supported membership extension.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_member
  FROM public.member_profiles AS member
  WHERE member.id = p_member_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member profile not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_member.membership_status <> 'active' THEN
    RAISE EXCEPTION 'Only active memberships can be extended.' USING ERRCODE = '55000';
  END IF;

  UPDATE public.member_profiles
  SET membership_expires_at = GREATEST(
        COALESCE(v_member.membership_expires_at, v_now), v_now
      ) + pg_catalog.make_interval(months => p_months),
      updated_at = v_now
  WHERE id = v_member.id;
  RETURN 'extended';
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_extend_rental_period(
  p_rental_id uuid,
  p_days integer,
  p_reviewer_session_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_rental public.rentals%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_sessions AS session
    WHERE session.id = p_reviewer_session_id AND session.expires_at > v_now
  ) THEN
    RAISE EXCEPTION 'Admin session is no longer valid.' USING ERRCODE = '42501';
  END IF;
  IF p_days IS NULL OR p_days NOT IN (7, 14, 30) THEN
    RAISE EXCEPTION 'Choose a supported rental extension.' USING ERRCODE = '22023';
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

  UPDATE public.rentals
  SET subscription_ends_at = GREATEST(
        COALESCE(v_rental.subscription_ends_at, v_now), v_now
      ) + pg_catalog.make_interval(days => p_days),
      status = 'active',
      updated_at = v_now
  WHERE id = v_rental.id;
  RETURN 'extended';
END;
$$;

REVOKE ALL ON FUNCTION public.set_membership_expiry_on_activation() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_approve_pending_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_extend_member_membership(uuid, integer, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_extend_rental_period(uuid, integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_approve_pending_member(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_extend_member_membership(uuid, integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_extend_rental_period(uuid, integer, uuid) TO service_role;