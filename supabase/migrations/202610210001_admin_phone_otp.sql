CREATE TABLE IF NOT EXISTS public.admin_login_challenges (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  otp_hash text CHECK (otp_hash IS NULL OR otp_hash ~ '^[0-9a-f]{64}$'),
  otp_phone text,
  otp_expires_at timestamptz,
  failed_attempts smallint NOT NULL DEFAULT 0 CHECK (failed_attempts BETWEEN 0 AND 2),
  CHECK (expires_at > created_at),
  CHECK (
    (otp_hash IS NULL AND otp_phone IS NULL AND otp_expires_at IS NULL AND failed_attempts = 0)
    OR (otp_hash IS NOT NULL AND otp_phone IS NOT NULL AND otp_expires_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS admin_login_challenges_expiration_idx
  ON public.admin_login_challenges (expires_at);

CREATE TABLE IF NOT EXISTS public.admin_otp_send_limits (
  bucket_key text PRIMARY KEY CHECK (bucket_key ~ '^(ip|challenge):[0-9a-f]{64}$'),
  window_started_at timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0)
);

ALTER TABLE public.admin_login_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_otp_send_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_login_challenges, public.admin_otp_send_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.admin_login_challenges, public.admin_otp_send_limits TO service_role;

CREATE OR REPLACE FUNCTION public.consume_admin_otp_send_limit(p_ip_hash text, p_challenge_hash text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_ip_count integer;
  v_challenge_count integer;
BEGIN
  DELETE FROM public.admin_login_challenges
  WHERE expires_at < pg_catalog.clock_timestamp() - interval '24 hours';

  DELETE FROM public.admin_otp_send_limits
  WHERE window_started_at < pg_catalog.clock_timestamp() - interval '24 hours';

  IF p_ip_hash !~ '^[0-9a-f]{64}$' OR p_challenge_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN false;
  END IF;

  INSERT INTO public.admin_otp_send_limits (bucket_key, window_started_at, request_count)
  VALUES ('ip:' || p_ip_hash, pg_catalog.clock_timestamp(), 1)
  ON CONFLICT (bucket_key) DO UPDATE SET
    window_started_at = CASE
      WHEN public.admin_otp_send_limits.window_started_at <= pg_catalog.clock_timestamp() - interval '10 minutes'
        THEN pg_catalog.clock_timestamp()
      ELSE public.admin_otp_send_limits.window_started_at
    END,
    request_count = CASE
      WHEN public.admin_otp_send_limits.window_started_at <= pg_catalog.clock_timestamp() - interval '10 minutes'
        THEN 1
      ELSE public.admin_otp_send_limits.request_count + 1
    END
  RETURNING request_count INTO v_ip_count;

  IF v_ip_count > 3 THEN
    RETURN false;
  END IF;

  INSERT INTO public.admin_otp_send_limits (bucket_key, window_started_at, request_count)
  VALUES ('challenge:' || p_challenge_hash, pg_catalog.clock_timestamp(), 1)
  ON CONFLICT (bucket_key) DO UPDATE SET
    window_started_at = CASE
      WHEN public.admin_otp_send_limits.window_started_at <= pg_catalog.clock_timestamp() - interval '10 minutes'
        THEN pg_catalog.clock_timestamp()
      ELSE public.admin_otp_send_limits.window_started_at
    END,
    request_count = CASE
      WHEN public.admin_otp_send_limits.window_started_at <= pg_catalog.clock_timestamp() - interval '10 minutes'
        THEN 1
      ELSE public.admin_otp_send_limits.request_count + 1
    END
  RETURNING request_count INTO v_challenge_count;

  RETURN v_challenge_count <= 3;
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_admin_login_otp(p_token_hash text, p_otp_hash text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_challenge public.admin_login_challenges%ROWTYPE;
  v_now timestamptz := pg_catalog.clock_timestamp();
BEGIN
  IF p_token_hash !~ '^[0-9a-f]{64}$' OR p_otp_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN 'missing';
  END IF;

  SELECT * INTO v_challenge
  FROM public.admin_login_challenges AS challenge
  WHERE challenge.token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'missing';
  END IF;

  IF v_challenge.expires_at <= v_now OR v_challenge.otp_hash IS NULL OR v_challenge.otp_expires_at <= v_now THEN
    DELETE FROM public.admin_login_challenges WHERE token_hash = p_token_hash;
    RETURN 'expired';
  END IF;

  IF v_challenge.otp_hash = p_otp_hash THEN
    DELETE FROM public.admin_login_challenges WHERE token_hash = p_token_hash;
    RETURN 'verified';
  END IF;

  IF v_challenge.failed_attempts >= 2 THEN
    DELETE FROM public.admin_login_challenges WHERE token_hash = p_token_hash;
    RETURN 'locked';
  END IF;

  UPDATE public.admin_login_challenges
  SET failed_attempts = failed_attempts + 1
  WHERE token_hash = p_token_hash;
  RETURN 'invalid';
END;
$$;

REVOKE ALL ON FUNCTION public.consume_admin_otp_send_limit(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_admin_login_otp(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_admin_otp_send_limit(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_admin_login_otp(text, text) TO service_role;