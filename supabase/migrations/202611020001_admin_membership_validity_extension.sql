CREATE TABLE IF NOT EXISTS public.member_membership_extension_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.member_profiles(id) ON DELETE RESTRICT,
  reviewer_admin_session_id uuid NOT NULL REFERENCES public.admin_sessions(id) ON DELETE RESTRICT,
  previous_expiry_at timestamptz,
  new_expiry_at timestamptz NOT NULL,
  extension_method text NOT NULL CHECK (extension_method IN ('days', 'date')),
  days_added integer NOT NULL CHECK (days_added > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS member_membership_extension_audit_member_created_idx
  ON public.member_membership_extension_audit (member_id, created_at DESC);

ALTER TABLE public.member_membership_extension_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_membership_extension_audit FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.member_membership_extension_audit TO service_role;

CREATE OR REPLACE FUNCTION public.admin_extend_member_validity(
  p_member_id uuid,
  p_reviewer_session_id uuid,
  p_days_to_add integer DEFAULT NULL,
  p_new_expiry_date date DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_member public.member_profiles%ROWTYPE;
  v_base_expiry timestamptz;
  v_new_expiry timestamptz;
  v_days_added integer;
  v_extension_method text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_sessions AS session
    WHERE session.id = p_reviewer_session_id AND session.expires_at > v_now
  ) THEN
    RAISE EXCEPTION 'Admin session is no longer valid.' USING ERRCODE = '42501';
  END IF;

  IF (p_days_to_add IS NULL) = (p_new_expiry_date IS NULL) THEN
    RAISE EXCEPTION 'Choose exactly one membership extension method.' USING ERRCODE = '22023';
  END IF;
  IF p_days_to_add IS NOT NULL AND p_days_to_add NOT BETWEEN 1 AND 3650 THEN
    RAISE EXCEPTION 'Days to add must be between 1 and 3650.' USING ERRCODE = '22023';
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

  v_base_expiry := GREATEST(COALESCE(v_member.membership_expires_at, v_now), v_now);
  IF p_days_to_add IS NOT NULL THEN
    v_extension_method := 'days';
    v_days_added := p_days_to_add;
    v_new_expiry := v_base_expiry + pg_catalog.make_interval(days => p_days_to_add);
  ELSE
    v_extension_method := 'date';
    v_new_expiry := (p_new_expiry_date + time '23:59:59.999') AT TIME ZONE 'Asia/Dhaka';
    IF v_new_expiry <= v_base_expiry THEN
      RAISE EXCEPTION 'The new expiry must be later than the current expiry.' USING ERRCODE = '22023';
    END IF;
    v_days_added := pg_catalog.ceil(EXTRACT(EPOCH FROM (v_new_expiry - v_base_expiry)) / 86400)::integer;
  END IF;

  UPDATE public.member_profiles
  SET membership_expires_at = v_new_expiry,
      updated_at = v_now
  WHERE id = p_member_id;

  INSERT INTO public.member_membership_extension_audit (
    member_id, reviewer_admin_session_id, previous_expiry_at,
    new_expiry_at, extension_method, days_added
  ) VALUES (
    p_member_id, p_reviewer_session_id, v_member.membership_expires_at,
    v_new_expiry, v_extension_method, v_days_added
  );

  RETURN 'extended';
END;
$$;

REVOKE ALL ON FUNCTION public.admin_extend_member_validity(uuid, uuid, integer, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_extend_member_validity(uuid, uuid, integer, date) TO service_role;