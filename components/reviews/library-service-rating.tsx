import type { LibraryServiceRating as LibraryServiceRatingData } from "@/lib/book-reviews";
import { RatingStars } from "@/components/reviews/rating-stars";

export function LibraryServiceRating({ rating }: { rating: LibraryServiceRatingData }) {
  return (
    <section aria-label="Undergraduate Hub Library Service Rating" className="service-rating-strip">
      <div className="container service-rating-inner">
        <div><p className="eyebrow">Rated by our readers</p><h2>Undergraduate Hub Library Service Rating</h2></div>
        <div className="service-rating-score">
          <RatingStars label="Library service" rating={rating.average_rating} />
          <strong>{rating.average_rating === null ? "Not rated yet" : `${rating.average_rating.toFixed(1)} / 5`}</strong>
          <span>{rating.review_count} member {rating.review_count === 1 ? "review" : "reviews"}</span>
        </div>
      </div>
    </section>
  );
}