import type { AdminBookReview } from "@/lib/database.types";

export type Availability = "available" | "limited" | "unavailable";

export type Book = {
  id: string;
  slug: string;
  title: string;
  author: string;
  category: string;
  subcategory: string;
  description: string;
  cover: string | null;
  edition: string | null;
  language: string | null;
  isbn: string | null;
  year: number | null;
  addedAt: string;
  availability: Availability;
  featured: boolean;
  tags: string[];
  adminReviews?: AdminBookReview[];
  categoryId?: string;
  updatedAt?: string;
  isActive?: boolean;
};

export const books: Book[] = [
  { id: "book-001", slug: "the-left-hand-of-darkness", title: "The Left Hand of Darkness", author: "Ursula K. Le Guin", category: "Fiction", subcategory: "Science Fiction", description: "A lone envoy travels to a winterbound world where the boundaries of loyalty, identity and belonging are more fluid than he imagined.", cover: "/books/moonlit-orbit.svg", edition: "First published edition", language: "English", isbn: "978-0-441-47812-5", year: 1969, addedAt: "2026-08-14", availability: "available", featured: true, tags: ["Worlds beyond", "Award-winning", "Thought-provoking"] },
  { id: "book-002", slug: "the-midnight-library", title: "The Midnight Library", author: "Matt Haig", category: "Fiction", subcategory: "Fantasy", description: "Between life and death lies a library where every book offers a chance to try another life. One reader wonders what makes a life worth living.", cover: "/books/midnight-garden.svg", edition: "Illustrated placeholder edition", language: "English", isbn: "978-0-525-55948-1", year: 2020, addedAt: "2026-07-30", availability: "limited", featured: true, tags: ["Life choices", "Wonder", "Hopeful"] },
  { id: "book-003", slug: "and-then-there-were-none", title: "And Then There Were None", author: "Agatha Christie", category: "Fiction", subcategory: "Mystery & Thriller", description: "Ten strangers arrive on an island. A voice from the past reveals what brought them there, and the guests begin to disappear one by one.", cover: "/books/island-mystery.svg", edition: "Classic collection edition", language: "English", isbn: "978-0-06-207348-8", year: 1939, addedAt: "2026-06-10", availability: "available", featured: true, tags: ["Classic mystery", "Atmospheric", "Page-turner"] },
  { id: "book-004", slug: "man-search-for-meaning", title: "Man's Search for Meaning", author: "Viktor E. Frankl", category: "Psychology", subcategory: "Meaning & Resilience", description: "A psychiatrist reflects on finding meaning amid unimaginable hardship, and on the human capacity to choose a response to circumstance.", cover: "/books/quiet-mountain.svg", edition: "Reader's edition", language: "English", isbn: "978-0-8070-1427-1", year: 1946, addedAt: "2026-04-19", availability: "available", featured: true, tags: ["Resilience", "Purpose", "Classic"] },
  { id: "book-005", slug: "meditations", title: "Meditations", author: "Marcus Aurelius", category: "Philosophy", subcategory: "Stoicism", description: "Private notes from a Roman emperor on character, attention and meeting the world with steadiness. A timeless companion for reflective days.", cover: "/books/olive-studies.svg", edition: "Modern translation", language: "English", isbn: "978-0-14-044933-4", year: 180, addedAt: "2026-09-25", availability: "limited", featured: false, tags: ["Ancient wisdom", "Reflection", "Stoicism"] },
  { id: "book-006", slug: "a-short-history-of-nearly-everything", title: "A Short History of Nearly Everything", author: "Bill Bryson", category: "History", subcategory: "Science & Discovery", description: "An inviting journey across the history of scientific discovery, from the smallest building blocks to the vastness of the cosmos.", cover: "/books/cosmic-atlas.svg", edition: "Revised edition", language: "English", isbn: "978-0-7679-0818-4", year: 2003, addedAt: "2026-05-24", availability: "available", featured: false, tags: ["Big questions", "Science", "Curiosity"] },
  { id: "book-007", slug: "educated", title: "Educated", author: "Tara Westover", category: "Biography", subcategory: "Memoir", description: "A daughter raised far from conventional schooling finds her way to education, and learns to understand her family and herself anew.", cover: "/books/field-notes.svg", edition: "Paperback edition", language: "English", isbn: "978-0-399-59050-4", year: 2018, addedAt: "2026-09-12", availability: "unavailable", featured: false, tags: ["Memoir", "Self-discovery", "Determination"] },
  { id: "book-008", slug: "the-art-of-stillness", title: "The Art of Stillness", author: "Pico Iyer", category: "Self Development", subcategory: "Mindfulness", description: "A thoughtful invitation to step back from the rush and rediscover the clarity that can come from doing nothing at all.", cover: "/books/quiet-mountain.svg", edition: "Compact edition", language: "English", isbn: "978-1-59463-401-5", year: 2014, addedAt: "2026-07-16", availability: "available", featured: false, tags: ["Mindfulness", "Slow living", "Perspective"] },
  { id: "book-009", slug: "the-art-of-happiness", title: "The Art of Happiness", author: "The Dalai Lama & Howard C. Cutler", category: "Spirituality", subcategory: "Wellbeing", description: "A conversation about compassion, perspective and the everyday practice of creating a more contented life.", cover: "/books/olive-studies.svg", edition: "Reader's edition", language: "English", isbn: "978-1-57062-344-9", year: 1998, addedAt: "2026-05-10", availability: "available", featured: false, tags: ["Compassion", "Wellbeing", "Conversation"] },
  { id: "book-010", slug: "the-alchemist", title: "The Alchemist", author: "Paulo Coelho", category: "Fiction", subcategory: "Adventure", description: "A shepherd sets out across the desert in search of treasure, discovering along the way how to listen for the shape of his own story.", cover: "/books/desert-star.svg", edition: "Anniversary edition", language: "English", isbn: "978-0-06-231500-7", year: 1988, addedAt: "2026-04-03", availability: "limited", featured: false, tags: ["Journey", "Dreams", "Fable"] },
  { id: "book-011", slug: "the-book-of-joy", title: "The Book of Joy", author: "The Dalai Lama & Desmond Tutu", category: "Religion", subcategory: "Interfaith & Reflection", description: "Two spiritual leaders share candid stories and practical wisdom about finding joy in a world that can be difficult.", cover: "/books/olive-studies.svg", edition: "Illustrated edition", language: "English", isbn: "978-0-399-18404-1", year: 2016, addedAt: "2026-06-28", availability: "available", featured: false, tags: ["Joy", "Wisdom", "Conversation"] },
  { id: "book-012", slug: "kindred", title: "Kindred", author: "Octavia E. Butler", category: "Fiction", subcategory: "Speculative Fiction", description: "A young Black woman is pulled between her present-day home and an antebellum plantation, forced to confront the past in an intimate, unsettling story.", cover: "/books/moonlit-orbit.svg", edition: "Modern classics edition", language: "English", isbn: "978-0-8070-8369-7", year: 1979, addedAt: "2026-08-29", availability: "available", featured: false, tags: ["Time travel", "History", "Essential reading"] },
  { id: "book-013", slug: "pride-and-prejudice", title: "Pride and Prejudice", author: "Jane Austen", category: "Fiction", subcategory: "Romance", description: "Elizabeth Bennet navigates family expectations, first impressions and the possibility of love in Jane Austen's sharply observed comedy of manners.", cover: "/books/midnight-garden.svg", edition: "Penguin Classics paperback", language: "English", isbn: "978-0-14-143951-8", year: 1813, addedAt: "2026-03-12", availability: "available", featured: false, tags: ["Classic", "Romance", "Family"] },
  { id: "book-014", slug: "jane-eyre", title: "Jane Eyre", author: "Charlotte Brontë", category: "Fiction", subcategory: "Romance", description: "An orphaned governess tells the story of her search for independence, belonging and a love that does not ask her to surrender herself.", cover: "/books/field-notes.svg", edition: "Oxford World's Classics", language: "English", isbn: "978-0-19-953559-0", year: 1847, addedAt: "2026-02-18", availability: "limited", featured: false, tags: ["Classic", "Romance", "Coming of age"] },
  { id: "book-015", slug: "dune", title: "Dune", author: "Frank Herbert", category: "Fiction", subcategory: "Science Fiction", description: "On the desert planet Arrakis, Paul Atreides is drawn into a struggle over power, prophecy and the precious resource that shapes an empire.", cover: "/books/cosmic-atlas.svg", edition: "Ace mass market edition", language: "English", isbn: "978-0-441-17271-9", year: 1965, addedAt: "2026-09-30", availability: "available", featured: true, tags: ["Desert worlds", "Politics", "Epic"] },
  { id: "book-016", slug: "the-hobbit", title: "The Hobbit", author: "J. R. R. Tolkien", category: "Fiction", subcategory: "Fantasy", description: "A comfort-loving hobbit joins a band of dwarves on a winding journey toward a mountain, a dragon and an unexpected sense of courage.", cover: "/books/desert-star.svg", edition: "Illustrated paperback", language: "English", isbn: "978-0-547-92822-7", year: 1937, addedAt: "2026-09-21", availability: "limited", featured: false, tags: ["Adventure", "Dragons", "Classic fantasy"] },
  { id: "book-017", slug: "the-silent-patient", title: "The Silent Patient", author: "Alex Michaelides", category: "Fiction", subcategory: "Mystery & Thriller", description: "A psychotherapist becomes fascinated by a painter who has stopped speaking after a violent event, and by the truth behind her silence.", cover: "/books/island-mystery.svg", edition: "Celadon Books paperback", language: "English", isbn: "978-1-250-30169-7", year: 2019, addedAt: "2026-09-05", availability: "available", featured: false, tags: ["Psychological suspense", "Secrets", "Twist"] },
  { id: "book-018", slug: "thinking-fast-and-slow", title: "Thinking, Fast and Slow", author: "Daniel Kahneman", category: "Psychology", subcategory: "Cognitive Psychology", description: "Daniel Kahneman explores two modes of thought and the shortcuts, biases and judgments that shape how people make decisions.", cover: "/books/olive-studies.svg", edition: "Farrar, Straus and Giroux paperback", language: "English", isbn: "978-0-374-53355-7", year: 2011, addedAt: "2026-08-23", availability: "limited", featured: false, tags: ["Decision making", "Cognition", "Behavior"] },
  { id: "book-019", slug: "the-republic", title: "The Republic", author: "Plato", category: "Philosophy", subcategory: "Political Philosophy", description: "In a series of dialogues, Socrates and his companions consider justice, education and what a well-ordered society might be.", cover: "/books/quiet-mountain.svg", edition: "Penguin Classics translation", language: "English", isbn: "978-0-14-045511-3", year: -380, addedAt: "2026-08-02", availability: "available", featured: false, tags: ["Justice", "Ancient philosophy", "Society"] },
  { id: "book-020", slug: "the-prophet", title: "The Prophet", author: "Kahlil Gibran", category: "Religion", subcategory: "Spirituality & Poetry", description: "A poetic collection of reflections on love, work, friendship and other passages of ordinary human life.", cover: "/books/olive-studies.svg", edition: "Knopf paperback", language: "English", isbn: "978-0-394-40428-8", year: 1923, addedAt: "2026-07-27", availability: "available", featured: false, tags: ["Poetry", "Reflection", "Wisdom"] },
  { id: "book-021", slug: "atomic-habits", title: "Atomic Habits", author: "James Clear", category: "Self Development", subcategory: "Habits & Behavior", description: "A practical guide to building useful routines by focusing on small, repeatable changes and the systems that support them.", cover: "/books/field-notes.svg", edition: "Avery paperback", language: "English", isbn: "978-0-7352-1129-2", year: 2018, addedAt: "2026-10-02", availability: "available", featured: true, tags: ["Habits", "Personal growth", "Practical"] },
  { id: "book-022", slug: "born-a-crime", title: "Born a Crime", author: "Trevor Noah", category: "Biography", subcategory: "Memoir", description: "Trevor Noah recounts growing up in South Africa during and after apartheid, with stories of family, identity and resilience.", cover: "/books/field-notes.svg", edition: "Spiegel & Grau paperback", language: "English", isbn: "978-0-399-58819-8", year: 2016, addedAt: "2026-06-16", availability: "limited", featured: false, tags: ["Memoir", "Family", "South Africa"] },
  { id: "book-023", slug: "a-brief-history-of-time", title: "A Brief History of Time", author: "Stephen Hawking", category: "Science", subcategory: "Physics & Cosmology", description: "Stephen Hawking introduces readers to questions about the universe, from the nature of time to black holes and the origins of the cosmos.", cover: "/books/cosmic-atlas.svg", edition: "Updated and expanded edition", language: "English", isbn: "978-0-553-38016-3", year: 1988, addedAt: "2026-05-28", availability: "available", featured: false, tags: ["Cosmology", "Space", "Big questions"] },
  { id: "book-024", slug: "cosmos", title: "Cosmos", author: "Carl Sagan", category: "Science", subcategory: "Astronomy", description: "Carl Sagan connects astronomy, history and human curiosity in an invitation to see our place within a vast universe.", cover: "/books/cosmic-atlas.svg", edition: "Reissue edition", language: "English", isbn: "978-0-345-53943-4", year: 1980, addedAt: "2026-05-04", availability: "unavailable", featured: false, tags: ["Astronomy", "Science history", "Wonder"] },
  { id: "book-025", slug: "the-great-gatsby", title: "The Great Gatsby", author: "F. Scott Fitzgerald", category: "Fiction", subcategory: "Literary Fiction", description: "Nick Carraway looks back on a summer among the wealthy of Long Island and the elusive dream pursued by his neighbor Jay Gatsby.", cover: "/books/island-mystery.svg", edition: "Scribner paperback", language: "English", isbn: "978-0-7432-7356-5", year: 1925, addedAt: "2026-04-26", availability: "available", featured: false, tags: ["American classic", "Ambition", "Love"] },
  { id: "book-026", slug: "rebecca", title: "Rebecca", author: "Daphne du Maurier", category: "Fiction", subcategory: "Mystery & Thriller", description: "A young bride arrives at Manderley and finds herself living in the shadow of her husband's first wife and the house's watchful past.", cover: "/books/midnight-garden.svg", edition: "Virago Modern Classics", language: "English", isbn: "978-0-385-03040-7", year: 1938, addedAt: "2026-04-10", availability: "limited", featured: false, tags: ["Gothic", "Suspense", "Classic"] },
  { id: "book-027", slug: "little-women", title: "Little Women", author: "Louisa May Alcott", category: "Fiction", subcategory: "Coming of Age", description: "The four March sisters grow up together through changing fortunes, discovering distinct paths toward work, family and independence.", cover: "/books/field-notes.svg", edition: "Puffin Classics paperback", language: "English", isbn: "978-0-14-751401-1", year: 1868, addedAt: "2026-03-22", availability: "available", featured: false, tags: ["Family", "Coming of age", "Classic"] },
  { id: "book-028", slug: "when-breath-becomes-air", title: "When Breath Becomes Air", author: "Paul Kalanithi", category: "Biography", subcategory: "Memoir", description: "Neurosurgeon Paul Kalanithi reflects on illness, work and meaning after receiving a life-changing diagnosis at the beginning of his career.", cover: "/books/quiet-mountain.svg", edition: "Random House paperback", language: "English", isbn: "978-0-8129-8840-6", year: 2016, addedAt: "2026-02-06", availability: "available", featured: false, tags: ["Memoir", "Medicine", "Meaning"] },
];

