import type { Metadata } from "next";
import Link from "next/link";
import { AdminSubmitButton } from "@/components/admin/admin-submit-button";
import { RentalDueDateExtension } from "@/components/admin/rental-due-date-extension";
import { handoverRentalAction, receiveRentalAction, sendRentalReminderAction } from "@/app/admin/(protected)/rentals/actions";
import { requireAdminSession } from "@/lib/admin/session";
import { isRentalDueSoon } from "@/lib/member/rental-reminders";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

type RentalRecord = {
  id: string;
  member_id: string;
  book_id: string;
  status: "pending" | "active" | "overdue" | "return_requested" | "returned" | "cancelled";
  started_at: string | null;
  subscription_ends_at: string | null;
  returned_at: string | null;
  return_requested_at: string | null;
  plan_name_snapshot: string | null;
  plan_price_snapshot: number | null;
  member: { full_name: string; phone: string; email: string | null } | null;
  book: { title: string } | null;
};
type ReturnReceipt = { rental_id: string; id: string; received_at: string; returned_early: boolean; carryover_days: number };

type QueryResult<T> = { data: T | null; error: { message: string } | null; count?: number | null };
type RentalQuery = {
  eq(column: "status", value: string): RentalQuery;
  order(column: "started_at", options: { ascending: boolean }): {
    range(from: number, to: number): PromiseLike<QueryResult<RentalRecord[]>>;
  };
};
type RentalQueryClient = {
  from(table: "rentals"): { select(columns: string, options: { count: "exact" }): RentalQuery };
};

