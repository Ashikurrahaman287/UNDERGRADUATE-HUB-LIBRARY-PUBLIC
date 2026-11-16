import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminSession } from "@/lib/admin/session";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { getAdminSearchCookie } from "@/lib/admin/search-cookie";
import { searchAdminQueueAction } from "@/app/admin/(protected)/search-actions";

type Reservation = {
  id: string;
  book_id: string;
  member_id: string;
  status: "waiting" | "notified" | "fulfilled" | "cancelled" | "expired";
  requested_at: string;
  notified_at: string | null;
  fulfilled_at: string | null;
  cancelled_at: string | null;
  member: { full_name: string; phone: string } | null;
  book: { title: string } | null;
};

type QueryResult<T> = { data: T | null; error: { message: string } | null; count?: number | null };
type MatchResult = { data: { id: string }[] | null; error: { message: string } | null };
type ReservationQuery = {
  in(column: "id", values: string[]): ReservationQuery;
  in(column: "status", values: ("waiting" | "notified")[]): ReservationQuery;
  eq(column: "status", value: string): ReservationQuery;
  order(column: "requested_at" | "id", options: { ascending: boolean }): ReservationQuery;
  range(from: number, to: number): PromiseLike<QueryResult<Reservation[]>>;
};
type ReservationQueryClient = {
  from(table: "reservation_requests"): { select(columns: string, options: { count: "exact" }): ReservationQuery };
  rpc(functionName: "get_next_book_reservation", args: { p_book_id: string }): Promise<{
    data: { reservation_id: string; book_id: string; book_title: string; member_name: string; member_phone: string; requested_at: string; queue_position: number }[] | null;
    error: { message: string } | null;
  }>;
};

