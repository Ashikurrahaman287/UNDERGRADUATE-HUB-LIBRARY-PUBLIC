ALTER TABLE public.admin_login_challenges
  ADD COLUMN IF NOT EXISTS otp_method text,
  ADD COLUMN IF NOT EXISTS otp_destination text;

UPDATE public.admin_login_challenges
SET otp_method = 'phone',
    otp_destination = otp_phone
WHERE otp_hash IS NOT NULL AND otp_phone IS NOT NULL AND otp_method IS NULL;

DO $$
DECLARE
  constraint_record record;
BEGIN
  FOR constraint_record IN
    SELECT conname
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.admin_login_challenges'::pg_catalog.regclass
      AND contype = 'c'
      AND pg_catalog.pg_get_constraintdef(oid) LIKE '%otp_phone IS NOT NULL%'
  LOOP
    EXECUTE pg_catalog.format('ALTER TABLE public.admin_login_challenges DROP CONSTRAINT %I', constraint_record.conname);
  END LOOP;
END;
$$;

ALTER TABLE public.admin_login_challenges
  DROP CONSTRAINT IF EXISTS admin_login_challenges_otp_state_check;

ALTER TABLE public.admin_login_challenges
  ADD CONSTRAINT admin_login_challenges_otp_state_check CHECK (
    (otp_hash IS NULL AND otp_method IS NULL AND otp_destination IS NULL AND otp_expires_at IS NULL AND failed_attempts = 0)
    OR (
      otp_hash IS NOT NULL
      AND otp_method IN ('phone', 'email')
      AND otp_destination IS NOT NULL
      AND otp_expires_at IS NOT NULL
    )
  );