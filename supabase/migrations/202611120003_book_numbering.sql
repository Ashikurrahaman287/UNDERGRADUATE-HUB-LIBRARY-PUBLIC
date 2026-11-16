ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS book_number text;

WITH ranked_books AS (
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY added_at ASC, id ASC) AS row_number
  FROM public.books
  WHERE book_number IS NULL
)
UPDATE public.books AS b
SET book_number = 'UH-BOOK-' || ranked_books.row_number::text
FROM ranked_books
WHERE b.id = ranked_books.id;

CREATE UNIQUE INDEX IF NOT EXISTS books_book_number_unique_idx
  ON public.books (book_number)
  WHERE book_number IS NOT NULL;
