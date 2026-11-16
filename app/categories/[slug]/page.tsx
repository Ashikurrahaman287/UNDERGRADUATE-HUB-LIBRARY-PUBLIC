import type { Metadata } from "next";
import Link from "next/link";
import { CategoryBooks } from "@/components/categories/category-books";
import { notFound } from "next/navigation";
import { getBooksByCategory, getCategoryBySlug } from "@/lib/books";

type CategoryPageProps = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) return { title: "Subject not found" };
  return { title: category.name, description: category.introduction, alternates: { canonical: `/categories/${category.slug}` } };
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) notFound();
  const categoryBooks = await getBooksByCategory(category.name);

  return (
    <main className="page-main" id="main-content">
      <div className="page-intro container category-intro">
        <nav aria-label="Breadcrumb" className="category-breadcrumb">
          <Link href="/">Home</Link><span aria-hidden="true">→</span><Link href="/categories">Categories</Link><span aria-hidden="true">→</span><span aria-current="page">{category.name}</span>
        </nav>
        <p className="eyebrow">On this shelf</p>
        <h1 className="display-font">{category.name}<em>.</em></h1>
        <p>{category.introduction}</p>
      </div>
      <section className="container category-books-section" aria-label={`${category.name} books`}>
        <CategoryBooks books={categoryBooks} />
      </section>
    </main>
  );
}