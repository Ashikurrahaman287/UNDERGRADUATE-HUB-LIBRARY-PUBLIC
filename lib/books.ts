import "server-only";

import type { Category } from "@/data/categories";
import type { Book } from "@/data/books";
import type { BookRow, CategoryRow } from "@/lib/database.types";
import { createAdminSupabaseClient, createPublicSupabaseClient } from "@/lib/supabase/server";

const BOOK_WITH_CATEGORY = "id, slug, title, author, category_id, subcategory, description, cover_path, cover_image_url, edition, language, isbn, publication_year, availability, featured, tags, added_at, updated_at, is_active, category:categories!books_category_id_fkey(name)";

type JoinedBookRow = BookRow & { category: Pick<CategoryRow, "name"> | null };
type CoverStorageClient = Pick<ReturnType<typeof createAdminSupabaseClient>, "storage">;

function resolveCoverUrl(row: JoinedBookRow, client: CoverStorageClient): string | null {
  const storedCover = row.cover_path?.trim() || row.cover_image_url?.trim();
  if (!storedCover) return null;

  let objectPath = storedCover;
  if (/^https?:\/\//i.test(storedCover)) {
    try {
      const storedUrl = new URL(storedCover);
      const publicObject = storedUrl.pathname.match(/\/storage\/v1\/object\/public\/[^/]+\/(.+)$/);
      if (!publicObject) return storedCover;
      objectPath = decodeURIComponent(publicObject[1]);
    } catch {
      return storedCover;
    }
  }

  const pathSegments = objectPath.replace(/^\/+/, "").split("/");
  if (pathSegments.length > 2 && pathSegments[1] === "books") pathSegments.shift();
  objectPath = pathSegments.join("/");
  if (!objectPath) return null;
  return client.storage.from("book-covers").getPublicUrl(objectPath).data.publicUrl;
}

function mapBook(row: JoinedBookRow, client: CoverStorageClient): Book {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    author: row.author,
    category: row.category?.name ?? "",
    subcategory: row.subcategory ?? "",
    description: row.description,
    cover: resolveCoverUrl(row, client),
    edition: row.edition,
    language: row.language,
    isbn: row.isbn,
    year: row.publication_year,
    addedAt: row.added_at,
    updatedAt: row.updated_at,
    availability: row.availability,
    featured: row.featured,
    tags: row.tags,
    adminReviews: (row.reviews ?? []).map((review) => ({
      review_id: review.review_id,
      author_name: review.author_name,
      rating: review.rating,
      comment: review.comment,
      is_verified: review.is_verified,
    })),
    categoryId: row.category_id,
    isActive: row.is_active,
  };
}

function mapCategory(row: Pick<CategoryRow, "id" | "slug" | "name" | "description" | "is_active">): Category {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    introduction: row.description,
    isActive: row.is_active,
  };
}

function mapBookRows(rows: unknown, client: CoverStorageClient): Book[] {
  return (rows as JoinedBookRow[]).map((row) => mapBook(row, client));
}

export type AdminBookFilters = {
  query: string;
  categoryId: string;
  availability: string;
  featured: string;
  visibility: string;
  page: number;
  pageSize: number;
};

export async function getAdminBooksPage(filters: AdminBookFilters): Promise<{ books: Book[]; count: number; error: boolean }> {
  const client = createAdminSupabaseClient() as unknown as {
    storage: CoverStorageClient["storage"];
    from(table: "books"): {
      select(columns: string, options: { count: "exact" }): AdminBooksPageQuery;
    };
  };
  const queryText = filters.query.replace(/[^A-Za-z0-9@._ +\-]/g, "").trim().slice(0, 80);
  let query = client.from("books").select(BOOK_WITH_CATEGORY, { count: "exact" });
  if (queryText) query = query.or(`title.ilike.%${queryText}%,author.ilike.%${queryText}%`);
  if (filters.categoryId) query = query.eq("category_id", filters.categoryId);
  if (["available", "limited", "unavailable"].includes(filters.availability)) query = query.eq("availability", filters.availability);
  if (filters.featured === "true" || filters.featured === "false") query = query.eq("featured", filters.featured === "true");
  if (filters.visibility !== "all") query = query.eq("is_active", filters.visibility !== "archived");
  const start = (filters.page - 1) * filters.pageSize;
  const { data, error, count } = await query.order("updated_at", { ascending: false }).range(start, start + filters.pageSize - 1);
  return { books: error || !data ? [] : mapBookRows(data, client), count: error ? 0 : count ?? 0, error: Boolean(error) };
}

