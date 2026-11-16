ALTER TABLE public.member_profiles
  ADD COLUMN IF NOT EXISTS id_type text,
  ADD COLUMN IF NOT EXISTS id_number text,
  ADD COLUMN IF NOT EXISTS dob date,
  ADD COLUMN IF NOT EXISTS institution_name text,
  ADD COLUMN IF NOT EXISTS id_card_url text,
  ADD COLUMN IF NOT EXISTS is_id_verified boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'member_profiles_identity_details_check'
      AND conrelid = 'public.member_profiles'::pg_catalog.regclass
  ) THEN
    ALTER TABLE public.member_profiles
      ADD CONSTRAINT member_profiles_identity_details_check CHECK (
        id_type IS NULL
        OR (
          id_number IS NOT NULL AND length(btrim(id_number)) BETWEEN 4 AND 64
          AND id_card_url IS NOT NULL
          AND id_card_url LIKE 'member-ids/' || id::text || '/%'
          AND (
            (id_type = 'NID' AND dob IS NOT NULL AND address IS NOT NULL AND length(btrim(address)) > 0 AND institution_name IS NULL)
            OR
            (id_type = 'Student ID' AND institution_name IS NOT NULL AND length(btrim(institution_name)) > 0 AND dob IS NULL)
          )
        )
      );
  END IF;
END;
$$;

REVOKE ALL ON public.member_profiles FROM authenticated;
GRANT SELECT ON public.member_profiles TO authenticated;
GRANT INSERT (user_id, full_name, phone, email, address, avatar_url, id_type, id_number, dob, institution_name, id_card_url)
  ON public.member_profiles TO authenticated;
GRANT UPDATE (full_name, phone, email, address, avatar_url, id_type, id_number, dob, institution_name, id_card_url)
  ON public.member_profiles TO authenticated;
GRANT ALL ON public.member_profiles TO service_role;

CREATE OR REPLACE FUNCTION public.reset_member_id_verification_on_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.full_name IS DISTINCT FROM NEW.full_name
    OR OLD.address IS DISTINCT FROM NEW.address
    OR OLD.id_type IS DISTINCT FROM NEW.id_type
    OR OLD.id_number IS DISTINCT FROM NEW.id_number
    OR OLD.dob IS DISTINCT FROM NEW.dob
    OR OLD.institution_name IS DISTINCT FROM NEW.institution_name
    OR OLD.id_card_url IS DISTINCT FROM NEW.id_card_url THEN
    NEW.is_id_verified := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS member_profiles_reset_id_verification ON public.member_profiles;
CREATE TRIGGER member_profiles_reset_id_verification
  BEFORE UPDATE ON public.member_profiles
  FOR EACH ROW EXECUTE FUNCTION public.reset_member_id_verification_on_change();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('member-ids', 'member-ids', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Members can view own identity files" ON storage.objects;
DROP POLICY IF EXISTS "Members can upload own identity files" ON storage.objects;
DROP POLICY IF EXISTS "Members can update own identity files" ON storage.objects;
DROP POLICY IF EXISTS "Members can delete own identity files" ON storage.objects;

CREATE POLICY "Members can view own identity files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'member-ids' AND owner = auth.uid());
CREATE POLICY "Members can upload own identity files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'member-ids' AND owner = auth.uid());

CREATE OR REPLACE FUNCTION public.require_verified_member_for_book_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_is_verified boolean;
BEGIN
  SELECT member.is_id_verified AND member.id_card_url IS NOT NULL
  INTO v_is_verified
  FROM public.member_profiles AS member
  WHERE member.id = NEW.member_id
  FOR SHARE;

  IF NOT COALESCE(v_is_verified, false) THEN
    RAISE EXCEPTION 'Complete ID verification in My Profile before requesting books.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rental_requests_require_verified_member ON public.rental_requests;
CREATE TRIGGER rental_requests_require_verified_member
  BEFORE INSERT ON public.rental_requests
  FOR EACH ROW EXECUTE FUNCTION public.require_verified_member_for_book_request();

DROP TRIGGER IF EXISTS reservations_require_verified_member ON public.reservation_requests;
CREATE TRIGGER reservations_require_verified_member
  BEFORE INSERT ON public.reservation_requests
  FOR EACH ROW EXECUTE FUNCTION public.require_verified_member_for_book_request();

REVOKE ALL ON FUNCTION public.reset_member_id_verification_on_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.require_verified_member_for_book_request() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_member_id_verification_on_change() TO service_role;
GRANT EXECUTE ON FUNCTION public.require_verified_member_for_book_request() TO service_role;