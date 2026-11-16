"use client";

import { useState } from "react";
import Link from "next/link";
import type { Book } from "@/data/books";

export function BookSearch({ books }: { books: Book[] }) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const results = normalizedQuery
    ? books.filter((book) => `${book.title} ${book.author} ${book.category} ${book.subcategory} ${book.tags.join(" ")}`.toLowerCase().includes(normalizedQuery)).slice(0, 5)
    : [];

  return (
    <section className="home-search-section" aria-labelledby="home-search-title">
      <div className="container home-search-inner">
        <div className="home-search-heading"><p className="eyebrow">A good place to begin</p><h2 className="display-font" id="home-search-title">Find your next read</h2></div>
        <div className="home-search-control">
          <label className="home-search-field">
            <span className="sr-only">Search by title, author or genre</span>
            <svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.6" /><path d="m16 16 4.2 4.2" /></svg>
            <input autoComplete="off" onChange={(event) => setQuery(event.target.value)} placeholder="Search by title, author or genre..." type="search" value={query} />
            <span className="home-search-hint">{normalizedQuery ? `${results.length} found` : "Search the shelves"}</span>
          </label>
          {normalizedQuery ? <div aria-live="polite" className="home-search-results">
            {results.length > 0 ? <ul>{results.map((book) => <li key={book.id}><Link href={`/books/${book.slug}`}><span>{book.title}</span><span>{book.author} <b aria-hidden="true">↗</b></span></Link></li>)}</ul> : <p>No books found. Try another title, author or subject.</p>}
          </div> : null}
        </div>
      </div>
    </section>
  );
}