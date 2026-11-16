import type { Metadata } from "next";
import Link from "next/link";
import { BookCoverImage } from "@/components/books/book-cover-image";
import { RentalReturnForm } from "@/components/member/rental-return-form";
import { getAdminBooks } from "@/lib/books";
import { requireMemberSession } from "@/lib/member/session";

type QueryResult<T> = { data: T | null; error: { message: string } | null };
type MemberProfile = { id: string; membership_status: string };

async function safeQuery<T>(request: Promise<QueryResult<T>>): Promise<QueryResult<T>> {
  try {
    return await request;
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : "Query failed." } };
  }
}
type Rental = {
  id: string;
  book_id: string;
  status: "pending" | "active" | "overdue" | "return_requested" | "returned" | "cancelled";
  started_at: string | null;
  subscription_ends_at: string | null;
  returned_at: string | null;
  return_requested_at: string | null;
  plan_name_snapshot: string | null;
};
type Fine = { id: string; rental_id: string | null; amount_bdt: number; fine_date: string; reason: string; status: "outstanding" | "paid" | "waived" };
type ReturnReceipt = { id: string; rental_id: string; received_at: string; due_at: string; returned_early: boolean; carryover_days: number };
type Payment = { id: string; payment_type: string; status: string };

export const metadata: Metadata = { title: "My Rented Books", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

function date(value: string | null): string {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleDateString("en-BD", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dhaka" });
}

function daysRemaining(dueAt: string | null): number {
  if (!dueAt) return 0;
  return Math.max(0, Math.ceil((Date.parse(dueAt) - Date.now()) / 86_400_000));
}

function daysKept(startedAt: string | null, returnedAt: string | null): number {
  if (!startedAt || !returnedAt) return 0;
  return Math.max(0, Math.ceil((Date.parse(returnedAt) - Date.parse(startedAt)) / 86_400_000));
}

export default async function MyRentedBooksPage() {
  const session = await requireMemberSession("/member/dashboard/my-books");
  const client = session.supabase;
  const [{ data: profile, error: profileError }, books] = await Promise.all([
    safeQuery(client.from("member_profiles").select("id, membership_status").eq("user_id", session.user.id).maybeSingle() as unknown as Promise<QueryResult<MemberProfile>>),
    getAdminBooks(),
  ]);
  if (profileError || !profile) {
    return <main className="container member-page" id="main-content"><p className="member-form-message member-form-message-error" role="alert">Your rental history could not be loaded.</p></main>;
  }

  const [{ data: rentals, error: rentalError }, { data: fines, error: fineError }, { data: receipts, error: receiptError }, { data: payments, error: paymentError }] = await Promise.all([
    safeQuery(client.from("rentals").select("id, book_id, status, started_at, subscription_ends_at, returned_at, return_requested_at, plan_name_snapshot").eq("member_id", profile.id).order("started_at", { ascending: false }).limit(50) as unknown as Promise<QueryResult<Rental[]>>),
    safeQuery(client.from("fine_ledger").select("id, rental_id, amount_bdt, fine_date, reason, status").eq("member_id", profile.id).eq("status", "outstanding").order("fine_date", { ascending: true }) as unknown as Promise<QueryResult<Fine[]>>),
    safeQuery(client.from("rental_return_receipts").select("id, rental_id, received_at, due_at, returned_early, carryover_days").eq("member_id", profile.id).order("received_at", { ascending: false }).limit(50) as unknown as Promise<QueryResult<ReturnReceipt[]>>),
    safeQuery(client.from("payment_submissions").select("id, payment_type, status").eq("member_id", profile.id).eq("payment_type", "fine").eq("status", "pending").limit(1) as unknown as Promise<QueryResult<Payment[]>>),
  ]);

  const rentalRows = rentals ?? [];
  const outstandingFines = fines ?? [];
  const outstandingTotal = outstandingFines.reduce((total, fine) => total + Number(fine.amount_bdt), 0);
  const returnReceipts = new Map((receipts ?? []).map((receipt) => [receipt.rental_id, receipt]));
  const booksById = new Map(books.map((book) => [book.id, book]));
  const currentRentals = rentalRows.filter((rental) => ["pending", "active", "overdue", "return_requested"].includes(rental.status));
  const pastRentals = rentalRows.filter((rental) => rental.status === "returned");
  const finePaymentPending = Boolean(payments?.length);

  return (
    <main className="container member-page" id="main-content">
      <header className="member-page-heading"><p className="eyebrow">Member area</p><h1 className="display-font">My Rented Books</h1><p className="member-muted">Your handover dates, return requests, and completed rental receipts.</p></header>
      <nav aria-label="Member dashboard pages" className="member-dashboard-tabs">
        <Link aria-current="page" href="/member/dashboard/my-books">My Rented Books</Link>
        <Link href="/member/dashboard/payments">Payments &amp; Subscription</Link>
        <Link href="/member/dashboard">Dashboard</Link>
      </nav>
      {rentalError ? <p className="member-form-message member-form-message-error" role="alert">Your rental records could not be loaded. Confirm the rental lifecycle migrations are applied, then refresh.</p> : null}
      {fineError ? <p className="member-form-message member-form-message-error" role="alert">Your outstanding fine details could not be loaded.</p> : null}
      {receiptError ? <p className="member-form-message member-form-message-error" role="alert">Return receipts are unavailable. Confirm migration 202610100003_member_rental_history_fines_and_payments.sql is applied.</p> : null}
      {paymentError ? <p className="member-form-message member-form-message-error" role="alert">Pending fine-payment details could not be loaded.</p> : null}

      <section className="member-library-section" aria-labelledby="active-books-title">
        <div className="member-section-heading"><div><p className="eyebrow">Approved and on loan</p><h2 className="display-font" id="active-books-title">Approved / Currently Rented Books</h2></div><span className="member-count-badge">{currentRentals.length}</span></div>
        {currentRentals.length ? <div className="member-rental-grid">{currentRentals.map((rental) => {
          const book = booksById.get(rental.book_id);
          const receipt = returnReceipts.get(rental.id);
          return <article className="member-rental-card" key={rental.id}>
            <figure className="member-rental-cover"><BookCoverImage author={book?.author ?? "Library collection"} cover={book?.cover ?? null} sizes="(max-width: 640px) 100px, 128px" title={book?.title ?? "Book record unavailable"} /></figure>
            <div className="member-rental-info">
              <p className="eyebrow">{rental.plan_name_snapshot ?? "30-day rental"}</p>
              <h3>{book?.title ?? "Book record unavailable"}</h3>
              <dl className="member-rental-metrics">
                <div><dt>Date received</dt><dd>{rental.started_at ? date(rental.started_at) : "Awaiting handover"}</dd></div>
                <div><dt>Subscription days remaining</dt><dd>{rental.status === "pending" ? "Starts at handover" : rental.subscription_ends_at ? `${daysRemaining(rental.subscription_ends_at)} / 30` : "Not started"}</dd></div>
                <div><dt>Subscription end</dt><dd>{rental.status === "pending" ? "Set at handover" : date(rental.subscription_ends_at)}</dd></div>
              </dl>
              <p className="member-inline-status">Status: <span className={`member-status ${rental.status === "pending" || rental.status === "return_requested" ? "member-status-pending" : rental.status === "overdue" ? "member-status-attention" : "member-status-positive"}`}>{rental.status.replaceAll("_", " ")}</span></p>
              {receipt ? <p className="member-field-note">Return receipt recorded {new Date(receipt.received_at).toLocaleString("en-BD", { dateStyle: "medium", timeStyle: "short" })} · {receipt.carryover_days} subscription day{receipt.carryover_days === 1 ? "" : "s"} remained for other books.</p> : null}
              {rental.status === "pending" ? <p className="member-field-note">Your request is approved and waiting for library handover. The subscription end date does not change; handover must happen before it expires.</p> : rental.status === "return_requested" ? finePaymentPending && outstandingTotal > 0 ? <><p className="member-field-note">Your return was requested {date(rental.return_requested_at)}. The book remains on loan until staff receive it.</p><p className="member-field-note">Fine payment is awaiting verification. Check Payments &amp; Subscription for its review status.</p></> : finePaymentPending ? <p className="member-field-note">Your return was requested {date(rental.return_requested_at)}. The book remains on loan until staff receive it.</p> : <><p className="member-field-note">Your return was requested {date(rental.return_requested_at)}. The book remains on loan until staff receive it.</p>{outstandingTotal > 0 ? <RentalReturnForm bookSlug={book?.slug ?? ""} fineTotal={outstandingTotal} rentalId={rental.id} /> : null}</> : finePaymentPending && outstandingTotal > 0 ? <p className="member-field-note">A fine TXID is awaiting verification. Check Payments &amp; Subscription before submitting another.</p> : <RentalReturnForm bookSlug={book?.slug ?? ""} fineTotal={outstandingTotal} rentalId={rental.id} />}
              {outstandingTotal > 0 ? <ul className="member-fine-breakdown">{outstandingFines.map((fine) => <li key={fine.id}>{fine.reason} · {date(fine.fine_date)} · ৳{Number(fine.amount_bdt).toLocaleString("en-BD")}</li>)}</ul> : null}
            </div>
          </article>;
        })}</div> : <div className="member-empty-state"><p>No books are currently on loan.</p><Link className="button-primary" href="/books">Browse books</Link></div>}
      </section>

      <section className="member-library-section" aria-labelledby="rental-history-title">
        <div className="member-section-heading"><div><p className="eyebrow">Receipts</p><h2 className="display-font" id="rental-history-title">Rental History</h2></div></div>
        {pastRentals.length ? <div className="member-history-table-wrap"><table className="member-history-table"><thead><tr><th>Book</th><th>Handover</th><th>Return</th><th>Days kept</th><th>Receipt</th><th>Status</th></tr></thead><tbody>{pastRentals.map((rental) => {
          const book = booksById.get(rental.book_id);
          const receipt = returnReceipts.get(rental.id);
          const early = Boolean(rental.subscription_ends_at && rental.returned_at && rental.returned_at < rental.subscription_ends_at);
          return <tr key={rental.id}><td>{book?.title ?? "Book record unavailable"}</td><td>{date(rental.started_at)}</td><td>{date(rental.returned_at)}</td><td>{daysKept(rental.started_at, rental.returned_at)}</td><td>{receipt ? `${new Date(receipt.received_at).toLocaleString("en-BD", { dateStyle: "medium", timeStyle: "short" })} · ${receipt.id.slice(0, 8)}` : "Receipt unavailable"}</td><td><span className="member-status member-status-positive">{early ? "Returned early" : "Completed"}</span></td></tr>;
        })}</tbody></table></div> : <p className="member-muted">Completed rentals and return receipts will appear here.</p>}
      </section>
    </main>
  );
}