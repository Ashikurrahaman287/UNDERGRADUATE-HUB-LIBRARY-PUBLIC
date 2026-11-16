"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { BookCoverImage } from "@/components/books/book-cover-image";
import { ButtonLabel } from "@/components/button-label";
import type { Book } from "@/data/books";
import type { Category } from "@/data/categories";
import { archiveBookAction } from "@/app/admin/(protected)/books/actions";

function availabilityLabel(availability: Book["availability"]): string {
  if (availability === "available") return "Available";
  if (availability === "limited") return "Limited";
  return "Unavailable";
}

function pageHref(page: number, filters: BookTableFilters): string {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.categoryId) params.set("categoryId", filters.categoryId);
  if (filters.availability !== "all") params.set("availability", filters.availability);
  if (filters.featured !== "all") params.set("featured", filters.featured);
  if (filters.visibility !== "active") params.set("visibility", filters.visibility);
  params.set("page", String(page));
  return `/ashik-loves-jannat/books?${params.toString()}`;
}

type BookTableFilters = { query: string; categoryId: string; availability: string; featured: string; visibility: string };
type AdminBooksTableProps = {
  books: Book[];
  categories: Category[];
  totalRecords: number;
  currentPage: number;
  pageSize: number;
  filters: BookTableFilters;
};

function ArchiveButton({ bookId }: { bookId: string }) {
  const [state, formAction, pending] = useActionState(archiveBookAction, {});
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (state.success) dialogRef.current?.close();
  }, [state.success]);

  return (
    <div className="admin-archive-control">
      <button className="admin-action-button admin-archive-button" onClick={() => dialogRef.current?.showModal()} type="button">Archive</button>
      <dialog aria-labelledby={`archive-title-${bookId}`} className="admin-confirm-dialog" ref={dialogRef}>
        <p className="eyebrow">Book status</p>
        <h2 className="display-font" id={`archive-title-${bookId}`}>Archive this book?</h2>
        <p>It will no longer appear on the public website. Rental history is preserved.</p>
        {state.error ? <p className="admin-form-error" role="alert">{state.error}</p> : null}
        <form action={formAction}>
          <input name="id" type="hidden" value={bookId} />
          <div className="admin-confirm-actions">
            <button className="button-outline" onClick={() => dialogRef.current?.close()} type="button">Cancel</button>
            <button aria-busy={pending} className="admin-action-button admin-archive-button button-stateful" disabled={pending} type="submit"><ButtonLabel pending={pending} pendingLabel="Archiving…">Archive</ButtonLabel></button>
          </div>
        </form>
      </dialog>
      {state.success ? <small className="admin-form-success" role="status">{state.success}</small> : null}
    </div>
  );
}

function BookActions({ book }: { book: Book }) {
  return <div className="admin-book-actions"><Link className="admin-action-button" href={`/ashik-loves-jannat/books/${book.id}/edit`}>Edit</Link>{book.isActive !== false ? <ArchiveButton bookId={book.id} /> : <span className="admin-archived-label">Archived</span>}</div>;
}

function UpdatedDate({ book }: { book: Book }) {
  const date = book.updatedAt ?? book.addedAt;
  return <time dateTime={date}>{new Date(date).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}</time>;
}

export function AdminBooksTable({ books, categories, totalRecords, currentPage, pageSize, filters }: AdminBooksTableProps) {
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  return (
    <>
      <form action="/ashik-loves-jannat/books" className="admin-book-filters" method="get">
        <label className="admin-filter-search">Search books<input defaultValue={filters.query} maxLength={80} name="q" placeholder="Title or author" type="search" /></label>
        <label>Category<select defaultValue={filters.categoryId} name="categoryId"><option value="">All categories</option>{categories.map((item) => <option key={item.slug} value={item.id ?? ""}>{item.name}</option>)}</select></label>
        <label>Availability<select defaultValue={filters.availability} name="availability"><option value="all">All</option><option value="available">Available</option><option value="limited">Limited</option><option value="unavailable">Unavailable</option></select></label>
        <label>Featured<select defaultValue={filters.featured} name="featured"><option value="all">All books</option><option value="true">Featured</option><option value="false">Not featured</option></select></label>
        <label>Records<select defaultValue={filters.visibility} name="visibility"><option value="active">Active</option><option value="archived">Archived</option><option value="all">All records</option></select></label>
        <button className="admin-action-button" type="submit">Filter</button>
      </form>
      <p aria-live="polite" className="admin-result-count">{totalRecords} {totalRecords === 1 ? "book" : "books"}</p>
      <div className="admin-table-wrap">
        <table className="admin-books-table">
          <thead><tr><th scope="col">Cover</th><th scope="col">Title / Author</th><th scope="col">Category</th><th scope="col">Availability</th><th scope="col">Featured</th><th scope="col">Updated</th><th scope="col">Actions</th></tr></thead>
          <tbody>{books.map((book) => <tr key={book.id}>
            <td><div className="admin-book-thumbnail"><BookCoverImage author={book.author} cover={book.cover} sizes="64px" title={book.title} /></div></td>
            <td><strong>{book.title}</strong><span>{book.author}</span></td>
            <td>{book.category}{book.subcategory ? <small>{book.subcategory}</small> : null}</td>
            <td><span className={`admin-status admin-status-${book.availability}`}>{availabilityLabel(book.availability)}</span></td>
            <td>{book.featured ? "Yes" : "No"}</td><td><UpdatedDate book={book} /></td><td><BookActions book={book} /></td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="admin-book-cards">{books.map((book) => <article className="admin-book-card" key={book.id}>
        <div className="admin-book-card-top"><div className="admin-book-thumbnail"><BookCoverImage author={book.author} cover={book.cover} sizes="64px" title={book.title} /></div><div><strong>{book.title}</strong><span>{book.author}</span></div></div>
        <dl><div><dt>Category</dt><dd>{book.category}{book.subcategory ? ` · ${book.subcategory}` : ""}</dd></div><div><dt>Availability</dt><dd><span className={`admin-status admin-status-${book.availability}`}>{availabilityLabel(book.availability)}</span></dd></div><div><dt>Featured</dt><dd>{book.featured ? "Yes" : "No"}</dd></div><div><dt>Updated</dt><dd><UpdatedDate book={book} /></dd></div></dl>
        <BookActions book={book} />
      </article>)}</div>
      {books.length === 0 ? <p className="admin-empty-note">No books match these filters.</p> : null}
      <nav aria-label="Book pages" className="admin-pagination"><span>Page {currentPage} of {totalPages}</span>{currentPage > 1 ? <Link className="admin-action-button" href={pageHref(currentPage - 1, filters)}>Previous</Link> : null}{currentPage < totalPages ? <Link className="admin-action-button" href={pageHref(currentPage + 1, filters)}>Next</Link> : null}</nav>
    </>
  );
}