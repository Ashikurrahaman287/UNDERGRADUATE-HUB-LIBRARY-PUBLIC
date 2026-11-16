"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { BookCard } from "@/components/books/book-card";
import { BookQuickView } from "@/components/books/book-quick-view";
import type { Book } from "@/data/books";

type BookGridProps = {
  books: Book[];
  emptyTitle?: string;
  emptyDescription?: string | null;
  emptyAction?: ReactNode;
  quickView?: boolean;
};
type QuickViewSelection = { book: Book; trigger: HTMLButtonElement };

export function BookGrid({ books, emptyTitle = "No books found.", emptyDescription = "Try a different title, author or category.", emptyAction, quickView = false }: BookGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const previousPositions = useRef(new Map<string, { left: number; top: number }>());
  const hasRendered = useRef(false);
  const [quickViewSelection, setQuickViewSelection] = useState<QuickViewSelection | null>(null);
  const openQuickView = (book: Book, trigger: HTMLButtonElement) => {
    setQuickViewSelection({ book, trigger });
  };

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) {
      previousPositions.current = new Map();
      hasRendered.current = true;
      return;
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const nextPositions = new Map<string, { left: number; top: number }>();
    grid.querySelectorAll<HTMLElement>("[data-book-id]").forEach((card) => {
      const id = card.dataset.bookId;
      if (!id) return;

      const { left, top } = card.getBoundingClientRect();
      const previous = previousPositions.current.get(id);
      if (!reduceMotion && hasRendered.current && typeof card.animate === "function") {
        if (previous) {
          const offsetX = previous.left - left;
          const offsetY = previous.top - top;
          if (offsetX || offsetY) {
            card.animate(
              [{ transform: `translate(${offsetX}px, ${offsetY}px)` }, { transform: "translate(0, 0)" }],
              { duration: 180, easing: "cubic-bezier(0.2, 0.65, 0.3, 1)" },
            );
          }
        } else {
          card.animate(
            [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "translateY(0)" }],
            { duration: 170, easing: "ease-out" },
          );
        }
      }
      nextPositions.set(id, { left, top });
    });

    previousPositions.current = nextPositions;
    hasRendered.current = true;
  }, [books]);

  if (books.length === 0) {
    return <div className="empty-state"><p>{emptyTitle}</p>{emptyDescription ? <p>{emptyDescription}</p> : null}{emptyAction}</div>;
  }

  return (
    <>
      <div className="book-grid" ref={gridRef}>
        {books.map((book) => <BookCard book={book} key={book.id} onQuickView={quickView ? openQuickView : undefined} />)}
      </div>
      {quickViewSelection ? <BookQuickView book={quickViewSelection.book} onClose={() => setQuickViewSelection(null)} returnFocusTo={quickViewSelection.trigger} /> : null}
    </>
  );
}