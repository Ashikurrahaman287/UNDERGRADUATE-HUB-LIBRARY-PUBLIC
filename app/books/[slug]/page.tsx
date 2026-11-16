import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookCoverImage } from "@/components/books/book-cover-image";
import { BookGrid } from "@/components/books/book-grid";
import { BookReviewsSection } from "@/components/reviews/book-reviews-section";
import { getBookReviewData } from "@/lib/book-reviews";
import { getBookBySlug, getBooksByCategory } from "@/lib/books";

type BookPageProps = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: BookPageProps): Promise<Metadata> {
  const { slug } = await params;
  const book = await getBookBySlug(slug);
  if (!book) return { title: "Book not found" };
  return {
    title: book.title,
    description: book.description,
    alternates: { canonical: `/books/${book.slug}` },
    openGraph: {
      title: `${book.title} | Undergraduate Hub Library`,
      description: book.description,
      type: "book",
      images: book.cover ? [{ url: book.cover, alt: `Cover of ${book.title} by ${book.author}` }] : [],
    },
  };
}

export default async function BookPage({ params }: BookPageProps) {
  const { slug } = await params;
  const book = await getBookBySlug(slug);
  if (!book) notFound();
  const availabilityLabel = book.availability === "available"
    ? "Available for Rental"
    : book.availability === "limited"
      ? "Limited Availability"
      : "Currently Rented";
  const shortDescription = book.description.length > 145
    ? `${book.description.slice(0, 142).trimEnd()}...`
    : book.description;
  const information = [
    { label: "Author", value: book.author },
    { label: "Category", value: book.category },
    { label: "Edition", value: book.edition },
    { label: "Language", value: book.language },
    { label: "ISBN", value: book.isbn },
    { label: "Year", value: book.year },
  ].filter((item) => typeof item.value === "number" || (typeof item.value === "string" && item.value.trim().length > 0));
  const [{ reviews, summary }, relatedBooks] = await Promise.all([
    getBookReviewData(book.id),
    getBooksByCategory(book.category).then((categoryBooks) => categoryBooks.filter((relatedBook) => relatedBook.id !== book.id).slice(0, 4)),
  ]);

  return (
    <main className="book-detail-page" id="main-content">
      <div className="container book-page-top">
        <Link className="book-back-link" href="/books"><span aria-hidden="true">←</span> Back to Library</Link>
        <article className="book-detail">
          <figure className="book-detail-figure">
            <div className="detail-cover"><BookCoverImage author={book.author} cover={book.cover} priority sizes="(max-width: 760px) 78vw, 430px" title={book.title} /></div>
            <figcaption>From the Undergraduate Hub Library collection</figcaption>
          </figure>
          <div className="detail-copy">
            <p className="eyebrow">{book.category}<span aria-hidden="true"> / </span>{book.subcategory}</p>
            <h1 className="display-font">{book.title}</h1>
            <p className="detail-author">by {book.author}</p>
            <p className="detail-description">{shortDescription}</p>
            <p className={`book-status book-status-${book.availability}`}><span aria-hidden="true" />{availabilityLabel}</p>
            {book.availability === "available" ? (
              <Link className="button-primary rent-contact-link" href={`/member/rent?bookId=${book.id}`}>Request to Rent <span aria-hidden="true">↗</span></Link>
            ) : (
              <Link className="button-primary rent-contact-link" href={`/member/reserve?bookId=${book.id}`}>Join Reservation Queue <span aria-hidden="true">↗</span></Link>
            )}
          </div>
        </article>
      </div>
      <section className="container book-about-section" aria-labelledby="about-book-title">
        <div className="book-detail-section-label"><span>01</span><span className="eyebrow">The story</span></div>
        <div className="book-detail-section-copy"><h2 className="display-font" id="about-book-title">About the Book</h2><p>{book.description}</p></div>
      </section>
      <section className="book-information-band" aria-labelledby="book-information-title">
        <div className="container book-information-inner">
          <p className="eyebrow">At a glance</p>
          <h2 className="display-font" id="book-information-title">Book Information</h2>
          <dl className="book-information-grid">
            {information.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}
          </dl>
        </div>
      </section>
      <BookReviewsSection bookSlug={book.slug} curatedReviews={book.adminReviews ?? []} reviews={reviews} summary={summary} />
      {relatedBooks.length > 0 ? <section className="container related-books-section" aria-labelledby="related-books-title">
        <div className="home-section-heading"><div><p className="eyebrow">More from {book.category}</p><h2 className="display-font" id="related-books-title">You may also like</h2></div><Link className="text-link" href="/books">View all books <span aria-hidden="true">→</span></Link></div>
        <BookGrid books={relatedBooks} />
      </section> : null}
    </main>
  );
}