const categoryAliases: Record<string, string[]> = {
  novels: ["fiction"],
  "sci-fi": ["science fiction"],
  science: ["science & discovery"],
};

export function getBookBySlug(slug: string): Book | undefined {
  return books.find((book) => book.slug === slug);
}

export function getBooksByCategory(categoryName: string): Book[] {
  return books.filter((book) => bookMatchesCategory(book, categoryName));
}

export function bookMatchesCategory(book: Book, categoryName: string): boolean {
  const normalizedName = categoryName.toLowerCase();
  const names = [normalizedName, ...(categoryAliases[normalizedName] ?? [])];
  return names.includes(book.category.toLowerCase()) || names.includes(book.subcategory.toLowerCase());
}

export function getFeaturedBooks(): Book[] {
  return books.filter((book) => book.featured);
}

export function getAvailableBooks(): Book[] {
  return books.filter((book) => book.availability === "available");
}

export function getRecentBooks(limit = 4): Book[] {
  return [...books].sort((first, second) => second.addedAt.localeCompare(first.addedAt)).slice(0, limit);
}

export function searchBooks(bookList: Book[], query: string, availability: Availability | "all" = "all"): Book[] {
  const normalizedQuery = query.trim().toLowerCase();
  return bookList.filter((book) => {
    const matchesAvailability = availability === "all" || book.availability === availability;
    const searchableText = `${book.title} ${book.author} ${book.category} ${book.subcategory} ${book.tags.join(" ")} ${book.isbn ?? ""}`.toLowerCase();
    return matchesAvailability && searchableText.includes(normalizedQuery);
  });
}