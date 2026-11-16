import Link from "next/link";
import { BookCoverImage } from "@/components/books/book-cover-image";
import type { Book } from "@/data/books";

export function BookCard({ book, onQuickView }: { book: Book; onQuickView?: (book: Book, trigger: HTMLButtonElement) => void }) {
  const availabilityLabel = book.availability === "available" ? "Available" : book.availability === "limited" ? "Limited" : "Unavailable";
  console.log("Rendering cover URL:", book.cover);

  return (
    <article className="book-card" data-book-id={book.id}>
      <Link className="book-card-link" href={`/books/${book.slug}`} aria-label={`View details for ${book.title} by ${book.author}`}>
        <div className="book-cover-link">
          <div className="book-cover"><BookCoverImage author={book.author} cover={book.cover} sizes="(max-width: 640px) 44vw, (max-width: 900px) 30vw, 280px" title={book.title} /></div>
          <span className={`availability availability-${book.availability}`}><span className="availability-dot" />{availabilityLabel}</span>
        </div>
        <div className="book-card-copy">
          <p className="book-card-category">{book.category} <span aria-hidden="true">·</span> {book.subcategory}</p>
          <h3 className="display-font">{book.title}</h3>
          <p className="book-author">{book.author}</p>
          <span className="book-view-link">View Details <span aria-hidden="true">↗</span></span>
        </div>
      </Link>
      {onQuickView ? <button className="button-outline book-quick-view" onClick={(event) => onQuickView(book, event.currentTarget)} type="button">Quick View</button> : null}
    </article>
  );
}