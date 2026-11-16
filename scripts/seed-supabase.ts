import { createClient } from "@supabase/supabase-js";
import { books } from "../data/books";
import type { Database } from "../lib/database.types";

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running the catalogue import.");
  }

  const supabase = createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: categoryRows, error: categoryError } = await supabase.from("categories").select("id, name");
  if (categoryError || !categoryRows) throw new Error("Could not read seeded categories. Apply the Supabase migration first.");

  const categoryIds = new Map(categoryRows.map((category) => [category.name.toLowerCase(), category.id]));
  const importRows = books.map((book) => {
    const categoryId = categoryIds.get(book.category.toLowerCase());
    if (!categoryId) throw new Error(`No Supabase category exists for seed book category: ${book.category}`);

    return {
      slug: book.slug,
      title: book.title,
      author: book.author,
      category_id: categoryId,
      subcategory: book.subcategory || null,
      description: book.description,
      cover_path: null,
      edition: book.edition || null,
      language: book.language || null,
      isbn: book.isbn || null,
      publication_year: book.year,
      availability: book.availability,
      featured: book.featured,
      tags: book.tags,
      added_at: book.addedAt,
      updated_at: book.updatedAt ?? book.addedAt,
      is_active: true,
    };
  });

  const { data: existingRows, error: existingError } = await supabase
    .from("books")
    .select("slug")
    .in("slug", importRows.map((book) => book.slug));
  if (existingError || !existingRows) throw new Error("Could not check the existing catalogue before import.");

  const existingSlugs = new Set(existingRows.map((book) => book.slug));
  const newRows = importRows.filter((book) => !existingSlugs.has(book.slug));
  if (newRows.length === 0) {
    console.info("The sample catalogue is already present; no records were changed.");
    return;
  }

  const { error: importError } = await supabase.from("books").insert(newRows);
  if (importError) throw new Error("The local sample catalogue could not be imported.");
  console.info(`Imported ${newRows.length} sample books into Supabase without overwriting existing or archived records.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "The sample catalogue import failed.");
  process.exitCode = 1;
});
