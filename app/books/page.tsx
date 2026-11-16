import type { Metadata } from "next";
import { Catalogue } from "@/components/books/catalogue";
import { LibraryServiceRating } from "@/components/reviews/library-service-rating";
import { getLibraryServiceRating } from "@/lib/book-reviews";
import { getBooks, getCategories } from "@/lib/books";

export const metadata: Metadata = {
  title: "The Books",
  description: "Browse the Undergraduate Hub Library collection of novels, ideas and perspectives.",
  alternates: { canonical: "/books" },
};

export const dynamic = "force-dynamic";

export default async function BooksPage() {
  const [books, categories, serviceRating] = await Promise.all([getBooks(), getCategories(), getLibraryServiceRating()]);

  return (
    <main className="page-main" id="main-content">
      <div className="page-intro container">
        <p className="eyebrow">The collection</p>
        <h1 className="display-font">Browse the Library</h1>
        <p>Explore novels, sci-fi, psychology, philosophy, religion and more.</p>
      </div>
      <LibraryServiceRating rating={serviceRating} />
      <section className="container catalogue-section" aria-label="Book catalogue">
        <Catalogue books={books} categories={categories} />
      </section>
    </main>
  );
}