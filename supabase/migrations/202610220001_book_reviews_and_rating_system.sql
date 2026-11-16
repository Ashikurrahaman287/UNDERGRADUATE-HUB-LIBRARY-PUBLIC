CREATE TABLE public.book_reviews (
  review_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  rental_id uuid NOT NULL UNIQUE REFERENCES public.rentals(id) ON DELETE RESTRICT,
  review_text text NOT NULL CHECK (char_length(btrim(review_text)) BETWEEN 1 AND 4000),
  reading_experience_rating smallint NOT NULL CHECK (reading_experience_rating BETWEEN 1 AND 5),
  service_experience_rating smallint NOT NULL CHECK (service_experience_rating BETWEEN 1 AND 5),
  book_quality_rating smallint NOT NULL CHECK (book_quality_rating BETWEEN 1 AND 5),
  book_details_rating smallint NOT NULL CHECK (book_details_rating BETWEEN 1 AND 5),
  overall_rating numeric(2,1) GENERATED ALWAYS AS (
    (reading_experience_rating + service_experience_rating + book_quality_rating + book_details_rating) / 4.0
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX book_reviews_book_created_idx
  ON public.book_reviews (book_id, created_at DESC);

ALTER TABLE public.book_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.book_reviews FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.book_reviews TO service_role;

ALTER FUNCTION public.request_rental_return(uuid, text, text)
  RENAME TO request_rental_return_core;
REVOKE ALL ON FUNCTION public.request_rental_return_core(uuid, text, text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.request_rental_return(
  p_rental_id uuid,
  p_review_text text,
  p_reading_experience_rating integer,
  p_service_experience_rating integer,
  p_book_quality_rating integer,
  p_book_details_rating integer,
  p_payment_method text DEFAULT NULL,
  p_transaction_id text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_book_id uuid;
  v_review_text text := pg_catalog.btrim(COALESCE(p_review_text, ''));
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sign in before requesting a return.' USING ERRCODE = '42501';
  END IF;

  IF pg_catalog.char_length(v_review_text) NOT BETWEEN 1 AND 4000 THEN
    RAISE EXCEPTION 'Write a review before requesting a return.' USING ERRCODE = '22023';
  END IF;

  IF p_reading_experience_rating NOT BETWEEN 1 AND 5
     OR p_service_experience_rating NOT BETWEEN 1 AND 5
     OR p_book_quality_rating NOT BETWEEN 1 AND 5
     OR p_book_details_rating NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'Rate each review category from one to five stars.' USING ERRCODE = '22023';
  END IF;

  SELECT rental.book_id INTO v_book_id
  FROM public.rentals AS rental
  JOIN public.member_profiles AS member ON member.id = rental.member_id
  WHERE rental.id = p_rental_id
    AND member.user_id = v_user_id
    AND rental.status IN ('active', 'overdue', 'return_requested')
    AND rental.returned_at IS NULL
  FOR UPDATE OF rental;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only your handed-over book can be reviewed for return.' USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.book_reviews (
    book_id,
    user_id,
    rental_id,
    review_text,
    reading_experience_rating,
    service_experience_rating,
    book_quality_rating,
    book_details_rating
  ) VALUES (
    v_book_id,
    v_user_id,
    p_rental_id,
    v_review_text,
    p_reading_experience_rating,
    p_service_experience_rating,
    p_book_quality_rating,
    p_book_details_rating
  )
  ON CONFLICT (rental_id) DO NOTHING;

  RETURN public.request_rental_return_core(p_rental_id, p_payment_method, p_transaction_id);
END;
$$;

REVOKE ALL ON FUNCTION public.request_rental_return(uuid, text, integer, integer, integer, integer, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_rental_return(uuid, text, integer, integer, integer, integer, text, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.get_public_book_reviews(p_book_id uuid)
RETURNS TABLE (
  review_id uuid,
  reviewer_label text,
  review_text text,
  reading_experience_rating smallint,
  service_experience_rating smallint,
  book_quality_rating smallint,
  book_details_rating smallint,
  overall_rating numeric,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT review.review_id,
         'Reader ' || pg_catalog.substr(pg_catalog.md5(review.review_id::text), 1, 6),
      review.review_text, review.reading_experience_rating,
         review.service_experience_rating, review.book_quality_rating,
         review.book_details_rating, review.overall_rating, review.created_at
  FROM public.book_reviews AS review
  WHERE review.book_id = p_book_id
  ORDER BY review.created_at DESC
  LIMIT 50;
$$;

CREATE OR REPLACE FUNCTION public.get_public_book_rating_summary(p_book_id uuid)
RETURNS TABLE (
  reading_experience_rating numeric,
  service_experience_rating numeric,
  book_quality_rating numeric,
  book_details_rating numeric,
  review_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT round(avg(review.reading_experience_rating), 1),
         round(avg(review.service_experience_rating), 1),
         round(avg(review.book_quality_rating), 1),
         round(avg(review.book_details_rating), 1),
         count(*)
  FROM public.book_reviews AS review
  WHERE review.book_id = p_book_id;
$$;

CREATE OR REPLACE FUNCTION public.get_library_service_rating()
RETURNS TABLE (average_rating numeric, review_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT round(avg(review.service_experience_rating), 1), count(*)
  FROM public.book_reviews AS review;
$$;

REVOKE ALL ON FUNCTION public.get_public_book_reviews(uuid),
  public.get_public_book_rating_summary(uuid), public.get_library_service_rating()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_book_reviews(uuid),
  public.get_public_book_rating_summary(uuid), public.get_library_service_rating()
  TO anon, authenticated;