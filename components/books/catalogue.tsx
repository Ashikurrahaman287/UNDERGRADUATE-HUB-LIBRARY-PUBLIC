"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { BookGrid } from "@/components/books/book-grid";
import type { Book } from "@/data/books";
import type { Category } from "@/data/categories";
import { bookMatchesCategory, searchBooks } from "@/lib/book-utils";

type CatalogueToast = { type: "success" | "error" | "info"; message: string };

export function Catalogue({ books, categories }: { books: Book[]; categories: Category[] }) {
  const [toast, setToast] = useState<CatalogueToast | null>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const categorySlug = searchParams.get("category") ?? "all";
  const selectedCategory = categories.find((category) => category.slug === categorySlug);
  const availabilityValue = searchParams.get("availability");
  const availability = (["available", "limited", "unavailable"] as const)
    .find((value) => value === availabilityValue) ?? "all";
  const sortValue = searchParams.get("sort");
  const sort = (["newest", "title-asc", "title-desc"] as const)
    .find((value) => value === sortValue) ?? "featured";
  const query = searchParams.get("q") ?? "";
  const matchingBooks = searchBooks(books, query, availability)
    .filter((book) => !selectedCategory || bookMatchesCategory(book, selectedCategory.name));
  const filteredBooks = [...matchingBooks].sort((first, second) => {
    if (sort === "newest") return second.addedAt.localeCompare(first.addedAt);
    if (sort === "title-asc") return first.title.localeCompare(second.title);
    if (sort === "title-desc") return second.title.localeCompare(first.title);
    return Number(second.featured) - Number(first.featured) || second.addedAt.localeCompare(first.addedAt);
  });
  const hasActiveFilters = Boolean(query) || categorySlug !== "all" || availability !== "all" || sort !== "featured";

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const writeParameters = (nextParams: URLSearchParams) => {
    const queryString = nextParams.toString();
    const hash = window.location.hash;
    window.history.replaceState(null, "", `${pathname}${queryString ? `?${queryString}` : ""}${hash}`);
  };

  const updateParameter = (key: string, value: string, defaultValue: string) => {
    const nextParams = new URLSearchParams(window.location.search);
    if (!value || value === defaultValue) nextParams.delete(key);
    else nextParams.set(key, value);
    writeParameters(nextParams);
  };

  const clearFilters = () => {
    const nextParams = new URLSearchParams(window.location.search);
    ["q", "category", "availability", "sort"].forEach((key) => nextParams.delete(key));
    writeParameters(nextParams);
    setToast({ type: "success", message: "Search and filters cleared." });
  };

  return (
    <>
      <div className="catalogue-search-wrap">
        <label className="search-field">
          <span className="sr-only">Search by title, author, genre or ISBN</span>
          <span aria-hidden="true">⌕</span>
          <input id="catalogue-search" onChange={(event) => updateParameter("q", event.target.value, "")} placeholder="Search by title, author, genre or ISBN..." type="search" value={query} />
        </label>
      </div>
      <div aria-label="Filter and sort books" className="catalogue-controls" role="group">
        <label className="catalogue-select catalogue-category-select">Category
          <select onChange={(event) => updateParameter("category", event.target.value, "all")} value={categorySlug}>
            <option value="all">All categories</option>
            {categories.map((category) => <option key={category.slug} value={category.slug}>{category.name}</option>)}
          </select>
        </label>
        <label className="catalogue-select">Availability
          <select onChange={(event) => updateParameter("availability", event.target.value, "all")} value={availability}>
            <option value="all">All</option>
            <option value="available">Available</option>
            <option value="limited">Limited</option>
            <option value="unavailable">Unavailable</option>
          </select>
        </label>
        <label className="catalogue-select">Sort
          <select onChange={(event) => updateParameter("sort", event.target.value, "featured")} value={sort}>
            <option value="featured">Featured</option>
            <option value="newest">Newest</option>
            <option value="title-asc">Title A-Z</option>
            <option value="title-desc">Title Z-A</option>
          </select>
        </label>
      </div>
      <div className="catalogue-results-bar">
        <p className="results-count" aria-live="polite">{filteredBooks.length} {filteredBooks.length === 1 ? "book" : "books"} in the collection</p>
        {hasActiveFilters && filteredBooks.length > 0 ? <button className="button-ghost catalogue-clear-button" onClick={clearFilters} type="button">Clear search and filters</button> : null}
      </div>
      <div aria-live={toast?.type === "error" ? "assertive" : "polite"} className={`catalogue-toast${toast ? ` catalogue-toast-${toast.type}` : ""}`} role={toast?.type === "error" ? "alert" : "status"}>{toast?.message}</div>
      <BookGrid
        books={filteredBooks}
        emptyAction={hasActiveFilters ? <button className="button-outline catalogue-empty-reset" onClick={clearFilters} type="button">Reset search and filters</button> : null}
        emptyDescription={hasActiveFilters ? "Try a different search or clear your current filters." : "The collection is empty right now."}
        emptyTitle={hasActiveFilters ? "No books match your search." : "No books are available."}
        quickView
      />
    </>
  );
}