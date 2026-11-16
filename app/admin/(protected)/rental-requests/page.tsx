import type { Metadata } from "next";
import Link from "next/link";
import { approveRentalAction, rejectRentalAction } from "@/app/admin/(protected)/rental-requests/actions";
import { AdminSubmitButton } from "@/components/admin/admin-submit-button";
import { requireAdminSession } from "@/lib/admin/session";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { getAdminSearchCookie } from "@/lib/admin/search-cookie";
import { searchAdminQueueAction } from "@/app/admin/(protected)/search-actions";

type RentalRequest = {
  id: string;
  member_id: string;
  book_id: string;
  amount_bdt: number;
  rental_day_credit_id: string | null;
  status: "pending" | "approved" | "rejected";
  requested_at: string;
  member: { full_name: string; phone: string } | null;
  book: { title: string } | null;
};

type Payment = { related_rental_request_id: string | null; member_id: string; amount_bdt: number; transaction_id: string; status: "pending" | "approved" | "rejected"; submitted_at: string };
type RentalDayCredit = { id: string; member_id: string; expires_at: string; status: string };
type RentalHolding = { member_id: string };
type MatchResult = { data: { id: string }[] | null; error: { message: string } | null };
type QueryResult<T> = { data: T | null; error: { message: string } | null; count?: number | null };
type RequestQuery = {
  in(column: "id", values: string[]): RequestQuery;
  eq(column: "status", value: string): RequestQuery;
  order(column: "requested_at", options: { ascending: boolean }): {
    range(from: number, to: number): PromiseLike<QueryResult<RentalRequest[]>>;
  };
};
type RequestQueryClient = {
  from(table: "rental_requests"): {
    select(columns: string, options: { count: "exact" }): RequestQuery;
  };
};

