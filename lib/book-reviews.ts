import "server-only";

import type { Database } from "@/lib/database.types";
import { createPublicSupabaseClient } from "@/lib/supabase/server";

export type BookReview = Database["public"]["Functions"]["get_public_book_reviews"]["Returns"][number];
export type BookRatingSummary = Database["public"]["Functions"]["get_public_book_rating_summary"]["Returns"][number];
export type LibraryServiceRating = Database["public"]["Functions"]["get_library_service_rating"]["Returns"][number];

export async function getBookReviewData(bookId: string): Promise<{ reviews: BookReview[]; summary: BookRatingSummary }> {
  const client = await createPublicSupabaseClient();
  const [reviewsResult, summaryResult] = await Promise.all([
    client.rpc("get_public_book_reviews", { p_book_id: bookId }),
    client.rpc("get_public_book_rating_summary", { p_book_id: bookId }),
  ]);

  if (reviewsResult.error || summaryResult.error) {
    throw new Error("Book reviews are temporarily unavailable.");
  }

  return {
    reviews: reviewsResult.data ?? [],
    summary: summaryResult.data?.[0] ?? {
      reading_experience_rating: null,
      service_experience_rating: null,
      book_quality_rating: null,
      book_details_rating: null,
      review_count: 0,
    },
  };
}

export async function getLibraryServiceRating(): Promise<LibraryServiceRating> {
  const client = await createPublicSupabaseClient();
  const { data, error } = await client.rpc("get_library_service_rating");
  if (error) throw new Error("The library service rating is temporarily unavailable.");
  return data?.[0] ?? { average_rating: null, review_count: 0 };
}