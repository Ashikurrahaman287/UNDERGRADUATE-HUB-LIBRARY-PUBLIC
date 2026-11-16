import { useId } from "react";

export function RatingStars({ rating, label }: { rating: number | null; label?: string }) {
  const accessibleLabel = rating === null ? "No ratings yet" : `${rating.toFixed(1)} out of 5 stars`;
  const fill = rating === null ? 0 : Math.max(0, Math.min(5, rating)) * 20;
  const gradientId = useId();

  return (
    <svg aria-label={label ? `${label}: ${accessibleLabel}` : accessibleLabel} className="rating-stars" role="img" viewBox="0 0 85 20">
      <defs>
        <linearGradient id={gradientId}>
          <stop offset={`${fill}%`} stopColor="#c28a2d" />
          <stop offset={`${fill}%`} stopColor="#b9bdb7" />
        </linearGradient>
      </defs>
      <text aria-hidden="true" fill={`url(#${gradientId})`} fontSize="17" x="0" y="16">★★★★★</text>
    </svg>
  );
}