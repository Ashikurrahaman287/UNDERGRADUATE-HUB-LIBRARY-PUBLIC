"use client";

import { useActionState, useOptimistic, useRef, useState } from "react";
import { ButtonLabel } from "@/components/button-label";
import { requestRentalReturnAction, type ReturnRequestState } from "@/app/member/rent/return-actions";
import { useOptimisticBookReviews } from "@/components/reviews/optimistic-book-reviews";
import { siteInfo } from "@/lib/site-info";

const initialState: ReturnRequestState = {};
type OptimisticReviewPreview = { text: string; ratings: number[] };
const ratingCategories = [
  { name: "readingExperienceRating", label: "Reading Experience", description: "How engaging and valuable the read was." },
  { name: "serviceExperienceRating", label: "Undergraduate Hub Service Experience", description: "Delivery, handover, and platform smoothness." },
  { name: "bookQualityRating", label: "Book Quality", description: "The physical condition of the book." },
  { name: "bookDetailsRating", label: "Book Details Accuracy", description: "How well the description matched the book." },
] as const;

export function RentalReturnForm({ rentalId, fineTotal, bookSlug }: { rentalId: string; fineTotal: number; bookSlug: string }) {
  const { addPendingReview, removePendingReview } = useOptimisticBookReviews();
  const [committedReview, setCommittedReview] = useState<OptimisticReviewPreview | null>(null);
  const [optimisticReview, setOptimisticReview] = useOptimistic(committedReview, (_current, next: OptimisticReviewPreview | null) => next);
  const [state, formAction, isPending] = useActionState(async (previousState: ReturnRequestState, formData: FormData) => {
    const review = (formData.get("reviewText") ?? "").toString().trim();
    const ratings = ratingCategories.map((category) => Number(formData.get(category.name)));
    const reviewPreview = review && ratings.every((rating) => Number.isInteger(rating) && rating >= 1 && rating <= 5)
      ? { text: review, ratings }
      : null;
    const optimisticId = `optimistic-${rentalId}`;
    if (reviewPreview) {
      setOptimisticReview(reviewPreview);
      if (bookSlug) addPendingReview({
        review_id: optimisticId,
        bookSlug,
        reviewer_label: "You",
        review_text: reviewPreview.text,
        reading_experience_rating: reviewPreview.ratings[0],
        service_experience_rating: reviewPreview.ratings[1],
        book_quality_rating: reviewPreview.ratings[2],
        book_details_rating: reviewPreview.ratings[3],
        overall_rating: Number((reviewPreview.ratings.reduce((total, rating) => total + rating, 0) / reviewPreview.ratings.length).toFixed(1)),
        created_at: new Date().toISOString(),
        isSubmitting: true,
      });
    }
    try {
      const result = await requestRentalReturnAction(previousState, formData);
      if (result.success && reviewPreview) setCommittedReview(reviewPreview);
      if (result.error) removePendingReview(optimisticId);
      return result;
    } catch {
      removePendingReview(optimisticId);
      return { error: "Your review and return request could not be submitted. Try again." };
    }
  }, initialState);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const hasFine = fineTotal > 0;

  return (
    <div className="member-return-form">
      <button className="button-primary" onClick={() => dialogRef.current?.showModal()} type="button">
        {hasFine ? "Review, Pay Fine & Request Return" : "Review & Request Return"}
      </button>
      <dialog aria-labelledby={`return-review-title-${rentalId}`} className="member-review-dialog" ref={dialogRef}>
        <form action={formAction} className="member-form">
          <input name="rentalId" type="hidden" value={rentalId} />
          <header className="member-review-heading">
            <div><p className="eyebrow">Required before return</p><h2 className="display-font" id={`return-review-title-${rentalId}`}>Review this book</h2></div>
            <button aria-label="Close review form" className="button-secondary member-review-close" onClick={() => dialogRef.current?.close()} type="button">Close</button>
          </header>
          <label htmlFor={`review-text-${rentalId}`}>Your review</label>
          <textarea autoComplete="off" id={`review-text-${rentalId}`} maxLength={4000} name="reviewText" required rows={4} />
          {optimisticReview && isPending ? <article className="book-review book-review-optimistic" aria-live="polite"><p className="eyebrow">Review preview · Submitting</p><p className="book-review-text">{optimisticReview.text}</p><ul className="member-review-optimistic-ratings">{ratingCategories.map((category, index) => <li key={category.name}><span>{category.label}</span><strong aria-label={`${optimisticReview.ratings[index]} out of 5 stars`}>{"★".repeat(optimisticReview.ratings[index])}{"☆".repeat(5 - optimisticReview.ratings[index])}</strong></li>)}</ul></article> : null}
          <div className="member-rating-fields">
            {ratingCategories.map((category) => (
              <fieldset className="member-rating-field" key={category.name}>
                <legend>{category.label}</legend>
                <p>{category.description}</p>
                <div aria-label={`${category.label} rating`} className="member-rating-options" role="radiogroup">
                  {[5, 4, 3, 2, 1].map((rating) => {
                    return <label className="member-rating-choice" key={rating}>
                      <input aria-label={`${rating} out of 5 stars`} className="member-rating-input" name={category.name} required type="radio" value={rating} />
                      <span aria-hidden="true" className="member-rating-star">★</span>
                    </label>;
                  })}
                </div>
              </fieldset>
            ))}
          </div>
          {hasFine ? <>
            <p className="member-payment-instructions">Unpaid fines for your account total <strong>৳{fineTotal.toLocaleString("en-BD")}</strong>. Submit payment details with your return request. The library verifies payment before clearing the balance.</p>
            <p className="member-field-note">Pay to {siteInfo.paymentMethod} at <strong>{siteInfo.paymentNumber}</strong>.</p>
            <label htmlFor={`return-payment-method-${rentalId}`}>Payment method</label>
            <select autoComplete="off" id={`return-payment-method-${rentalId}`} name="paymentMethod" required defaultValue="">
              <option value="" disabled>Select payment method</option>
              <option value="bkash">bKash</option>
              <option value="nagad">Nagad</option>
            </select>
            <label htmlFor={`return-txid-${rentalId}`}>Transaction ID</label>
            <input autoComplete="off" id={`return-txid-${rentalId}`} maxLength={10} minLength={10} name="transactionId" pattern="[A-Za-z0-9]{10}" placeholder="10-character TrxID" required />
          </> : null}
          {state.error ? <p className="member-form-message member-form-message-error" role="alert">{state.error}</p> : null}
          {state.success ? <p className="member-form-message member-form-message-success" role="status">{state.success}</p> : null}
          <button aria-busy={isPending} className="button-primary button-stateful" disabled={isPending} type="submit">
            <ButtonLabel pending={isPending} pendingLabel="Submitting…">{hasFine ? "Pay Fine & Request Return" : "Submit Review & Request Return"}</ButtonLabel>
          </button>
        </form>
      </dialog>
    </div>
  );
}