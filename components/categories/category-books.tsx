"use client";

import { useState } from "react";
import { BookGrid } from "@/components/books/book-grid";
import type { Availability, Book } from "@/data/books";
import { searchBooks } from "@/lib/book-utils";

export function CategoryBooks({ books }: { books: Book[] }) {
  const [query, setQuery] = useState("");
  const [availability, setAvailability] = useState<Availability | "all">("all");
  const filteredBooks = searchBooks(books, query, availability);
  const categoryIsEmpty = books.length === 0;

  return (
    <>
      <div className="category-book-controls">
        <label className="search-field">
          <span className="sr-only">Search within this category</span>
          <span aria-hidden="true">⌕</span>
          <input onChange={(event) => setQuery(event.target.value)} placeholder="Search within this category..." type="search" value={query} />
        </label>
        <label className="catalogue-select">Availability
          <select onChange={(event) => setAvailability(event.target.value as Availability | "all")} value={availability}>
            <option value="all">All availability</option>
            <option value="available">Available</option>
            <option value="limited">Limited</option>
            <option value="unavailable">Unavailable</option>
          </select>
        </label>
      </div>
      <p className="results-count" aria-live="polite">{filteredBooks.length} {filteredBooks.length === 1 ? "book" : "books"} in this category</p>
      <BookGrid books={filteredBooks} emptyTitle={categoryIsEmpty ? "No books are currently available in this category." : "No books found."} emptyDescription={categoryIsEmpty ? null : "Try a different title, author or category."} />
    </>
  );
}