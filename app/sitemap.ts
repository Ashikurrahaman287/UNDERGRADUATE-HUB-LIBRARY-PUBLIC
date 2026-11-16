import type { MetadataRoute } from "next";
import { getBooks, getCategories } from "@/lib/books";
import { getSiteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();
  const [books, categories] = await Promise.all([getBooks(), getCategories()]);
  const staticRoutes: MetadataRoute.Sitemap = ["", "/books", "/categories", "/about", "/team", "/contact", "/faq", "/membership-pricing"].map((path) => ({
    url: new URL(path, siteUrl).toString(),
  }));

  return [
    ...staticRoutes,
    ...categories.map((category) => ({
      url: new URL(`/categories/${category.slug}`, siteUrl).toString(),
    })),
    ...books.map((book) => ({
      url: new URL(`/books/${book.slug}`, siteUrl).toString(),
      lastModified: new Date(book.updatedAt ?? book.addedAt),
    })),
  ];
}