import type { Availability, Book } from "@/data/books";

const categoryAliases: Record<string, string[]> = {
  novels: ["fiction"],
  "sci-fi": ["science fiction"],
  science: ["science & discovery"],
};

export function bookMatchesCategory(book: Book, categoryName: string): boolean {
  const normalizedName = categoryName.toLowerCase();
  const names = [normalizedName, ...(categoryAliases[normalizedName] ?? [])];
  return names.includes(book.category.toLowerCase()) || names.includes(book.subcategory.toLowerCase());
}

export function searchBooks(bookList: Book[], query: string, availability: Availability | "all" = "all"): Book[] {
  const normalizedQuery = query.trim().toLowerCase();
  return bookList.filter((book) => {
    const matchesAvailability = availability === "all" || book.availability === availability;
    const searchableText = `${book.title} ${book.author} ${book.category} ${book.subcategory} ${book.tags.join(" ")} ${book.isbn ?? ""}`.toLowerCase();
    return matchesAvailability && searchableText.includes(normalizedQuery);
  });
}