export const metadata: Metadata = { title: "Rental Requests", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const pageSize = 20;
const statuses = ["pending", "approved", "rejected"] as const;

function statusClass(status: string): string {
  if (status === "approved") return "admin-status admin-status-available";
  if (status === "pending") return "admin-status admin-status-limited";
  return "admin-status admin-status-unavailable";
}

function pageHref(page: number, status: string): string {
  const params = new URLSearchParams();
  if (status !== "all") params.set("status", status);
  params.set("page", String(page));
  return `/ashik-loves-jannat/rental-requests?${params.toString()}`;
}

export default async function AdminRentalRequestsPage({ searchParams }: { searchParams?: Promise<{ q?: string; status?: string; page?: string; review?: string; sms?: string }> }) {
  await requireAdminSession();
  const params = await searchParams;
  const queryText = (await getAdminSearchCookie("rental")).replace(/[^A-Za-z0-9@._ +\-]/g, "").trim().slice(0, 80);
  const status = statuses.includes(params?.status as (typeof statuses)[number]) ? params?.status as string : "all";
  const parsedPage = Number(params?.page ?? "1");
  const currentPage = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const client = createAdminSupabaseClient();
  const requestClient = client as unknown as RequestQueryClient;

  let matchedRequestIds: string[] | null = null;
  let searchError = false;
  if (queryText) {
    const pattern = `%${queryText}%`;
    const [memberMatches, bookMatches, paymentMatches] = await Promise.all([
      client.from("member_profiles").select("id").or(`full_name.ilike.${pattern},phone.ilike.${pattern}`) as unknown as Promise<MatchResult>,
      client.from("books").select("id").ilike("title", pattern) as unknown as Promise<MatchResult>,
      client.from("payment_submissions").select("related_rental_request_id").eq("payment_type", "rental").ilike("transaction_id", pattern) as unknown as Promise<{ data: { related_rental_request_id: string | null }[] | null; error: { message: string } | null }>,
    ]);
    searchError = Boolean(memberMatches.error || bookMatches.error || paymentMatches.error);
    const memberIds = (memberMatches.data ?? []).map((row) => row.id);
    const bookIds = (bookMatches.data ?? []).map((row) => row.id);
    const requestIdsFromPayments = (paymentMatches.data ?? []).flatMap((row) => row.related_rental_request_id ? [row.related_rental_request_id] : []);
    const [requestsByMember, requestsByBook] = await Promise.all([
      memberIds.length ? client.from("rental_requests").select("id").in("member_id", memberIds) as unknown as Promise<MatchResult> : Promise.resolve({ data: [], error: null }),
      bookIds.length ? client.from("rental_requests").select("id").in("book_id", bookIds) as unknown as Promise<MatchResult> : Promise.resolve({ data: [], error: null }),
    ]);
    searchError ||= Boolean(requestsByMember.error || requestsByBook.error);
    matchedRequestIds = [...new Set([
      ...requestIdsFromPayments,
      ...(requestsByMember.data ?? []).map((row) => row.id),
      ...(requestsByBook.data ?? []).map((row) => row.id),
    ])];
  }

  const emptyResult: QueryResult<RentalRequest[]> = { data: [], error: null, count: 0 };
  let requestResult: QueryResult<RentalRequest[]>;
  if (searchError || (matchedRequestIds && matchedRequestIds.length === 0)) {
    requestResult = emptyResult;
  } else {
    let query = requestClient.from("rental_requests").select(
      "id, member_id, book_id, amount_bdt, rental_day_credit_id, status, requested_at, member:member_profiles(full_name, phone), book:books(title)",
      { count: "exact" },
    );
    if (matchedRequestIds) query = query.in("id", matchedRequestIds);
    if (status !== "all") query = query.eq("status", status);
    const start = (currentPage - 1) * pageSize;
    requestResult = await query.order("requested_at", { ascending: false }).range(start, start + pageSize - 1);
  }

  const requests = requestResult.data ?? [];
  const requestIds = requests.map((request) => request.id);
  const memberIds = [...new Set(requests.map((request) => request.member_id))];
  const { data: holdings, error: holdingsError } = memberIds.length
    ? await (client.from("rentals").select("member_id").in("member_id", memberIds).in("status", ["active", "overdue", "return_requested"]) as unknown as Promise<QueryResult<RentalHolding[]>>)
    : { data: [], error: null };
  const holdingsByMember = new Map<string, number>();
  for (const rental of holdings ?? []) holdingsByMember.set(rental.member_id, (holdingsByMember.get(rental.member_id) ?? 0) + 1);
  const { data: payments, error: paymentError } = requestIds.length
    ? await (client.from("payment_submissions").select("related_rental_request_id, member_id, amount_bdt, transaction_id, status, submitted_at").eq("payment_type", "rental").in("related_rental_request_id", requestIds) as unknown as Promise<QueryResult<Payment[]>>)
    : { data: [], error: null };
  const paymentsByRequest = new Map<string, Payment[]>();
  for (const payment of payments ?? []) {
    if (!payment.related_rental_request_id) continue;
    const existing = paymentsByRequest.get(payment.related_rental_request_id) ?? [];
    existing.push(payment);
    paymentsByRequest.set(payment.related_rental_request_id, existing);
  }

  const creditIds = requests.flatMap((request) => request.rental_day_credit_id ? [request.rental_day_credit_id] : []);
  const { data: credits, error: creditError } = creditIds.length
    ? await (client.from("rental_day_credits").select("id, member_id, expires_at, status").in("id", creditIds) as unknown as Promise<QueryResult<RentalDayCredit[]>>)
    : { data: [], error: null };
  const creditsById = new Map((credits ?? []).map((credit) => [credit.id, credit]));
  const currentTime = new Date().toISOString();

  const totalPages = Math.max(1, Math.ceil((requestResult.count ?? 0) / pageSize));

  return (
    <main className="admin-page">
      <header className="admin-page-header"><div><p className="eyebrow">Review queue</p><h1 className="display-font">Rental Requests</h1></div><Link className="button-outline" href="/ashik-loves-jannat/reservations">Reservation queues <span aria-hidden="true">→</span></Link></header>
      {params?.review === "success" ? <p className="admin-flash-success" role="status">Rental request review recorded.</p> : null}
      {params?.review === "error" ? <p className="admin-form-error" role="alert">Rental request review could not be completed.</p> : null}
      {params?.sms === "failed" ? <p className="admin-form-error" role="alert">The rental request was approved, but the SMS could not be sent. Check the member phone and SMS gateway.</p> : null}
      {requestResult.error || searchError ? <p className="admin-form-error" role="alert">Rental requests or search results could not be loaded. Refresh to try again.</p> : null}
      {paymentError ? <p className="admin-form-error" role="alert">Linked payment statuses could not be loaded.</p> : null}
      {holdingsError ? <p className="admin-form-error" role="alert">Current member holdings could not be loaded.</p> : null}
      <form action={searchAdminQueueAction} className="admin-book-filters">
        <input name="searchKey" type="hidden" value="rental" />
        <label className="admin-filter-search">Search member, book or TXID<input defaultValue={queryText} maxLength={80} name="q" type="search" /></label>
        <label>Status<select defaultValue={status} name="status"><option value="all">All statuses</option>{statuses.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <button className="admin-action-button" type="submit">Filter</button>
      </form>
      <section className="admin-recent-panel">
        {creditError ? <p className="admin-form-error" role="alert">Carryover days could not be verified. Refresh before reviewing these requests.</p> : null}
        {requests.length ? <ul className="admin-recent-list">{requests.map((request) => {
          const linkedPayments = paymentsByRequest.get(request.id) ?? [];
          const payment = linkedPayments[0];
          const carryoverCredit = request.rental_day_credit_id ? creditsById.get(request.rental_day_credit_id) : null;
          const usesCarryover = Boolean(request.rental_day_credit_id);
          const carryoverValid = Boolean(carryoverCredit
            && !creditError
            && carryoverCredit.member_id === request.member_id
            && carryoverCredit.status === "reserved"
            && carryoverCredit.expires_at > currentTime
            && Number(request.amount_bdt) === 0
            && linkedPayments.length === 0);
          const subscriptionCovered = !usesCarryover && Number(request.amount_bdt) === 0 && linkedPayments.length === 0;
          const legacyPaymentValid = Number(request.amount_bdt) > 0 && linkedPayments.length === 1 && payment?.member_id === request.member_id && Number(payment.amount_bdt) === Number(request.amount_bdt);
          const approvalBlocked = Boolean(holdingsError) || (!subscriptionCovered && (usesCarryover ? !carryoverValid : !legacyPaymentValid || payment?.status !== "pending"));
          const activeHoldings = holdingsByMember.get(request.member_id) ?? 0;
          return <li key={request.id}>
            <div className="admin-rental-record">
              <strong>{request.book?.title ?? "Book record unavailable"}</strong>
              <span>{request.member?.full_name ?? "Member record unavailable"} · {request.member?.phone ?? "Phone unavailable"}</span>
              <span>{holdingsError ? "Current holdings unavailable" : `Currently checked out: ${activeHoldings} book${activeHoldings === 1 ? "" : "s"}`}</span>
              <span>Requested {new Date(request.requested_at).toLocaleString("en-BD", { dateStyle: "medium", timeStyle: "short" })} · {Number(request.amount_bdt) === 0 ? "Covered by active subscription · no per-book payment" : `First 30-day subscription fee ৳${Number(request.amount_bdt).toLocaleString("en-BD")}`}</span>
              <span>{subscriptionCovered ? "Covered by active subscription" : usesCarryover ? carryoverCredit ? `Legacy carryover through ${new Date(carryoverCredit.expires_at).toLocaleDateString("en-BD", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dhaka" })}` : "Legacy carryover unavailable" : `First subscription payment: ${linkedPayments.length === 0 ? "missing" : linkedPayments.length > 1 ? "multiple records; review required" : `${payment?.status} · TXID ${payment?.transaction_id} · ৳${Number(payment?.amount_bdt ?? 0).toLocaleString("en-BD")}`}`}</span>
            </div>
            <div className="admin-review-actions"><span className={statusClass(request.status)}>{request.status}</span>
              {request.status === "pending" ? <>
                <form action={approveRentalAction} className="admin-review-form">
                  <input name="requestId" type="hidden" value={request.id} />
                  <label>Review note<textarea maxLength={1000} name="adminNote" rows={2} defaultValue="Subscription and book availability checked." /></label>
                  <AdminSubmitButton disabled={approvalBlocked} pendingLabel="Approving…">Approve for handover</AdminSubmitButton>
                  {approvalBlocked ? <small className="admin-form-error">Verify the first subscription payment or reserved carryover record. Active subscription requests have no per-book payment.</small> : null}
                </form>
                <form action={rejectRentalAction} className="admin-review-form">
                  <input name="requestId" type="hidden" value={request.id} />
                  <label>Rejection note<textarea maxLength={1000} name="adminNote" rows={2} defaultValue="Rental request rejected." /></label>
                  <AdminSubmitButton className="button-danger" confirmMessage="Reject this pending rental request?" pendingLabel="Rejecting…">Reject request</AdminSubmitButton>
                </form>
              </> : null}
            </div>
          </li>;
        })}</ul> : !requestResult.error && !searchError ? <p className="admin-empty-note">No rental requests match these filters.</p> : null}
      </section>
      <nav aria-label="Rental request pages" className="admin-pagination"><span>Page {currentPage} of {totalPages} · {requestResult.count ?? 0} requests</span>{currentPage > 1 ? <Link className="admin-action-button" href={pageHref(currentPage - 1, status)}>Previous</Link> : null}{currentPage < totalPages ? <Link className="admin-action-button" href={pageHref(currentPage + 1, status)}>Next</Link> : null}</nav>
    </main>
  );
}