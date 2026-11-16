import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { requireAdminSession } from "@/lib/admin/session";
import { decryptMemberPii } from "@/lib/security/pii";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { getAdminSearchCookie } from "@/lib/admin/search-cookie";
import { searchAdminQueueAction } from "@/app/admin/(protected)/search-actions";

type Member = {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  id_type: string | null;
  id_number: string | null;
  institution_name: string | null;
  address: string | null;
  dob: string | null;
};
type Subscription = { member_id: string; ends_at: string | null; status: string };
type Rental = { member_id: string };
type QueryResult<T> = { data: T | null; error: { message: string } | null };
type ApprovedMemberRow = { member: Member; endsAt: string | null; remainingDays: number; rentedBooks: number };

export const metadata: Metadata = { title: "Approved Members", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const pageSize = 30;
const queryPageSize = 100;

async function getRequestTimestamp(): Promise<number> {
  await connection();
  return Date.now();
}

async function fetchAllPages<T>(loadPage: (from: number, to: number) => PromiseLike<QueryResult<T[]>>): Promise<QueryResult<T[]>> {
  const rows: T[] = [];
  for (let from = 0; ; from += queryPageSize) {
    const { data, error } = await loadPage(from, from + queryPageSize - 1);
    if (error) return { data: null, error };
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < queryPageSize) return { data: rows, error: null };
  }
}

function pageHref(page: number, institution: string): string {
  const params = new URLSearchParams();
  if (institution) params.set("institution", institution);
  params.set("page", String(page));
  return `/ashik-loves-jannat/approved-members?${params.toString()}`;
}