export const metadata: Metadata = { title: "Issued Rentals", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const pageSize = 30;
const statuses = ["pending", "active", "overdue", "return_requested", "returned", "cancelled"] as const;

function formatDate(value: string | null): string {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleDateString("en-BD", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dhaka" });
}

function pageHref(page: number, status: string): string {
  const params = new URLSearchParams();
  if (status !== "all") params.set("status", status);
  params.set("page", String(page));
  return `/ashik-loves-jannat/rentals?${params.toString()}`;
}

export default async function AdminRentalsPage({ searchParams }: { searchParams?: Promise<{ status?: string; page?: string; handover?: string; receive?: string; reminder?: string; extension?: string; sms?: string }> }) {
  await requireAdminSession();
  const params = await searchParams;
  const status = statuses.includes(params?.status as (typeof statuses)[number]) ? params?.status as string : "all";
  const parsedPage = Number(params?.page ?? "1");
  const currentPage = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const client = createAdminSupabaseClient();
  let query = (client as unknown as RentalQueryClient).from("rentals").select(
    "id, member_id, book_id, status, started_at, subscription_ends_at, returned_at, return_requested_at, plan_name_snapshot, plan_price_snapshot, member:member_profiles!rentals_member_id_fkey(full_name, phone, email), book:books!rentals_book_id_fkey(title)",
    { count: "exact" },
  );
  if (status !== "all") query = query.eq("status", status);
  const start = (currentPage - 1) * pageSize;
  const { data: rentals, error, count } = await query.order("started_at", { ascending: false }).range(start, start + pageSize - 1);
  const rows = rentals ?? [];
  const returnedRentalIds = rows.filter((rental) => rental.status === "returned").map((rental) => rental.id);
  const { data: returnReceipts, error: returnReceiptError } = returnedRentalIds.length
    ? await (client.from("rental_return_receipts").select("rental_id, id, received_at, returned_early, carryover_days").in("rental_id", returnedRentalIds) as unknown as Promise<QueryResult<ReturnReceipt[]>>)
    : { data: [], error: null };
  const receiptsByRental = new Map((returnReceipts ?? []).map((receipt) => [receipt.rental_id, receipt]));
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / pageSize));

  return (
    <main className="admin-page">
      <header className="admin-page-header"><div><p className="eyebrow">Issued books and returns</p><h1 className="display-font">Rentals</h1></div><Link className="button-outline" href="/ashik-loves-jannat/fines">Fine ledger <span aria-hidden="true">→</span></Link></header>
      {params?.handover === "success" ? <p className="admin-flash-success" role="status">Book handed over. It is covered until the subscription period ends.</p> : null}
      {params?.handover === "error" ? <p className="admin-form-error" role="alert">The book could not be handed over. Refresh and verify the rental state.</p> : null}
      {params?.receive === "success" ? <p className="admin-flash-success" role="status">Book received. It is available in the public catalog.</p> : null}
      {params?.receive === "credit" ? <p className="admin-flash-success" role="status">Book received. The remaining subscription time is shared across the member’s rentals.</p> : null}
      {params?.receive === "error" ? <p className="admin-form-error" role="alert">The book could not be received. Refresh and verify the rental state.</p> : null}
      {params?.reminder === "sent" ? <p className="admin-flash-success" role="status">Reminder SMS accepted by the gateway.</p> : null}
      {params?.reminder === "failed" ? <p className="admin-form-error" role="alert">Reminder SMS could not be sent. Check the member phone and SMS gateway.</p> : null}
      {params?.reminder === "error" ? <p className="admin-form-error" role="alert">This rental is no longer eligible for a due-date reminder.</p> : null}
      {params?.extension === "success" ? <p className="admin-flash-success" role="status">Rental due date extended.</p> : null}
      {params?.extension === "error" ? <p className="admin-form-error" role="alert">The rental due date could not be extended.</p> : null}
      {params?.sms === "failed" ? <p className="admin-form-error" role="alert">The rental action succeeded, but the member SMS could not be sent. Check the member phone and SMS gateway.</p> : null}
      {returnReceiptError ? <p className="admin-form-error" role="alert">Return receipts could not be loaded.</p> : null}
      <form action="/ashik-loves-jannat/rentals" className="admin-book-filters" method="get"><label>Status<select defaultValue={status} name="status"><option value="all">All statuses</option>{statuses.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><button className="admin-action-button" type="submit">Filter</button></form>
      {error ? <p className="admin-form-error" role="alert">Rental records could not be loaded. Refresh to try again.</p> : null}
      <section className="admin-recent-panel">
        {rows.length ? <ul className="admin-recent-list">{rows.map((rental) => <li key={rental.id}>
          <div className="admin-rental-record"><strong>{rental.book?.title ?? "Book record unavailable"}</strong><span>{rental.member?.full_name ?? "Member record unavailable"} · {rental.member?.email ?? rental.member?.phone ?? "Contact unavailable"}</span>{rental.started_at ? <span>Handed over {formatDate(rental.started_at)}</span> : <span>Approved · awaiting book handover</span>}{rental.returned_at ? <span>Received {formatDate(rental.returned_at)}</span> : null}{receiptsByRental.has(rental.id) ? <span>Receipt {receiptsByRental.get(rental.id)?.id.slice(0, 8)} · {receiptsByRental.get(rental.id)?.returned_early ? `Returned early · ${receiptsByRental.get(rental.id)?.carryover_days} legacy carryover days` : "Cycle complete"}</span> : null}{rental.plan_name_snapshot ? <span>Covered by {rental.plan_name_snapshot} 30-day subscription</span> : null}</div>
          <div className="admin-rental-actions">
            <RentalDueDateExtension bookTitle={rental.book?.title ?? "Book record unavailable"} canExtend={(rental.status === "active" || rental.status === "overdue") && !rental.returned_at} currentDueDate={rental.subscription_ends_at} memberName={rental.member?.full_name ?? "Member record unavailable"} rentalId={rental.id} status={rental.status} />
            {rental.status === "pending" ? <form action={handoverRentalAction}><input name="rentalId" type="hidden" value={rental.id} /><AdminSubmitButton confirmMessage="Confirm that this book is being handed to the member?" pendingLabel="Handing over…">Handover Book</AdminSubmitButton></form> : null}
            {rental.status === "return_requested" ? <span className="admin-form-error">Member requested return {formatDate(rental.return_requested_at)}. Confirm physical receipt before completing.</span> : null}
            {rental.status === "active" || rental.status === "overdue" || rental.status === "return_requested" ? <form action={receiveRentalAction}><input name="rentalId" type="hidden" value={rental.id} /><AdminSubmitButton className="button-secondary" confirmMessage="Confirm that the library physically received this book?" pendingLabel="Receiving…">Receive Book</AdminSubmitButton></form> : null}
            {rental.status === "active" && !rental.returned_at && isRentalDueSoon(rental.subscription_ends_at) ? <form action={sendRentalReminderAction}><input name="rentalId" type="hidden" value={rental.id} /><AdminSubmitButton className="button-secondary" disabled={!rental.member?.phone || !rental.book?.title} pendingLabel="Sending…">Send Reminder SMS</AdminSubmitButton></form> : null}
          </div>
        </li>)}</ul> : !error ? <p className="admin-empty-note">No rental records match this filter.</p> : null}
      </section>
      <nav aria-label="Rental pages" className="admin-pagination"><span>Page {currentPage} of {totalPages} · {count ?? 0} records</span>{currentPage > 1 ? <Link className="admin-action-button" href={pageHref(currentPage - 1, status)}>Previous</Link> : null}{currentPage < totalPages ? <Link className="admin-action-button" href={pageHref(currentPage + 1, status)}>Next</Link> : null}</nav>
    </main>
  );
}
