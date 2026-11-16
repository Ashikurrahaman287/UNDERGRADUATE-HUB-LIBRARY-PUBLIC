INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('career-banners', 'career-banners', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public can view career banners" ON storage.objects;
CREATE POLICY "Public can view career banners"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'career-banners');

CREATE OR REPLACE FUNCTION public.validate_job_application_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, storage
AS $$
DECLARE
  v_required_fields jsonb;
  v_question jsonb;
  v_skill text;
  v_answer text;
BEGIN
  SELECT job.required_fields INTO v_required_fields
  FROM public.jobs AS job
  WHERE job.id = NEW.job_id AND job.status = 'ACTIVE';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This job is no longer accepting applications.' USING ERRCODE = '23514';
  END IF;

  IF COALESCE((v_required_fields->>'require_resume')::boolean, false) AND NEW.resume_url IS NULL THEN
    RAISE EXCEPTION 'A resume is required for this job.' USING ERRCODE = '23514';
  END IF;
  IF COALESCE((v_required_fields->>'require_photo')::boolean, false) AND NEW.photo_url IS NULL THEN
    RAISE EXCEPTION 'An applicant photo is required for this job.' USING ERRCODE = '23514';
  END IF;
  IF COALESCE((v_required_fields->>'require_skills')::boolean, false) AND cardinality(NEW.skills) = 0 THEN
    RAISE EXCEPTION 'At least one skill is required for this job.' USING ERRCODE = '23514';
  END IF;
  IF cardinality(NEW.skills) > 25 THEN
    RAISE EXCEPTION 'A maximum of 25 skills may be submitted.' USING ERRCODE = '22023';
  END IF;
  FOREACH v_skill IN ARRAY NEW.skills LOOP
    IF length(btrim(v_skill)) = 0 OR length(v_skill) > 64 THEN
      RAISE EXCEPTION 'Each skill must contain between 1 and 64 characters.' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  IF NEW.resume_url IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM storage.objects AS object
    WHERE object.bucket_id = 'career-submissions' AND object.name = NEW.resume_url
  ) THEN
    RAISE EXCEPTION 'The submitted resume file was not found.' USING ERRCODE = '23514';
  END IF;
  IF NEW.photo_url IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM storage.objects AS object
    WHERE object.bucket_id = 'career-submissions' AND object.name = NEW.photo_url
  ) THEN
    RAISE EXCEPTION 'The submitted applicant photo was not found.' USING ERRCODE = '23514';
  END IF;

  FOR v_question IN SELECT value FROM jsonb_array_elements(COALESCE(v_required_fields->'custom_questions', '[]'::jsonb)) LOOP
    v_answer := NEW.custom_answers->>(v_question->>'id');
    IF COALESCE((v_question->>'required')::boolean, true)
      AND COALESCE(NULLIF(btrim(v_answer), ''), '') = '' THEN
      RAISE EXCEPTION 'Answer all required custom application questions.' USING ERRCODE = '23514';
    END IF;
    IF length(COALESCE(v_answer, '')) > 2000 THEN
      RAISE EXCEPTION 'Custom application answers may not exceed 2,000 characters.' USING ERRCODE = '22023';
    END IF;
    IF v_question->>'type' = 'multiple_choice'
      AND COALESCE(v_answer, '') <> ''
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(v_question->'options') = 'array' THEN v_question->'options' ELSE '[]'::jsonb END
        ) AS option_value(value)
        WHERE option_value.value = v_answer
      ) THEN
      RAISE EXCEPTION 'Choose a valid answer for each multiple-choice question.' USING ERRCODE = '23514';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_job_application_submission() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS job_applications_validate_submission ON public.job_applications;
CREATE TRIGGER job_applications_validate_submission
  BEFORE INSERT ON public.job_applications
  FOR EACH ROW EXECUTE FUNCTION public.validate_job_application_submission();