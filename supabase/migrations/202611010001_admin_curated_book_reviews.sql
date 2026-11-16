ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS reviews jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.books'::pg_catalog.regclass
      AND conname = 'books_admin_reviews_array_check'
  ) THEN
    ALTER TABLE public.books
      ADD CONSTRAINT books_admin_reviews_array_check CHECK (
        CASE
          WHEN jsonb_typeof(reviews) = 'array' THEN jsonb_array_length(reviews) <= 100
          ELSE false
        END
      );
  END IF;
END;
$$;