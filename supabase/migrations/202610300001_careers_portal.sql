CREATE TABLE IF NOT EXISTS public.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 160),
  department text NOT NULL CHECK (length(btrim(department)) BETWEEN 2 AND 120),
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 12000),
  image_url text,
  required_fields jsonb NOT NULL DEFAULT '{"require_resume":false,"require_photo":false,"require_skills":false,"custom_questions":[]}'::jsonb
    CHECK (jsonb_typeof(required_fields) = 'object'),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CLOSED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jobs_status_created_idx
  ON public.jobs (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.job_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  applicant_name text NOT NULL CHECK (length(btrim(applicant_name)) BETWEEN 2 AND 120),
  applicant_email text NOT NULL CHECK (length(btrim(applicant_email)) BETWEEN 3 AND 254),
  resume_url text,
  photo_url text,
  skills text[] NOT NULL DEFAULT ARRAY[]::text[],
  custom_answers jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(custom_answers) = 'object'),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SHORTLISTED', 'REJECTED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_applications_one_per_user UNIQUE (job_id, user_id),
  CONSTRAINT job_applications_resume_path_check CHECK (
    resume_url IS NULL OR resume_url LIKE user_id::text || '/' || job_id::text || '/%'
  ),
  CONSTRAINT job_applications_photo_path_check CHECK (
    photo_url IS NULL OR photo_url LIKE user_id::text || '/' || job_id::text || '/%'
  )
);

CREATE INDEX IF NOT EXISTS job_applications_job_status_created_idx
  ON public.job_applications (job_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS job_applications_user_created_idx
  ON public.job_applications (user_id, created_at DESC);

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.jobs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.job_applications FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.jobs TO anon, authenticated;
GRANT ALL ON public.jobs TO service_role;
GRANT SELECT ON public.job_applications TO authenticated;
GRANT INSERT (job_id, user_id, applicant_name, applicant_email, resume_url, photo_url, skills, custom_answers)
  ON public.job_applications TO authenticated;
GRANT ALL ON public.job_applications TO service_role;

DROP POLICY IF EXISTS "Public can read active jobs" ON public.jobs;
CREATE POLICY "Public can read active jobs"
  ON public.jobs FOR SELECT TO anon, authenticated
  USING (status = 'ACTIVE');

DROP POLICY IF EXISTS "Applicants can read their own applications" ON public.job_applications;
CREATE POLICY "Applicants can read their own applications"
  ON public.job_applications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Applicants can submit their own application to active jobs" ON public.job_applications;
CREATE POLICY "Applicants can submit their own application to active jobs"
  ON public.job_applications FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'PENDING'
    AND EXISTS (
      SELECT 1 FROM public.jobs AS job
      WHERE job.id = job_id AND job.status = 'ACTIVE'
    )
    AND (resume_url IS NULL OR resume_url LIKE auth.uid()::text || '/' || job_id::text || '/%')
    AND (photo_url IS NULL OR photo_url LIKE auth.uid()::text || '/' || job_id::text || '/%')
  );

CREATE OR REPLACE FUNCTION public.validate_job_application_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_required_fields jsonb;
  v_question jsonb;
  v_skill text;
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

  FOR v_question IN SELECT value FROM jsonb_array_elements(COALESCE(v_required_fields->'custom_questions', '[]'::jsonb)) LOOP
    IF COALESCE((v_question->>'required')::boolean, true)
      AND COALESCE(NULLIF(btrim(NEW.custom_answers->>(v_question->>'id')), ''), '') = '' THEN
      RAISE EXCEPTION 'Answer all required custom application questions.' USING ERRCODE = '23514';
    END IF;
    IF length(COALESCE(NEW.custom_answers->>(v_question->>'id'), '')) > 2000 THEN
      RAISE EXCEPTION 'Custom application answers may not exceed 2,000 characters.' USING ERRCODE = '22023';
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

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'career-submissions', 'career-submissions', false, 10485760,
  ARRAY['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Applicants can read their own career files" ON storage.objects;
CREATE POLICY "Applicants can read their own career files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'career-submissions'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Applicants can upload their own career files" ON storage.objects;

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
    IF COALESCE((v_question->>'required')::boolean, true)
      AND COALESCE(NULLIF(btrim(NEW.custom_answers->>(v_question->>'id')), ''), '') = '' THEN
      RAISE EXCEPTION 'Answer all required custom application questions.' USING ERRCODE = '23514';
    END IF;
    IF length(COALESCE(NEW.custom_answers->>(v_question->>'id'), '')) > 2000 THEN
      RAISE EXCEPTION 'Custom application answers may not exceed 2,000 characters.' USING ERRCODE = '22023';
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

CREATE OR REPLACE TRIGGER jobs_set_updated_at
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE TRIGGER job_applications_set_updated_at
  BEFORE UPDATE ON public.job_applications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();