function displayDate(value: string): string {
  return new Date(value).toLocaleDateString("en-BD", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dhaka" });
}

export default async function AdminActiveMembersPage({ searchParams }: { searchParams?: Promise<{ q?: string; institution?: string; page?: string }> }) {
  await requireAdminSession();
  const params = await searchParams;
  const queryText = (await getAdminSearchCookie("active-members")).replace(/[^A-Za-z0-9@._ /+\-]/g, " ").trim().slice(0, 80).toLowerCase();
  const institutionFilter = (params?.institution ?? "").trim().slice(0, 100);
  const requestedPage = Number(params?.page ?? "1");
  const currentPage = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const client = createAdminSupabaseClient();
  const { data: profiles, error: profilesError } = await fetchAllPages((from, to) => client.from("member_profiles")
    .select("id, full_name, phone, email, id_type, id_number, institution_name, address, dob")
    .eq("membership_status", "active")
    .eq("is_id_verified", true)
    .eq("verification_status", "APPROVED")
    .order("full_name", { ascending: true })
    .order("id", { ascending: true })
    .range(from, to));
  const memberIds = (profiles ?? []).map((member) => member.id);
  const subscriptionRows: Subscription[] = [];
  const rentalRows: Rental[] = [];
  let subscriptionsError: { message: string } | null = null;
  let rentalsError: { message: string } | null = null;
  for (let start = 0; start < memberIds.length; start += queryPageSize) {
    const memberIdBatch = memberIds.slice(start, start + queryPageSize);
    const [subscriptionResult, rentalResult] = await Promise.all([
      fetchAllPages((from, to) => client.from("member_subscriptions")
        .select("member_id, ends_at, status")
        .in("member_id", memberIdBatch)
        .order("member_id", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)),
      fetchAllPages((from, to) => client.from("rentals")
        .select("member_id")
        .in("member_id", memberIdBatch)
        .in("status", ["active", "overdue", "return_requested"])
        .order("member_id", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)),
    ]);
    if (subscriptionResult.error) subscriptionsError = subscriptionResult.error;
    else subscriptionRows.push(...(subscriptionResult.data ?? []));
    if (rentalResult.error) rentalsError = rentalResult.error;
    else rentalRows.push(...(rentalResult.data ?? []));
    if (subscriptionsError || rentalsError) break;
  }
  const now = await getRequestTimestamp();
  const subscriptionByMember = new Map<string, string>();
  for (const subscription of subscriptionRows) {
    if (!subscription.ends_at) continue;
    const currentEnd = subscriptionByMember.get(subscription.member_id);
    if (!currentEnd || Date.parse(subscription.ends_at) > Date.parse(currentEnd)) subscriptionByMember.set(subscription.member_id, subscription.ends_at);
  }
  const rentalsByMember = new Map<string, number>();
  for (const rental of rentalRows) rentalsByMember.set(rental.member_id, (rentalsByMember.get(rental.member_id) ?? 0) + 1);

  let rows: ApprovedMemberRow[] = (profiles ?? []).map((storedMember) => {
    const endsAt = subscriptionByMember.get(storedMember.id) ?? null;
    let member = storedMember;
    try {
      member = decryptMemberPii(storedMember);
    } catch {
      member = { ...storedMember, id_number: null, institution_name: null };
    }
    const remainingDays = endsAt ? Math.max(0, Math.ceil((Date.parse(endsAt) - now) / 86_400_000)) : 0;
    return { member, endsAt, remainingDays, rentedBooks: rentalsByMember.get(member.id) ?? 0 };
  });
  const institutions = [...new Set(rows.map(({ member }) => member.institution_name).filter((value): value is string => Boolean(value?.trim())))].sort((a, b) => a.localeCompare(b));
  if (institutionFilter) rows = rows.filter(({ member }) => member.institution_name === institutionFilter);
  if (queryText) rows = rows.filter(({ member }) => `${member.full_name} ${member.id_number ?? ""} ${member.phone}`.toLowerCase().includes(queryText));
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(currentPage, totalPages);
  const visibleRows = rows.slice((page - 1) * pageSize, page * pageSize);
  const loadError = profilesError || subscriptionsError || rentalsError;

  return <main className="admin-page">
    <header className="admin-page-header"><div><p className="eyebrow">Approved and ID verified</p><h1 className="display-font">Approved Members</h1></div></header>
    <nav aria-label="Member management" className="admin-payment-tabs"><Link href="/ashik-loves-jannat/members">All members <span aria-hidden="true">→</span></Link></nav>
    <form action={searchAdminQueueAction} className="admin-book-filters">
      <input name="searchKey" type="hidden" value="active-members" />
      <label className="admin-filter-search">Search name, Student ID, or phone<input defaultValue={queryText} maxLength={80} name="q" type="search" /></label>
      <label>Institution<select defaultValue={institutionFilter} name="institution"><option value="">All institutions</option>{institutions.map((institution) => <option key={institution} value={institution}>{institution}</option>)}</select></label>
      <button className="admin-action-button" type="submit">Filter</button>
    </form>
    <p className="admin-result-count">{rows.length.toLocaleString("en-BD")} approved members</p>
    {loadError ? <p className="admin-form-error" role="alert">Approved member records could not all be loaded. Refresh to try again.</p> : null}
    {!loadError && visibleRows.length ? <div className="admin-table-wrap admin-active-members-wrap"><table className="admin-books-table admin-active-members-table"><thead><tr>
      <th>Full Name</th><th>Institution</th><th>Contact Phone / Email</th><th>Subscription Expiry</th><th>Remaining Active Days</th><th>Books Currently Rented</th>
    </tr></thead><tbody>{visibleRows.map(({ member, endsAt, remainingDays, rentedBooks }) => <tr key={member.id}>
      <td><strong>{member.full_name}</strong><span>{member.id_type ?? "ID"}: {member.id_number ?? "Unavailable"}</span></td>
      <td>{member.institution_name ?? (member.id_type === "NID" ? "NID holder" : "Not recorded")}</td>
      <td><strong>{member.phone}</strong><span>{member.email ?? "No email"}</span></td>
      <td>{endsAt ? <><time dateTime={endsAt}>{displayDate(endsAt)}</time>{remainingDays === 0 ? <span>Expired</span> : null}</> : "Not recorded"}</td>
      <td>{remainingDays}</td>
      <td>{rentedBooks}</td>
    </tr>)}</tbody></table></div> : null}
    {!loadError && !visibleRows.length ? <p className="admin-empty-note">No approved ID-verified members match these filters.</p> : null}
    <nav aria-label="Approved member pages" className="admin-pagination"><span>Page {page} of {totalPages}</span>{page > 1 ? <Link className="admin-action-button" href={pageHref(page - 1, institutionFilter)}>Previous</Link> : null}{page < totalPages ? <Link className="admin-action-button" href={pageHref(page + 1, institutionFilter)}>Next</Link> : null}</nav>
  </main>;
}