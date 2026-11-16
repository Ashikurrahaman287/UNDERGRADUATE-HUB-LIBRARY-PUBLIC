ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS review_note text
  CHECK (review_note IS NULL OR length(review_note) <= 2000);