import type { Metadata } from "next";
import Link from "next/link";
import { AdminSubmitButton } from "@/components/admin/admin-submit-button";
import { MemberValidityExtension } from "@/components/admin/member-validity-extension";
import { approvePendingMemberAction } from "@/app/admin/(protected)/members/actions";
import { requireAdminSession } from "@/lib/admin/session";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { getAdminSearchCookie } from "@/lib/admin/search-cookie";
import { searchAdminQueueAction } from "@/app/admin/(protected)/search-actions";

type Member = { id: string; full_name: string; phone: string; email: string | null; membership_status: string; membership_expires_at: string | null; created_at: string };
type Plan = { id: string; name: string; price_bdt: number; duration_days: number };
type QueryResult<T> = { data: T | null; error: { message: string } | null; count?: number | null };
type MemberQuery = {
  or(filters: string): MemberQuery;
  eq(column: "membership_status", value: string): MemberQuery;
  order(column: "created_at", options: { ascending: boolean }): {
    range(from: number, to: number): PromiseLike<QueryResult<Member[]>>;
  };
};
type MemberQueryClient = { from(table: "member_profiles"): { select(columns: string, options: { count: "exact" }): MemberQuery } };

export const metadata: Metadata = { title: "Members", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const pageSize = 30;
const statuses = ["pending", "active", "rejected", "suspended"] as const;

function statusClass(status: string): string {
  if (status === "active") return "admin-status admin-status-available";
  if (status === "pending") return "admin-status admin-status-limited";
  return "admin-status admin-status-unavailable";
}

function pageHref(page: number, status: string): string {
  const params = new URLSearchParams();
  if (status !== "all") params.set("status", status);
  params.set("page", String(page));
  return `/ashik-loves-jannat/members?${params.toString()}`;
}

export default async function AdminMembersPage({ searchParams }: { searchParams?: Promise<{ q?: string; status?: string; page?: string; approval?: string; extension?: string; sms?: string }> }) {
  await requireAdminSession();
  const params = await searchParams;
  const queryText = (await getAdminSearchCookie("members")).replace(/[^A-Za-z0-9@._ +\-]/g, "").trim().slice(0, 80);
  const status = statuses.includes(params?.status as (typeof statuses)[number]) ? params?.status as string : "all";
  const parsedPage = Number(params?.page ?? "1");
  const currentPage = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  let query = (createAdminSupabaseClient() as unknown as MemberQueryClient).from("member_profiles").select(
    "id, full_name, phone, email, membership_status, membership_expires_at, created_at",
    { count: "exact" },
  );
  if (queryText) query = query.or(`full_name.ilike.%${queryText}%,phone.ilike.%${queryText}%,email.ilike.%${queryText}%`);
  if (status !== "all") query = query.eq("membership_status", status);
  const start = (currentPage - 1) * pageSize;
  const { data: members, error, count } = await query.order("created_at", { ascending: false }).range(start, start + pageSize - 1);
  const { data: availablePlans, error: plansError } = await (createAdminSupabaseClient()
    .from("subscription_plans").select("id, name, price_bdt, duration_days")
    .eq("is_active", true).eq("duration_days", 30).in("price_bdt", [29, 49]).order("price_bdt", { ascending: true }) as unknown as Promise<{ data: Plan[] | null; error: { message: string } | null }>);
  const plans = availablePlans ?? [];
  const rows = members ?? [];
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / pageSize));

  return (
    <main className="admin-page">
      <header className="admin-page-header"><div><p className="eyebrow">Member records</p><h1 className="display-font">Members</h1></div><div className="admin-member-export-actions"><a className="admin-action-button" href="/ashik-loves-jannat/members/export/csv">Export CSV</a><Link className="admin-action-button" href="/ashik-loves-jannat/members/export/pdf" rel="noreferrer" target="_blank">Export PDF</Link></div></header>
      {params?.approval === "success" ? <p className="admin-flash-success" role="status">Member approved with one-year validity.</p> : null}
      {params?.approval === "error" ? <p className="admin-form-error" role="alert">The pending member could not be approved.</p> : null}
      {params?.sms === "failed" ? <p className="admin-form-error" role="alert">The member was approved, but the SMS could not be sent. Check the member phone and SMS gateway.</p> : null}
      {plansError ? <p className="admin-form-error" role="alert">Rental plans could not be loaded. Refresh before approving a member.</p> : null}
      {params?.extension === "success" ? <p className="admin-flash-success" role="status">Membership period extended.</p> : null}
      {params?.extension === "error" ? <p className="admin-form-error" role="alert">The membership period could not be extended.</p> : null}
      <form action={searchAdminQueueAction} className="admin-book-filters"><input name="searchKey" type="hidden" value="members" /><label className="admin-filter-search">Search name, phone or email<input defaultValue={queryText} maxLength={80} name="q" type="search" /></label><label>Membership<select defaultValue={status} name="status"><option value="all">All statuses</option>{statuses.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><button className="admin-action-button" type="submit">Filter</button></form>
      {error ? <p className="admin-form-error" role="alert">Member records could not be loaded. Refresh to try again.</p> : null}
      <section className="admin-recent-panel">{rows.length ? <ul className="admin-recent-list">{rows.map((member) => <li key={member.id}><div><strong><Link href={`/ashik-loves-jannat/members/${member.id}`}>{member.full_name}</Link></strong><span>{member.phone} · {member.email ?? "No email"}</span><time dateTime={member.created_at}>Joined {new Date(member.created_at).toLocaleDateString("en-BD", { day: "numeric", month: "short", year: "numeric" })}</time>{member.membership_status === "active" ? null : <span>Membership expires {member.membership_expires_at ? new Date(member.membership_expires_at).toLocaleDateString("en-BD", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dhaka" }) : "Not set"}</span>}</div><div className="admin-member-actions"><span className={statusClass(member.membership_status)}>{member.membership_status}</span>{member.membership_status === "pending" ? <form action={approvePendingMemberAction}><input name="memberId" type="hidden" value={member.id} /><label>Rental plan<select name="planId" required defaultValue=""><option value="" disabled>Select 30-day plan</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · ৳{Number(plan.price_bdt).toLocaleString("en-BD")} / {plan.duration_days} days</option>)}</select></label><AdminSubmitButton disabled={!plans.length || Boolean(plansError)} pendingLabel="Approving…">Approve and activate</AdminSubmitButton></form> : null}{member.membership_status === "active" ? <MemberValidityExtension email={member.email} expiresAt={member.membership_expires_at} memberId={member.id} name={member.full_name} /> : null}</div></li>)}</ul> : !error ? <p className="admin-empty-note">No members match these filters.</p> : null}</section>
      <nav aria-label="Member pages" className="admin-pagination"><span>Page {currentPage} of {totalPages} · {count ?? 0} members</span>{currentPage > 1 ? <Link className="admin-action-button" href={pageHref(currentPage - 1, status)}>Previous</Link> : null}{currentPage < totalPages ? <Link className="admin-action-button" href={pageHref(currentPage + 1, status)}>Next</Link> : null}</nav>
    </main>
  );
}