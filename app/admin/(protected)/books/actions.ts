"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { BookRow } from "@/lib/database.types";
import { requireAdminSessionId } from "@/lib/admin/session";
import { validateActionFormData } from "@/lib/security/guards";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { hasSupportedImageSignature } from "@/lib/security/image-validation";

export type BookFormErrors = Partial<Record<"title" | "author" | "categoryId" | "description" | "availability" | "publicationYear" | "subcategory" | "tags" | "edition" | "language" | "isbn" | "reviews", string>>;
export type BookFormState = { error?: string; success?: string; fieldErrors?: BookFormErrors };

const allowedAvailability = new Set<BookRow["availability"]>(["available", "limited", "unavailable"]);
const maximumCoverBytes = 5 * 1024 * 1024;

type ParsedBookInput = {
  title: string;
  author: string;
  category_id: string;
  subcategory: string | null;
  description: string;
  edition: string | null;
  language: string | null;
  isbn: string | null;
  publication_year: number | null;
  availability: BookRow["availability"];
  featured: boolean;
  tags: string[];
  reviews: BookRow["reviews"];
  book_number: string | null;
};

function formText(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value.trim() : "";
}

function parseAdminReviews(raw: string): BookRow["reviews"] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length > 100) return null;

  const ids = new Set<string>();
  const reviews: BookRow["reviews"] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const review = item as Record<string, unknown>;
    const reviewId = typeof review.review_id === "string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(review.review_id)
      ? review.review_id
      : randomUUID();
    const authorName = typeof review.author_name === "string" ? review.author_name.trim() : "";
    const comment = typeof review.comment === "string" ? review.comment.trim() : "";
    const rating = Number(review.rating);
    if (ids.has(reviewId) || authorName.length > 80 || !Number.isInteger(rating) || rating < 1 || rating > 5 || comment.length < 1 || comment.length > 2000) return null;
    ids.add(reviewId);
    reviews.push({
      review_id: reviewId,
      author_name: authorName || "Anonymous reader",
      rating,
      comment,
      is_verified: review.is_verified === true,
    });
  }
  return reviews;
}

function parseBookForm(formData: FormData): { value?: ParsedBookInput; fieldErrors?: BookFormErrors } {
  const fieldErrors: BookFormErrors = {};
  const title = formText(formData, "title");
  const author = formText(formData, "author");
  const categoryId = formText(formData, "categoryId");
  const description = formText(formData, "description");
  const subcategory = formText(formData, "subcategory");
  const edition = formText(formData, "edition");
  const language = formText(formData, "language");
  const isbn = formText(formData, "isbn");
  const tags = formText(formData, "tags").split(/[\n,]/).map((tag) => tag.trim()).filter(Boolean);
  const rawAvailability = formText(formData, "availability");
  const rawYear = formText(formData, "publicationYear");
  const bookNumber = formText(formData, "bookNumber");
  const year = rawYear ? Number(rawYear) : null;
  const rawReviews = formData.get("adminReviews");
  const reviews = rawReviews === null ? [] : typeof rawReviews === "string" ? parseAdminReviews(rawReviews) : null;

  if (!title) fieldErrors.title = "Title is required.";
  else if (title.length > 200) fieldErrors.title = "Title must be 200 characters or fewer.";
  if (!author) fieldErrors.author = "Author is required.";
  else if (author.length > 120) fieldErrors.author = "Author must be 120 characters or fewer.";
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(categoryId)) fieldErrors.categoryId = "Choose a valid category.";
  if (!description) fieldErrors.description = "Description is required.";
  else if (description.length > 10000) fieldErrors.description = "Description must be 10,000 characters or fewer.";
  if (subcategory.length > 120) fieldErrors.subcategory = "Subcategory must be 120 characters or fewer.";
  if (edition.length > 80) fieldErrors.edition = "Edition must be 80 characters or fewer.";
  if (language.length > 60) fieldErrors.language = "Language must be 60 characters or fewer.";
  if (isbn.length > 32) fieldErrors.isbn = "ISBN must be 32 characters or fewer.";
  if (tags.length > 20 || tags.some((tag) => tag.length > 64)) fieldErrors.tags = "Use at most 20 tags, each 64 characters or fewer.";
  if (!allowedAvailability.has(rawAvailability as BookRow["availability"])) fieldErrors.availability = "Choose an availability status.";
  if (rawYear && (!Number.isInteger(year) || year === null || year < -3000 || year > 2200)) fieldErrors.publicationYear = "Enter a valid publication year.";
  if (bookNumber && !/^UH-BOOK-\d+$/.test(bookNumber)) fieldErrors.publicationYear = "The generated book number is invalid.";
  if (!reviews) fieldErrors.reviews = "Check each custom review; ratings must be 1–5 and comments must be 1–2,000 characters.";

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };
  if (reviews === null) return { fieldErrors: { reviews: "Check each custom review; ratings must be 1–5 and comments must be 1–2,000 characters." } };

  return {
    value: {
      title,
      author,
      category_id: categoryId,
      subcategory: subcategory || null,
      description,
      edition: edition || null,
      language: language || null,
      isbn: isbn || null,
      publication_year: year,
      availability: rawAvailability as BookRow["availability"],
      featured: formData.get("featured") === "on",
      tags,
      reviews,
      book_number: bookNumber || null,
    },
  };
}

