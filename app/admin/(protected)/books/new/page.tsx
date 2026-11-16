import type { Metadata } from "next";
import { BookForm } from "@/components/admin/book-form";
import { createBookAction } from "@/app/admin/(protected)/books/actions";
import { getAdminCategories } from "@/lib/books";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Add Book" };
export const dynamic = "force-dynamic";

function getNextBookNumber(latest: string | null): string {
  const match = latest?.trim().match(/(\d+)$/);
  const current = match ? Number(match[1]) : 172;
  return `UH-BOOK-${current + 1}`;
}

export default async function AddBookPage() {
  const categories = await getAdminCategories();
  let latestBookNumber: string | null = null;
  try {
    const client = createAdminSupabaseClient();
    const { data } = await client
      .from("books")
      .select("book_number")
      .order("added_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    latestBookNumber = data?.book_number ?? null;
  } catch {
    latestBookNumber = null;
  }

  const nextBookNumber = getNextBookNumber(latestBookNumber);
  const defaultValues = {
    isbn: nextBookNumber,
    subcategory: nextBookNumber,
    edition: nextBookNumber,
    tags: nextBookNumber,
    publicationYear: "1111",
  };

  return (
    <main className="admin-page">
      <header className="admin-page-header"><div><p className="eyebrow">Catalogue</p><h1 className="display-font">Add Book</h1></div></header>
      <BookForm action={createBookAction} categories={categories} defaultBookNumber={nextBookNumber} defaultValues={defaultValues} mode="create" />
    </main>
  );
}
