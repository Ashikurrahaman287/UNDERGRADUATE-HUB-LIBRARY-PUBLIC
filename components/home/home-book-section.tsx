import Link from "next/link";
import { BookGrid } from "@/components/books/book-grid";
import type { Book } from "@/data/books";

type HomeBookSectionProps = {
  id: string;
  eyebrow: string;
  title: string;
  description?: string;
  books: Book[];
  linkHref?: string;
  linkLabel?: string;
  variant?: "paper" | "plain";
};

export function HomeBookSection({ id, eyebrow, title, description, books, linkHref, linkLabel, variant = "plain" }: HomeBookSectionProps) {
  return (
    <section className={`home-book-section home-book-section-${variant}`} aria-labelledby={`${id}-title`} id={id}>
      <div className="container">
        <div className="home-section-heading">
          <div><p className="eyebrow">{eyebrow}</p><h2 className="display-font" id={`${id}-title`}>{title}</h2>{description ? <p>{description}</p> : null}</div>
          {linkHref && linkLabel ? <Link className="text-link" href={linkHref}>{linkLabel} <span aria-hidden="true">→</span></Link> : null}
        </div>
        <BookGrid books={books} />
      </div>
    </section>
  );
}