function slugifyTitle(title: string): string {
  const slug = title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "untitled-book";
}

async function uniqueSlug(title: string): Promise<string> {
  const client = createAdminSupabaseClient();
  const base = slugifyTitle(title);
  for (let suffix = 1; suffix <= 20; suffix += 1) {
    const candidate = suffix === 1 ? base : `${base}-${suffix}`;
    const { data, error } = await client.from("books").select("id").eq("slug", candidate).maybeSingle();
    if (error) throw new Error("Unable to check book URL availability.");
    if (!data) return candidate;
  }
  return `${base}-${randomUUID().slice(0, 8)}`;
}

async function uploadCover(formData: FormData): Promise<{ path?: string; error?: string }> {
  const entry = formData.get("cover");
  if (!(entry instanceof File) || entry.size === 0) return {};
  if (entry.size > maximumCoverBytes) return { error: "Choose an image smaller than 5 MB." };
  if (entry.type !== "image/jpeg" && entry.type !== "image/png") return { error: "Choose a JPG or PNG image." };

  const extension = entry.name.split(".").pop()?.toLowerCase();
  const validExtensions: Record<string, string[]> = {
    "image/jpeg": ["jpg", "jpeg"],
    "image/png": ["png"],
  };
  if (!extension || !validExtensions[entry.type]?.includes(extension)) {
    return { error: "The file extension must match its image type." };
  }

  const bytes = new Uint8Array(await entry.arrayBuffer());
  if (!hasSupportedImageSignature(bytes, entry.type)) return { error: "The selected file is not a valid image of that type." };
  const storedExtension = entry.type === "image/jpeg" ? "jpg" : extension;
  const path = `books/${randomUUID()}.${storedExtension}`;
  const client = createAdminSupabaseClient();
  const { error } = await client.storage.from("book-covers").upload(path, entry, { contentType: entry.type, cacheControl: "3600", upsert: false });
  if (error) return { error: "The cover could not be uploaded. Try again with another image." };
  return { path };
}

async function removeUploadedCover(path: string | undefined): Promise<void> {
  if (!path) return;
  try {
    await createAdminSupabaseClient().storage.from("book-covers").remove([path]);
  } catch {
    return;
  }
}

async function getCategoryName(categoryId: string): Promise<string | null> {
  const { data, error } = await createAdminSupabaseClient().from("categories").select("name").eq("id", categoryId).maybeSingle();
  return error || !data ? null : data.name;
}

export async function createBookAction(_previousState: BookFormState, formData: FormData): Promise<BookFormState> {
  validateActionFormData(formData);
  await requireAdminSessionId();
  const parsed = parseBookForm(formData);
  if (!parsed.value) return { fieldErrors: parsed.fieldErrors };
  let categoryName: string | null;
  try {
    categoryName = await getCategoryName(parsed.value.category_id);
  } catch {
    return { error: "Book categories are currently unavailable. Try again shortly." };
  }
  if (!categoryName) return { fieldErrors: { categoryId: "Choose a valid category." } };

  let uploadedCover: { path?: string; error?: string };
  try {
    uploadedCover = await uploadCover(formData);
  } catch {
    return { error: "Cover storage is unavailable. Try again shortly." };
  }
  if (uploadedCover.error) return { error: uploadedCover.error };

  const client = createAdminSupabaseClient();
  let savedSlug: string | null = null;
  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const slug = await uniqueSlug(parsed.value.title);
      const { error } = await client.from("books").insert({ ...parsed.value, slug, cover_path: uploadedCover.path ?? null });
      if (!error) {
        savedSlug = slug;
        break;
      }
      if (error.code !== "23505") {
        console.error("Admin book insert failed.", { code: error.code });
        await removeUploadedCover(uploadedCover.path);
        if (error.code === "PGRST204" || error.code === "42703") {
          return { error: "The catalogue database schema is out of date. Apply the pending Supabase migrations, including 202611120003_book_numbering.sql, then try again." };
        }
        return { error: "The book could not be added. Check the details and try again." };
      }
    }
  } catch {
    await removeUploadedCover(uploadedCover.path);
    return { error: "The book could not be added because the library database is unavailable." };
  }
  if (!savedSlug) {
    await removeUploadedCover(uploadedCover.path);
    return { error: "A unique book URL could not be created. Try again." };
  }

  revalidatePath("/");
  revalidatePath("/books");
  revalidatePath("/categories");
  redirect("/ashik-loves-jannat/books?created=1");
}

