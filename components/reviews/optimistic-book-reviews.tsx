"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

export type PendingBookReview = {
  review_id: string;
  bookSlug: string;
  reviewer_label: string;
  review_text: string;
  reading_experience_rating: number;
  service_experience_rating: number;
  book_quality_rating: number;
  book_details_rating: number;
  overall_rating: number;
  created_at: string;
  isSubmitting: true;
};

type OptimisticBookReviewsContextValue = {
  pendingReviews: PendingBookReview[];
  addPendingReview: (review: PendingBookReview) => void;
  removePendingReview: (reviewId: string) => void;
};

const OptimisticBookReviewsContext = createContext<OptimisticBookReviewsContextValue | null>(null);

export function OptimisticBookReviewsProvider({ children }: { children: ReactNode }) {
  const [pendingReviews, setPendingReviews] = useState<PendingBookReview[]>([]);

  function addPendingReview(review: PendingBookReview) {
    setPendingReviews((current) => [...current.filter((item) => item.review_id !== review.review_id), review]);
  }

  function removePendingReview(reviewId: string) {
    setPendingReviews((current) => current.filter((review) => review.review_id !== reviewId));
  }

  return <OptimisticBookReviewsContext.Provider value={{ pendingReviews, addPendingReview, removePendingReview }}>
    {children}
  </OptimisticBookReviewsContext.Provider>;
}

export function useOptimisticBookReviews(): OptimisticBookReviewsContextValue {
  const context = useContext(OptimisticBookReviewsContext);
  if (!context) throw new Error("Optimistic book reviews must be used within their provider.");
  return context;
}
