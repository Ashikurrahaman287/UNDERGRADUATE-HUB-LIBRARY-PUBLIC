ALTER TABLE public.member_profiles
  DROP CONSTRAINT IF EXISTS member_profiles_identity_details_check;

ALTER TABLE public.member_profiles
  ALTER COLUMN dob TYPE text USING dob::text;

REVOKE INSERT (user_id, full_name, phone, email, address, avatar_url, id_type, id_number, dob, institution_name, id_card_url),
       UPDATE (full_name, phone, email, address, avatar_url, id_type, id_number, dob, institution_name, id_card_url)
  ON TABLE public.member_profiles FROM authenticated;
GRANT SELECT ON public.member_profiles TO authenticated;

ALTER TABLE public.member_profiles
  ADD CONSTRAINT member_profiles_identity_details_check CHECK (
    id_type IS NULL
    OR (
      id_number IS NOT NULL
      AND (id_number LIKE 'pii:v1:%' OR length(btrim(id_number)) BETWEEN 4 AND 64)
      AND id_card_url IS NOT NULL
      AND id_card_url LIKE 'member-ids/' || id::text || '/%'
      AND (
        (
          id_type = 'NID'
          AND dob IS NOT NULL
          AND (dob LIKE 'pii:v1:%' OR dob ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
          AND address IS NOT NULL
          AND length(btrim(address)) > 0
          AND institution_name IS NULL
        )
        OR
        (
          id_type = 'Student ID'
          AND institution_name IS NOT NULL
          AND length(btrim(institution_name)) > 0
          AND dob IS NULL
        )
      )
    )
  );

CREATE OR REPLACE FUNCTION public.reset_member_id_verification_on_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND (
    OLD.full_name IS DISTINCT FROM NEW.full_name
    OR OLD.address IS DISTINCT FROM NEW.address
    OR OLD.id_type IS DISTINCT FROM NEW.id_type
    OR OLD.id_number IS DISTINCT FROM NEW.id_number
    OR OLD.dob IS DISTINCT FROM NEW.dob
    OR OLD.institution_name IS DISTINCT FROM NEW.institution_name
    OR OLD.id_card_url IS DISTINCT FROM NEW.id_card_url
  ) THEN
    NEW.is_id_verified := false;
  END IF;
  RETURN NEW;
END;
$$;