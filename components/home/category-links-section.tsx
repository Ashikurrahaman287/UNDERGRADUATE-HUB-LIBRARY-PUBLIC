import Link from "next/link";
import type { Category } from "@/data/categories";

const featuredSlugs = ["novels", "science-fiction", "fantasy", "mystery-thriller", "psychology", "philosophy", "religion", "self-development", "biography", "history"];

export function CategoryLinksSection({ categories }: { categories: Category[] }) {
  const featuredCategories = featuredSlugs.map((slug) => categories.find((category) => category.slug === slug)).filter((category) => category !== undefined);

  return (
    <section className="home-categories-section" aria-labelledby="home-categories-title">
      <div className="container">
        <div className="home-section-heading"><div><p className="eyebrow">Follow a thread</p><h2 className="display-font" id="home-categories-title">A collection with many doors.</h2></div><Link className="text-link" href="/categories">All categories <span aria-hidden="true">→</span></Link></div>
        <div className="home-category-grid">
          {featuredCategories.map((category, index) => <Link className="home-category-link" href={`/categories/${category.slug}`} key={category.slug}>
            <span>{String(index + 1).padStart(2, "0")}</span><span className="display-font">{category.name}</span><span aria-hidden="true">↗</span>
          </Link>)}
        </div>
      </div>
    </section>
  );
}