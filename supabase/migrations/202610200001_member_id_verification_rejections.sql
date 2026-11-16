ALTER TABLE public.member_profiles
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS rejection_reason text;

UPDATE public.member_profiles
SET verification_status = 'APPROVED',
    rejection_reason = NULL
WHERE is_id_verified = true AND verification_status <> 'APPROVED';

ALTER TABLE public.member_profiles
  DROP CONSTRAINT IF EXISTS member_profiles_verification_status_check;

ALTER TABLE public.member_profiles
  ADD CONSTRAINT member_profiles_verification_status_check CHECK (
    (verification_status = 'PENDING' AND is_id_verified = false AND rejection_reason IS NULL)
    OR (verification_status = 'APPROVED' AND is_id_verified = true AND rejection_reason IS NULL)
    OR (
      verification_status = 'REJECTED'
      AND is_id_verified = false
      AND rejection_reason IS NOT NULL
      AND length(btrim(rejection_reason)) BETWEEN 1 AND 500
    )
  );

REVOKE INSERT (verification_status, rejection_reason),
       UPDATE (verification_status, rejection_reason)
  ON TABLE public.member_profiles FROM authenticated;