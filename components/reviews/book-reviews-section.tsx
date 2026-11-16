"use client";

import type { BookRatingSummary, BookReview } from "@/lib/book-reviews";
import type { AdminBookReview } from "@/lib/database.types";
import { RatingStars } from "@/components/reviews/rating-stars";
import { useOptimisticBookReviews } from "@/components/reviews/optimistic-book-reviews";

const criteria = [
  { key: "reading_experience_rating", label: "Reading Experience" },
  { key: "service_experience_rating", label: "Undergraduate Hub Service Experience" },
  { key: "book_quality_rating", label: "Book Quality" },
  { key: "book_details_rating", label: "Book Details Accuracy" },
] as const;

function formattedDate(value: string): string {
  return new Date(value).toLocaleDateString("en-BD", { dateStyle: "long", timeZone: "Asia/Dhaka" });
}

export function BookReviewsSection({ bookSlug, reviews, summary, curatedReviews = [] }: { bookSlug: string; reviews: BookReview[]; summary: BookRatingSummary; curatedReviews?: AdminBookReview[] }) {
  const { pendingReviews } = useOptimisticBookReviews();
  const pendingForBook = pendingReviews.filter((review) => review.bookSlug === bookSlug);
  const visibleReviews = [
    ...pendingForBook.filter((pending) => !reviews.some((review) => review.review_text === pending.review_text
      && review.reading_experience_rating === pending.reading_experience_rating
      && review.service_experience_rating === pending.service_experience_rating
      && review.book_quality_rating === pending.book_quality_rating
      && review.book_details_rating === pending.book_details_rating)),
    ...reviews,
  ];
  return (
    <section aria-labelledby="book-reviews-title" className="container book-reviews-section">
      <div className="book-reviews-heading">
        <div><p className="eyebrow">From verified rentals</p><h2 className="display-font" id="book-reviews-title">Reviews &amp; Ratings</h2></div>
        <p>{summary.review_count} {summary.review_count === 1 ? "review" : "reviews"}</p>
      </div>
      <div className="book-rating-summary">
        {criteria.map((criterion) => {
          const rating = summary[criterion.key];
          return <div className="book-rating-criterion" key={criterion.key}>
            <span>{criterion.label}</span>
            <RatingStars label={criterion.label} rating={rating} />
            <strong>{rating === null ? "—" : rating.toFixed(1)}</strong>
          </div>;
        })}
      </div>
      {curatedReviews.length ? <section aria-labelledby="library-curated-reviews-title" className="book-curated-reviews">
        <div className="book-curated-reviews-heading"><div><p className="eyebrow">Additional reader feedback</p><h3 className="display-font" id="library-curated-reviews-title">Library-curated reviews</h3></div><span>{curatedReviews.length} {curatedReviews.length === 1 ? "review" : "reviews"}</span></div>
        <div className="book-review-list">{curatedReviews.map((review) => <article className="book-review book-curated-review" key={review.review_id}>
          <header className="book-review-header">
            <div><p className="book-review-author">{review.author_name || "Anonymous reader"}</p>{review.is_verified ? <span className="book-review-source-verified">Source verified</span> : null}</div>
            <div className="book-review-overall"><RatingStars label="Review rating" rating={review.rating} /><strong>{review.rating.toFixed(1)}</strong></div>
          </header>
          <p className="book-review-text">{review.comment}</p>
        </article>)}</div>
      </section> : null}
      {visibleReviews.length ? <div className="book-review-list">
        {visibleReviews.map((review) => <article className={`book-review${"isSubmitting" in review && review.isSubmitting ? " book-review-optimistic" : ""}`} key={review.review_id}>
          <header className="book-review-header">
            <div><p className="book-review-author">{review.reviewer_label}</p>{"isSubmitting" in review && review.isSubmitting ? <span className="book-review-source-pending">Submitting…</span> : <span className="book-review-member-verified">Verified Member</span>}<time dateTime={review.created_at}>{formattedDate(review.created_at)}</time></div>
            <div className="book-review-overall"><RatingStars label="Overall" rating={review.overall_rating} /><strong>{review.overall_rating.toFixed(1)}</strong></div>
          </header>
          <p className="book-review-text">{review.review_text}</p>
          <dl className="book-review-criteria">
            {criteria.map((criterion) => <div key={criterion.key}><dt>{criterion.label}</dt><dd>{review[criterion.key]} / 5</dd></div>)}
          </dl>
        </article>)}
      </div> : <p className="book-reviews-empty">No member reviews yet.</p>}
    </section>
  );
}