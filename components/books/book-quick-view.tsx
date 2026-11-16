"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BookCoverImage } from "@/components/books/book-cover-image";
import type { Book } from "@/data/books";

function availabilityLabel(book: Book): string {
  if (book.availability === "available") return "Available for Rental";
  if (book.availability === "limited") return "Limited Availability";
  return "Currently Rented";
}

function yearLabel(year: number | null): string | null {
  if (!year || !Number.isInteger(year)) return null;
  return year < 0 ? `${Math.abs(year)} BCE` : String(year);
}

export function BookQuickView({ book, onClose, returnFocusTo }: { book: Book; onClose: () => void; returnFocusTo: HTMLElement | null }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const closingRef = useRef(false);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const previousFocus = returnFocusTo?.isConnected
      ? returnFocusTo
      : document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (!dialog.open) dialog.showModal();
    closeButtonRef.current?.focus();

    return () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
      if (dialog.open) dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) {
        window.requestAnimationFrame(() => {
          if (previousFocus.isConnected) previousFocus.focus();
        });
      }
    };
  }, [returnFocusTo]);

  const finishClose = () => {
    if (!closingRef.current) return;
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    dialogRef.current?.close();
    onClose();
  };

  const requestClose = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    setIsClosing(true);
    closeTimerRef.current = window.setTimeout(finishClose, 260);
  };

  const details = [
    { label: "Category", value: [book.category, book.subcategory].filter(Boolean).join(" / ") },
    { label: "Language", value: book.language?.trim() || null },
    { label: "Publication year", value: yearLabel(book.year) },
    { label: "Edition", value: book.edition?.trim() || null },
    { label: "ISBN", value: book.isbn?.trim() || null },
  ].filter((detail): detail is { label: string; value: string } => Boolean(detail.value));

  return (
    <dialog
      aria-describedby={book.description ? "book-quick-view-description" : undefined}
      aria-labelledby="book-quick-view-title"
      className={`book-quick-view-dialog${isClosing ? " is-closing" : ""}`}
      onAnimationEnd={(event) => {
        if (event.target === dialogRef.current && isClosing) finishClose();
      }}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        ) {
          requestClose();
        }
      }}
      ref={dialogRef}
    >
      <div className="book-quick-view-layout">
        <div className="book-quick-view-cover">
          <BookCoverImage author={book.author} cover={book.cover} sizes="(max-width: 700px) 42vw, 220px" title={book.title} />
        </div>
        <div className="book-quick-view-copy">
          <div className="book-quick-view-heading">
            <span className={`availability availability-${book.availability}`}><span aria-hidden="true" className="availability-dot" />{availabilityLabel(book)}</span>
            <button aria-label="Close Quick View" className="button-ghost book-quick-view-close" onClick={requestClose} ref={closeButtonRef} type="button">Close</button>
          </div>
          <h2 className="display-font" id="book-quick-view-title">{book.title}</h2>
          <p className="book-quick-view-author">by {book.author}</p>
          {book.description ? <p className="book-quick-view-description" id="book-quick-view-description">{book.description}</p> : null}
          {details.length ? <dl className="book-quick-view-details">{details.map((detail) => <div key={detail.label}><dt>{detail.label}</dt><dd>{detail.value}</dd></div>)}</dl> : null}
          <div className="book-quick-view-actions">
            <Link className="button-outline" href={`/books/${book.slug}`}>View Full Details</Link>
            <Link className="button-primary" href={book.availability === "available" ? `/member/rent?bookId=${book.id}` : `/member/reserve?bookId=${book.id}`}>
              {book.availability === "available" ? "Request to Rent" : "Join Reservation Queue"}
            </Link>
          </div>
        </div>
      </div>
    </dialog>
  );
}