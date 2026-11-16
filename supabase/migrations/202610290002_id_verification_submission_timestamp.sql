ALTER TABLE public.member_profiles
  ADD COLUMN IF NOT EXISTS id_verification_submitted_at timestamptz;