export const metadata: Metadata = { title: "Reservations", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const pageSize = 30;
const statuses = ["waiting", "notified", "fulfilled", "cancelled", "expired"] as const;

function statusClass(status: string): string {
  if (status === "fulfilled") return "admin-status admin-status-available";
  if (status === "waiting" || status === "notified") return "admin-status admin-status-limited";
  return "admin-status admin-status-unavailable";
}

function pageHref(page: number, status: string): string {
  const params = new URLSearchParams();
  if (status !== "all") params.set("status", status);
  params.set("page", String(page));
  return `/ashik-loves-jannat/reservations?${params.toString()}`;
}

export default async function AdminReservationsPage({ searchParams }: { searchParams?: Promise<{ q?: string; status?: string; page?: string }> }) {
  await requireAdminSession();
  const params = await searchParams;
  const queryText = (await getAdminSearchCookie("reservations")).replace(/[^A-Za-z0-9@._ +\-]/g, "").trim().slice(0, 80);
  const status = statuses.includes(params?.status as (typeof statuses)[number]) ? params?.status as string : "open";
  const parsedPage = Number(params?.page ?? "1");
  const currentPage = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const adminClient = createAdminSupabaseClient();
  const reservationClient = adminClient as unknown as ReservationQueryClient;

  let memberIds: string[] | null = null;
  let bookIds: string[] | null = null;
  let matchedReservationIds: string[] | null = null;
  let searchError = false;
  if (queryText) {
    const pattern = `%${queryText}%`;
    const [members, books] = await Promise.all([
      adminClient.from("member_profiles").select("id").or(`full_name.ilike.${pattern},phone.ilike.${pattern}`) as unknown as Promise<MatchResult>,
      adminClient.from("books").select("id").ilike("title", pattern) as unknown as Promise<MatchResult>,
    ]);
    memberIds = (members.data ?? []).map((row) => row.id);
    bookIds = (books.data ?? []).map((row) => row.id);
    searchError = Boolean(members.error || books.error);
    const [memberReservations, bookReservations] = await Promise.all([
      memberIds.length ? adminClient.from("reservation_requests").select("id").in("member_id", memberIds) as unknown as Promise<MatchResult> : Promise.resolve({ data: [], error: null }),
      bookIds.length ? adminClient.from("reservation_requests").select("id").in("book_id", bookIds) as unknown as Promise<MatchResult> : Promise.resolve({ data: [], error: null }),
    ]);
    searchError ||= Boolean(memberReservations.error || bookReservations.error);
    matchedReservationIds = [...new Set([...(memberReservations.data ?? []).map((row) => row.id), ...(bookReservations.data ?? []).map((row) => row.id)])];
  }

  const noMatches = queryText && !searchError && matchedReservationIds?.length === 0;
  const emptyResult: QueryResult<Reservation[]> = { data: [], error: null, count: 0 };
  let result: QueryResult<Reservation[]>;
  if (searchError || noMatches) {
    result = emptyResult;
  } else {
    let query = reservationClient.from("reservation_requests").select(
      "id, book_id, member_id, status, requested_at, notified_at, fulfilled_at, cancelled_at, member:member_profiles(full_name, phone), book:books(title)",
      { count: "exact" },
    );
    if (matchedReservationIds) query = query.in("id", matchedReservationIds);
    if (status === "open") query = query.in("status", ["waiting", "notified"]);
    else if (status !== "all") query = query.eq("status", status);
    const start = (currentPage - 1) * pageSize;
    result = await query.order("requested_at", { ascending: true }).order("id", { ascending: true }).range(start, start + pageSize - 1);
  }

  const reservations = result.data ?? [];
  const openBookIds = [...new Set(reservations.filter((reservation) => reservation.status === "waiting" || reservation.status === "notified").map((reservation) => reservation.book_id))];
  const nextResults = await Promise.all(openBookIds.map((bookId) => reservationClient.rpc("get_next_book_reservation", { p_book_id: bookId })));
  const nextByBook = new Map<string, { member_name: string; member_phone: string; requested_at: string }>();
  let queueError = false;
  for (const { data, error } of nextResults) {
    if (error) queueError = true;
    const next = data?.[0];
    if (next) nextByBook.set(next.book_id, { member_name: next.member_name, member_phone: next.member_phone, requested_at: next.requested_at });
  }
  const totalPages = Math.max(1, Math.ceil((result.count ?? 0) / pageSize));

  return (
    <main className="admin-page">
      <header className="admin-page-header"><div><p className="eyebrow">FIFO reservation system</p><h1 className="display-font">Reservations</h1></div><Link className="button-outline" href="/ashik-loves-jannat/rental-requests">Rental requests <span aria-hidden="true">→</span></Link></header>
      <p className="admin-help-note">The list is an unranked record view. The “Next eligible” section comes from the authoritative FIFO RPC; this panel does not assign, reorder, or issue books.</p>
      {result.error || searchError ? <p className="admin-form-error" role="alert">Reservation records could not be loaded. Refresh to try again.</p> : null}
      {queueError ? <p className="admin-form-error" role="alert">Some next-eligible queue results could not be loaded.</p> : null}
      <form action={searchAdminQueueAction} className="admin-book-filters"><input name="searchKey" type="hidden" value="reservations" /><label className="admin-filter-search">Search member, phone or book<input defaultValue={queryText} maxLength={80} name="q" type="search" /></label><label>Status<select defaultValue={status} name="status"><option value="open">Open queue</option><option value="all">All statuses</option>{statuses.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><button className="admin-action-button" type="submit">Filter</button></form>

      <section className="admin-recent-panel" aria-labelledby="next-eligible-title"><header className="admin-section-heading"><div><p className="eyebrow">Trusted backend result</p><h2 className="display-font" id="next-eligible-title">Next Eligible by Book</h2></div></header>
        {nextByBook.size ? <ul className="admin-recent-list">{[...nextByBook.entries()].map(([bookId, next]) => {
          const reservation = reservations.find((item) => item.book_id === bookId);
          return <li key={bookId}><div><strong>{reservation?.book?.title ?? "Book record unavailable"}</strong><span>{next.member_name} · {next.member_phone}</span><time dateTime={next.requested_at}>{new Date(next.requested_at).toLocaleDateString("en-BD", { day: "numeric", month: "short", year: "numeric" })}</time></div><span>Next eligible</span></li>;
        })}</ul> : <p className="admin-empty-note">No eligible reservation found on this page.</p>}
      </section>

      <section className="admin-recent-panel" aria-labelledby="reservation-records-title"><header className="admin-section-heading"><div><p className="eyebrow">Historical records</p><h2 className="display-font" id="reservation-records-title">Reservation Requests</h2></div></header>
        {reservations.length ? <ul className="admin-recent-list">{reservations.map((reservation) => <li key={reservation.id}><div><strong>{reservation.book?.title ?? "Book record unavailable"}</strong><span>{reservation.member?.full_name ?? "Member record unavailable"} · {reservation.member?.phone ?? "Phone unavailable"}</span><time dateTime={reservation.requested_at}>Requested {new Date(reservation.requested_at).toLocaleDateString("en-BD", { day: "numeric", month: "short", year: "numeric" })}</time>{reservation.notified_at ? <span>Notified {new Date(reservation.notified_at).toLocaleDateString("en-BD", { day: "numeric", month: "short", year: "numeric" })}</span> : null}{reservation.fulfilled_at ? <span>Fulfilled {new Date(reservation.fulfilled_at).toLocaleDateString("en-BD", { day: "numeric", month: "short", year: "numeric" })}</span> : null}{reservation.cancelled_at ? <span>Cancelled {new Date(reservation.cancelled_at).toLocaleDateString("en-BD", { day: "numeric", month: "short", year: "numeric" })}</span> : null}</div><span className={statusClass(reservation.status)}>{reservation.status}</span></li>)}</ul> : !result.error ? <p className="admin-empty-note">No reservation records match these filters.</p> : null}
      </section>
      <nav aria-label="Reservation pages" className="admin-pagination"><span>Page {currentPage} of {totalPages} · {result.count ?? 0} records</span>{currentPage > 1 ? <Link className="admin-action-button" href={pageHref(currentPage - 1, status)}>Previous</Link> : null}{currentPage < totalPages ? <Link className="admin-action-button" href={pageHref(currentPage + 1, status)}>Next</Link> : null}</nav>
    </main>
  );
}