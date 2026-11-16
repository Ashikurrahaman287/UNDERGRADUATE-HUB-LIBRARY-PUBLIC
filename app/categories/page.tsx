import type { Metadata } from "next";
import Link from "next/link";
import { getBooks, getCategories } from "@/lib/books";

export const metadata: Metadata = {
  title: "Browse by Subject",
  description: "Explore books across fiction, science fiction, psychology, philosophy, biography and more.",
  alternates: { canonical: "/categories" },
};

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const [books, categories] = await Promise.all([getBooks(), getCategories()]);

  return (
    <main className="page-main" id="main-content">
      <div className="page-intro container">
        <p className="eyebrow">Browse by what moves you</p>
        <h1 className="display-font">Explore the Collection</h1>
        <p>Find your next read by genre, subject or mood.</p>
      </div>
      <section className="container category-directory" aria-label="All book subjects">
        {categories.map((category, index) => {
          const bookCount = books.filter((book) => book.categoryId === category.id).length;
          return <Link className="category-card" href={`/categories/${category.slug}`} key={category.slug}>
            <span className="category-card-number">{String(index + 1).padStart(2, "0")}</span>
            <h2 className="display-font">{category.name}</h2>
            <p>{category.description}</p>
            <span className="category-card-meta">{bookCount} {bookCount === 1 ? "book" : "books"}<span className="category-card-browse">Browse <span aria-hidden="true">↗</span></span></span>
          </Link>;
        })}
      </section>
    </main>
  );
}