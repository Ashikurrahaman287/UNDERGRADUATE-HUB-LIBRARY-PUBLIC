import type { Metadata } from "next";
import { requireAdminSession } from "@/lib/admin/session";
import { CategoryManagement } from "@/components/admin/category-management";
import { getAdminCategories } from "@/lib/books";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Categories" };
export const dynamic = "force-dynamic";

export default async function AdminCategoriesPage() {
  await requireAdminSession();
  const categories = await getAdminCategories();
  const client = createAdminSupabaseClient() as unknown as {
    from(table: "books"): {
      select(columns: "id", options: { count: "exact"; head: true }): {
        eq(column: "category_id", value: string): PromiseLike<{ count: number | null; error: { message: string } | null }>;
      };
    };
  };
  const categoryCounts = await Promise.all(categories.map(async (category) => {
    if (!category.id) return { name: category.name, count: null };
    const { count, error } = await client.from("books").select("id", { count: "exact", head: true }).eq("category_id", category.id);
    return { name: category.name, count: error ? null : count };
  }));
  const bookCounts = Object.fromEntries(categoryCounts.map((row) => [row.name, row.count ?? 0]));
  const countError = categoryCounts.some((row) => row.count === null);

  return (
    <main className="admin-page">
      <header className="admin-page-header"><div><p className="eyebrow">Catalogue structure</p><h1 className="display-font">Categories</h1></div></header>
      {countError ? <p className="admin-form-error" role="alert">Some category book counts are unavailable.</p> : null}
      <CategoryManagement bookCounts={bookCounts} categories={categories} />
    </main>
  );
}