type AdminBooksPageQuery = {
  or(filters: string): AdminBooksPageQuery;
  eq(column: "category_id" | "availability" | "is_active" | "featured", value: string | boolean): AdminBooksPageQuery;
  order(column: "updated_at", options: { ascending: boolean }): {
    range(from: number, to: number): PromiseLike<{ data: unknown; error: { message: string } | null; count?: number | null }>;
  };
};

export async function getBooks(): Promise<Book[]> {
  const client = await createPublicSupabaseClient();
  const { data, error } = await client
    .from("books")
    .select(BOOK_WITH_CATEGORY)
    .eq("is_active", true)
    .order("featured", { ascending: false })
    .order("added_at", { ascending: false });
  if (error) throw new Error("The book collection is temporarily unavailable.");
  return mapBookRows(data, client);
}

export async function getAdminBooks(): Promise<Book[]> {
  const { data, error } = await createAdminSupabaseClient()
    .from("books")
    .select(BOOK_WITH_CATEGORY)
    .order("updated_at", { ascending: false });
  if (error) throw new Error("Unable to load books in the admin portal.");
  return mapBookRows(data, createAdminSupabaseClient());
}

export async function getBookBySlug(slug: string): Promise<Book | null> {
  const client = await createPublicSupabaseClient();
  const { data, error } = await client
    .from("books")
    .select(`${BOOK_WITH_CATEGORY}, reviews`)
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw new Error("The book details are temporarily unavailable.");
  return data ? mapBook(data as unknown as JoinedBookRow, client) : null;
}

export async function getAdminBookById(id: string): Promise<Book | null> {
  const { data, error } = await createAdminSupabaseClient()
    .from("books")
    .select(`${BOOK_WITH_CATEGORY}, reviews`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Unable to load this book in the admin portal.");
  return data ? mapBook(data as unknown as JoinedBookRow, createAdminSupabaseClient()) : null;
}

export async function getCategories(): Promise<Category[]> {
  const client = await createPublicSupabaseClient();
  const { data, error } = await client
    .from("categories")
    .select("id, slug, name, description, is_active")
    .eq("is_active", true)
    .order("name");
  if (error) throw new Error("The book categories are temporarily unavailable.");
  return data.map(mapCategory);
}

export async function getAdminCategories(): Promise<Category[]> {
  const { data, error } = await createAdminSupabaseClient()
    .from("categories")
    .select("id, slug, name, description, is_active")
    .order("name");
  if (error) throw new Error("Unable to load categories in the admin portal.");
  return data.map(mapCategory);
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  const client = await createPublicSupabaseClient();
  const { data, error } = await client
    .from("categories")
    .select("id, slug, name, description, is_active")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw new Error("The category is temporarily unavailable.");
  return data ? mapCategory(data) : null;
}

export async function getBooksByCategory(categoryName: string): Promise<Book[]> {
  const client = await createPublicSupabaseClient();
  const { data: category, error: categoryError } = await (client
    .from("categories")
    .select("id")
    .eq("name", categoryName)
    .eq("is_active", true)
    .maybeSingle() as unknown as PromiseLike<{ data: { id: string } | null; error: { message: string } | null }>);
  if (categoryError) throw new Error("The book category is temporarily unavailable.");
  if (!category) return [];

  const { data, error } = await client
    .from("books")
    .select(BOOK_WITH_CATEGORY)
    .eq("category_id", category.id)
    .eq("is_active", true)
    .order("featured", { ascending: false })
    .order("added_at", { ascending: false });
  if (error) throw new Error("The books in this category are temporarily unavailable.");
  return mapBookRows(data, client);
}

export async function getFeaturedBooks(): Promise<Book[]> {
  return (await getBooks()).filter((book) => book.featured);
}

export async function getAvailableBooks(): Promise<Book[]> {
  return (await getBooks()).filter((book) => book.availability === "available");
}

export async function getRecentBooks(limit = 4): Promise<Book[]> {
  return (await getBooks()).sort((first, second) => second.addedAt.localeCompare(first.addedAt)).slice(0, limit);
}
