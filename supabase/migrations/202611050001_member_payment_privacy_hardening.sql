REVOKE INSERT ON TABLE public.membership_applications, public.payment_submissions
  FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Members submit their own pending application"
  ON public.membership_applications;
DROP POLICY IF EXISTS "Members submit their own pending payment"
  ON public.payment_submissions;

DROP POLICY IF EXISTS "Members can update own payment proof files" ON storage.objects;
DROP POLICY IF EXISTS "Members can delete own payment proof files" ON storage.objects;

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
         'Anonymous reader'::text,
         review.review_text,
         review.reading_experience_rating,
         review.service_experience_rating,
         review.book_quality_rating,
         review.book_details_rating,
         review.overall_rating,
         review.created_at
  FROM public.book_reviews AS review
  WHERE review.book_id = p_book_id
  ORDER BY review.created_at DESC
  LIMIT 50;
$$;

REVOKE ALL ON FUNCTION public.get_public_book_reviews(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_book_reviews(uuid)
  TO anon, authenticated;