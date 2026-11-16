DO $$
DECLARE
  dob_data_type text;
BEGIN
  IF has_column_privilege('authenticated', 'public.member_profiles', 'address', 'INSERT')
    OR has_column_privilege('authenticated', 'public.member_profiles', 'address', 'UPDATE')
    OR has_column_privilege('authenticated', 'public.member_profiles', 'id_number', 'INSERT')
    OR has_column_privilege('authenticated', 'public.member_profiles', 'id_number', 'UPDATE')
    OR has_column_privilege('authenticated', 'public.member_profiles', 'dob', 'INSERT')
    OR has_column_privilege('authenticated', 'public.member_profiles', 'dob', 'UPDATE')
    OR has_column_privilege('authenticated', 'public.member_profiles', 'institution_name', 'INSERT')
    OR has_column_privilege('authenticated', 'public.member_profiles', 'institution_name', 'UPDATE') THEN
    RAISE EXCEPTION 'Members must write identity PII through server-side encrypted actions only.';
  END IF;

  SELECT column_type.data_type
  INTO dob_data_type
  FROM information_schema.columns AS column_type
  WHERE column_type.table_schema = 'public'
    AND column_type.table_name = 'member_profiles'
    AND column_type.column_name = 'dob';

  IF dob_data_type IS DISTINCT FROM 'text' THEN
    RAISE EXCEPTION 'Member date of birth must use the encrypted text envelope column.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.member_profiles AS member
    WHERE (member.address IS NOT NULL AND member.address <> '' AND member.address NOT LIKE 'pii:v1:%')
      OR (member.id_number IS NOT NULL AND member.id_number <> '' AND member.id_number NOT LIKE 'pii:v1:%')
      OR (member.dob IS NOT NULL AND member.dob <> '' AND member.dob NOT LIKE 'pii:v1:%')
      OR (member.institution_name IS NOT NULL AND member.institution_name <> '' AND member.institution_name NOT LIKE 'pii:v1:%')
  ) THEN
    RAISE EXCEPTION 'Plaintext member identity data remains; complete the PII backfill before enabling this assertion.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM storage.buckets AS bucket
    WHERE bucket.id IN ('member-ids', 'payment-proofs')
      AND bucket.public IS TRUE
  ) THEN
    RAISE EXCEPTION 'Member identity and payment proof buckets must remain private.';
  END IF;
END;
$$;