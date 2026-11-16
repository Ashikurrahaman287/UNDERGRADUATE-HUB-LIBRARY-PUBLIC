import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookForm } from "@/components/admin/book-form";
import { updateBookAction } from "@/app/admin/(protected)/books/actions";
import { requireAdminSession } from "@/lib/admin/session";
import { getAdminBookById, getAdminCategories } from "@/lib/books";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

type EditBookPageProps = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: "Edit Book" };
export const dynamic = "force-dynamic";

export default async function EditBookPage({ params }: EditBookPageProps) {
  await requireAdminSession();
  const { id } = await params;
  const [book, categories] = await Promise.all([getAdminBookById(id), getAdminCategories()]);
  if (!book) notFound();

  const client = createAdminSupabaseClient();
  const [{ data: issuedRental, error: issuedError }, { data: pendingRental, error: pendingRentalError }, { data: pendingRequest, error: pendingRequestError }] = await Promise.all([
    client.from("rentals").select("id").eq("book_id", id).in("status", ["active", "overdue"]).limit(1).maybeSingle(),
    client.from("rentals").select("id").eq("book_id", id).eq("status", "pending").limit(1).maybeSingle(),
    client.from("rental_requests").select("id").eq("book_id", id).eq("status", "pending").limit(1).maybeSingle(),
  ]);
  const availabilityLocked = Boolean(issuedRental || pendingRental || pendingRequest);
  const lockedAvailability = issuedRental ? "unavailable" : book.availability;

  return (
    <main className="admin-page">
      <header className="admin-page-header"><div><p className="eyebrow">Catalogue</p><h1 className="display-font">Edit Book</h1></div></header>
      {issuedError || pendingRentalError || pendingRequestError ? <p className="admin-form-error" role="alert">Rental state could not be checked. Availability will be protected when you save.</p> : null}
      <BookForm action={updateBookAction.bind(null, book.id)} availabilityLocked={availabilityLocked || Boolean(issuedError || pendingRentalError || pendingRequestError)} book={book} categories={categories} lockedAvailability={lockedAvailability} mode="edit" />
    </main>
  );
}