export async function updateBookAction(bookId: string, _previousState: BookFormState, formData: FormData): Promise<BookFormState> {
  validateActionFormData(formData);
  await requireAdminSessionId();
  const parsed = parseBookForm(formData);
  if (!parsed.value) return { fieldErrors: parsed.fieldErrors };
  let categoryName: string | null;
  try {
    categoryName = await getCategoryName(parsed.value.category_id);
  } catch {
    return { error: "Book categories are currently unavailable. Try again shortly." };
  }
  if (!categoryName) return { fieldErrors: { categoryId: "Choose a valid category." } };

  let uploadedCover: { path?: string; error?: string };
  try {
    uploadedCover = await uploadCover(formData);
  } catch {
    return { error: "Cover storage is unavailable. Try again shortly." };
  }
  if (uploadedCover.error) return { error: uploadedCover.error };
  const client = createAdminSupabaseClient();
  const { data: existingBook, error: lookupError } = await client.from("books").select("slug, cover_path, availability").eq("id", bookId).maybeSingle();
  if (lookupError || !existingBook) {
    await removeUploadedCover(uploadedCover.path);
    return { error: "The book could not be loaded for editing. Refresh and try again." };
  }

  const [{ data: activeRental, error: activeRentalError }, { data: pendingRental, error: pendingRentalError }, { data: pendingRequest, error: pendingRequestError }] = await Promise.all([
    client.from("rentals").select("id").eq("book_id", bookId).in("status", ["active", "overdue"]).limit(1).maybeSingle(),
    client.from("rentals").select("id").eq("book_id", bookId).eq("status", "pending").limit(1).maybeSingle(),
    client.from("rental_requests").select("id").eq("book_id", bookId).eq("status", "pending").limit(1).maybeSingle(),
  ]);
  if (activeRentalError || pendingRentalError || pendingRequestError) {
    await removeUploadedCover(uploadedCover.path);
    return { error: "Rental state could not be checked. Book availability was not changed." };
  }

  const availability = activeRental
    ? "unavailable"
    : pendingRental || pendingRequest
      ? existingBook.availability
      : parsed.value.availability;
  const update = uploadedCover.path
    ? { ...parsed.value, availability, cover_path: uploadedCover.path }
    : { ...parsed.value, availability };
  try {
    const { data, error } = await client.from("books").update(update).eq("id", bookId).select("id").maybeSingle();
    if (error || !data) {
      await removeUploadedCover(uploadedCover.path);
      return { error: "The book could not be updated. Check the details and try again." };
    }
  } catch {
    await removeUploadedCover(uploadedCover.path);
    return { error: "The book could not be updated because the library database is unavailable." };
  }

  if (uploadedCover.path && existingBook.cover_path?.startsWith("books/")) {
    await removeUploadedCover(existingBook.cover_path);
  }
  revalidatePath("/");
  revalidatePath("/books");
  revalidatePath(`/books/${existingBook.slug}`);
  revalidatePath("/books/[slug]", "page");
  redirect("/ashik-loves-jannat/books?updated=1");
}

export async function archiveBookAction(_previousState: BookFormState, formData: FormData): Promise<BookFormState> {
  validateActionFormData(formData);
  await requireAdminSessionId();
  const id = formText(formData, "id");
  try {
    const client = createAdminSupabaseClient();
    const [{ data: activeRental, error: activeRentalError }, { data: pendingRental, error: pendingRentalError }, { data: pendingRequest, error: pendingRequestError }, { data: openReservation, error: reservationError }] = await Promise.all([
      client.from("rentals").select("id").eq("book_id", id).in("status", ["active", "overdue"]).limit(1).maybeSingle(),
      client.from("rentals").select("id").eq("book_id", id).eq("status", "pending").limit(1).maybeSingle(),
      client.from("rental_requests").select("id").eq("book_id", id).eq("status", "pending").limit(1).maybeSingle(),
      client.from("reservation_requests").select("id").eq("book_id", id).in("status", ["waiting", "notified"]).limit(1).maybeSingle(),
    ]);
    if (activeRentalError || pendingRentalError || pendingRequestError || reservationError) return { error: "Rental and reservation state could not be checked. The book was not archived." };
    if (activeRental || pendingRental || pendingRequest || openReservation) return { error: "This book has an active rental or open request/reservation. Resolve that activity before archiving it." };

    const { data, error } = await client.from("books").update({ is_active: false }).eq("id", id).select("id").maybeSingle();
    if (error || !data) return { error: "The book could not be archived. Refresh and try again." };
  } catch {
    return { error: "The book could not be archived because the library database is unavailable." };
  }
  revalidatePath("/");
  revalidatePath("/books");
  revalidatePath("/admin");
  revalidatePath("/admin/books");
  return { success: "Book archived." };
}
