CREATE TABLE IF NOT EXISTS public.otp_rate_limits (
  ip_address text PRIMARY KEY,
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  address_changes integer NOT NULL DEFAULT 0 CHECK (address_changes >= 0),
  locked_until timestamptz
);

CREATE INDEX IF NOT EXISTS otp_rate_limits_locked_until_idx
  ON public.otp_rate_limits (locked_until);

CREATE TABLE IF NOT EXISTS public.member_auth_rate_limit_events (
  bucket_key text NOT NULL CHECK (bucket_key ~ '^(otp_request|otp_verify):(ip|identifier):[0-9a-f]{64}$|^(admin_login:ip|admin_otp_send:(ip|challenge)):[0-9a-f]{64}$'),
  attempted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS member_auth_rate_limit_events_bucket_time_idx
  ON public.member_auth_rate_limit_events (bucket_key, attempted_at DESC);

CREATE INDEX IF NOT EXISTS member_auth_rate_limit_events_time_idx
  ON public.member_auth_rate_limit_events (attempted_at);

ALTER TABLE public.otp_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.otp_rate_limits FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.otp_rate_limits TO service_role;

ALTER TABLE public.member_auth_rate_limit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_auth_rate_limit_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, DELETE ON public.member_auth_rate_limit_events TO service_role;

CREATE OR REPLACE FUNCTION public.consume_member_auth_rate_limit(
  p_ip_hash text,
  p_identifier_hash text,
  p_operation text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_window interval;
  v_ip_limit integer;
  v_identifier_limit integer;
  v_ip_key text;
  v_identifier_key text;
  v_first_lock bigint;
  v_second_lock bigint;
  v_ip_count integer;
  v_identifier_count integer;
BEGIN
  IF p_ip_hash IS NULL
    OR p_identifier_hash IS NULL
    OR p_operation IS NULL
    OR p_ip_hash !~ '^[0-9a-f]{64}$'
    OR p_identifier_hash !~ '^[0-9a-f]{64}$'
    OR p_operation NOT IN ('otp_request', 'otp_verify') THEN
    RETURN false;
  END IF;

  IF p_operation = 'otp_request' THEN
    v_window := interval '15 minutes';
    v_ip_limit := 20;
    v_identifier_limit := 5;
  ELSE
    v_window := interval '10 minutes';
    v_ip_limit := 30;
    v_identifier_limit := 10;
  END IF;

  v_ip_key := p_operation || ':ip:' || p_ip_hash;
  v_identifier_key := p_operation || ':identifier:' || p_identifier_hash;
  v_first_lock := pg_catalog.hashtextextended(LEAST(v_ip_key, v_identifier_key), 0);
  v_second_lock := pg_catalog.hashtextextended(GREATEST(v_ip_key, v_identifier_key), 0);
  PERFORM pg_catalog.pg_advisory_xact_lock(v_first_lock);
  PERFORM pg_catalog.pg_advisory_xact_lock(v_second_lock);

  DELETE FROM public.member_auth_rate_limit_events
  WHERE attempted_at < v_now - interval '24 hours';

  INSERT INTO public.member_auth_rate_limit_events (bucket_key, attempted_at)
  VALUES
    (v_ip_key, v_now),
    (v_identifier_key, v_now);

  SELECT count(*)::integer INTO v_ip_count
  FROM public.member_auth_rate_limit_events
  WHERE bucket_key = v_ip_key
    AND attempted_at > v_now - v_window;

  SELECT count(*)::integer INTO v_identifier_count
  FROM public.member_auth_rate_limit_events
  WHERE bucket_key = v_identifier_key
    AND attempted_at > v_now - v_window;

  RETURN v_ip_count <= v_ip_limit AND v_identifier_count <= v_identifier_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_member_auth_rate_limit(text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_member_auth_rate_limit(text, text, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.consume_admin_login_rate_limit(p_ip_hash text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_key text;
  v_count integer;
BEGIN
  IF p_ip_hash IS NULL OR p_ip_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN false;
  END IF;

  v_key := 'admin_login:ip:' || p_ip_hash;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_key, 0));

  DELETE FROM public.member_auth_rate_limit_events
  WHERE attempted_at < v_now - interval '24 hours';

  INSERT INTO public.member_auth_rate_limit_events (bucket_key, attempted_at)
  VALUES (v_key, v_now);

  SELECT count(*)::integer INTO v_count
  FROM public.member_auth_rate_limit_events
  WHERE bucket_key = v_key
    AND attempted_at > v_now - interval '15 minutes';

  RETURN v_count <= 20;
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_admin_otp_send_limit(p_ip_hash text, p_challenge_hash text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_ip_key text;
  v_challenge_key text;
  v_first_lock bigint;
  v_second_lock bigint;
  v_ip_count integer;
  v_challenge_count integer;
BEGIN
  IF p_ip_hash IS NULL OR p_challenge_hash IS NULL
    OR p_ip_hash !~ '^[0-9a-f]{64}$'
    OR p_challenge_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN false;
  END IF;

  v_ip_key := 'admin_otp_send:ip:' || p_ip_hash;
  v_challenge_key := 'admin_otp_send:challenge:' || p_challenge_hash;
  v_first_lock := pg_catalog.hashtextextended(LEAST(v_ip_key, v_challenge_key), 0);
  v_second_lock := pg_catalog.hashtextextended(GREATEST(v_ip_key, v_challenge_key), 0);
  PERFORM pg_catalog.pg_advisory_xact_lock(v_first_lock);
  PERFORM pg_catalog.pg_advisory_xact_lock(v_second_lock);

  DELETE FROM public.member_auth_rate_limit_events
  WHERE attempted_at < v_now - interval '24 hours';

  INSERT INTO public.member_auth_rate_limit_events (bucket_key, attempted_at)
  VALUES (v_ip_key, v_now), (v_challenge_key, v_now);

  SELECT count(*)::integer INTO v_ip_count
  FROM public.member_auth_rate_limit_events
  WHERE bucket_key = v_ip_key
    AND attempted_at > v_now - interval '10 minutes';

  SELECT count(*)::integer INTO v_challenge_count
  FROM public.member_auth_rate_limit_events
  WHERE bucket_key = v_challenge_key
    AND attempted_at > v_now - interval '10 minutes';

  RETURN v_ip_count <= 3 AND v_challenge_count <= 3;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_admin_login_rate_limit(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_admin_login_rate_limit(text)
  TO service_role;
REVOKE ALL ON FUNCTION public.consume_admin_otp_send_limit(text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_admin_otp_send_limit(text, text)
  TO service_role;