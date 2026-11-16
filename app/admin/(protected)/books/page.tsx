import type { Metadata } from "next";
import Link from "next/link";
import { AdminBooksTable } from "@/components/admin/admin-books-table";
import { requireAdminSession } from "@/lib/admin/session";
import { getAdminBooksPage, getAdminCategories } from "@/lib/books";

type AdminBooksPageProps = { searchParams: Promise<{ created?: string; updated?: string; q?: string; categoryId?: string; availability?: string; featured?: string; visibility?: string; page?: string }> };

export const metadata: Metadata = { title: "Books" };
export const dynamic = "force-dynamic";

export default async function AdminBooksPage({ searchParams }: AdminBooksPageProps) {
  await requireAdminSession();
  const params = await searchParams;
  const { created, updated } = params;
  const filters = {
    query: params.q ?? "",
    categoryId: /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(params.categoryId ?? "") ? params.categoryId ?? "" : "",
    availability: ["available", "limited", "unavailable"].includes(params.availability ?? "") ? params.availability ?? "all" : "all",
    featured: ["true", "false"].includes(params.featured ?? "") ? params.featured ?? "all" : "all",
    visibility: ["active", "archived", "all"].includes(params.visibility ?? "") ? params.visibility ?? "active" : "active",
  };
  const parsedPage = Number(params.page ?? "1");
  const currentPage = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const pageSize = 30;
  const [bookPage, categories] = await Promise.all([
    getAdminBooksPage({ ...filters, page: currentPage, pageSize }),
    getAdminCategories(),
  ]);

  return (
    <main className="admin-page">
      <header className="admin-page-header">
        <div><p className="eyebrow">Catalogue management</p><h1 className="display-font">Books</h1></div>
        <Link className="button-primary" href="/ashik-loves-jannat/books/new">+ Add Book</Link>
      </header>
      {created ? <p className="admin-flash-success" role="status">Book added successfully.</p> : null}
      {updated ? <p className="admin-flash-success" role="status">Book changes saved.</p> : null}
      {bookPage.error ? <p className="admin-form-error" role="alert">Books could not be loaded. Refresh to try again.</p> : null}
      <AdminBooksTable books={bookPage.books} categories={categories} currentPage={currentPage} filters={filters} pageSize={pageSize} totalRecords={bookPage.count} />
    </main>
  );
}
