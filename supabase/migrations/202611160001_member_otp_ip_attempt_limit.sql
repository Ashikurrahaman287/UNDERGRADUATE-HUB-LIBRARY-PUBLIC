CREATE OR REPLACE FUNCTION public.consume_member_otp_ip_attempt(p_ip_address text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now timestamptz := NOW();
  v_request_count integer;
  v_address_changes integer;
  v_locked_until timestamptz;
BEGIN
  IF p_ip_address IS NULL OR pg_catalog.length(p_ip_address) > 45 THEN
    RETURN false;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('member_otp_ip:' || p_ip_address, 0));

  SELECT request_count, address_changes, locked_until
    INTO v_request_count, v_address_changes, v_locked_until
  FROM public.otp_rate_limits
  WHERE ip_address = p_ip_address
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.otp_rate_limits (ip_address, request_count, address_changes, locked_until)
    VALUES (p_ip_address, 0, 0, NULL)
    ON CONFLICT (ip_address) DO NOTHING;

    SELECT request_count, address_changes, locked_until
      INTO v_request_count, v_address_changes, v_locked_until
    FROM public.otp_rate_limits
    WHERE ip_address = p_ip_address
    FOR UPDATE;
  END IF;

  IF v_locked_until > v_now THEN
    RETURN false;
  END IF;

  IF v_address_changes >= 3 THEN
    UPDATE public.otp_rate_limits
    SET locked_until = v_now + interval '15 minutes'
    WHERE ip_address = p_ip_address;
    RETURN false;
  END IF;

  IF v_locked_until IS NOT NULL THEN
    v_request_count := 0;
  END IF;

  v_request_count := COALESCE(v_request_count, 0) + 1;

  IF v_request_count > 5 THEN
    UPDATE public.otp_rate_limits
    SET request_count = v_request_count,
        locked_until = v_now + interval '15 minutes'
    WHERE ip_address = p_ip_address;
    RETURN false;
  END IF;

  UPDATE public.otp_rate_limits
  SET request_count = v_request_count,
      locked_until = NULL
  WHERE ip_address = p_ip_address;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_member_otp_ip_attempt(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_member_otp_ip_attempt(text)
  TO service_role;