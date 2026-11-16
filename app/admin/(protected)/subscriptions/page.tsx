import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminSession } from "@/lib/admin/session";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

type Subscription = {
  id: string;
  member_id: string;
  plan_name_snapshot: string;
  plan_price_snapshot: number;
  status: "pending" | "active" | "expired" | "cancelled";
  started_at: string;
  ends_at: string | null;
  member: { full_name: string; phone: string } | null;
};

type QueryResult<T> = { data: T | null; error: { message: string } | null; count?: number | null };
type SubscriptionQuery = {
  eq(column: "status", value: string): SubscriptionQuery;
  order(column: "started_at", options: { ascending: boolean }): {
    range(from: number, to: number): PromiseLike<QueryResult<Subscription[]>>;
  };
};
type SubscriptionQueryClient = {
  from(table: "member_subscriptions"): { select(columns: string, options: { count: "exact" }): SubscriptionQuery };
};

export const metadata: Metadata = { title: "Subscriptions", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const pageSize = 30;
const statuses = ["pending", "active", "expired", "cancelled"] as const;

function pageHref(page: number, status: string): string {
  const params = new URLSearchParams();
  if (status !== "all") params.set("status", status);
  params.set("page", String(page));
  return `/ashik-loves-jannat/subscriptions?${params.toString()}`;
}

function statusClass(status: string): string {
  if (status === "active") return "admin-status admin-status-available";
  if (status === "pending") return "admin-status admin-status-limited";
  return "admin-status admin-status-unavailable";
}

function formatDate(value: string | null): string {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleDateString("en-BD", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dhaka" });
}

export default async function AdminSubscriptionsPage({ searchParams }: { searchParams?: Promise<{ status?: string; page?: string }> }) {
  await requireAdminSession();
  const params = await searchParams;
  const status = statuses.includes(params?.status as (typeof statuses)[number]) ? params?.status as string : "all";
  const parsedPage = Number(params?.page ?? "1");
  const currentPage = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  let query = (createAdminSupabaseClient() as unknown as SubscriptionQueryClient).from("member_subscriptions").select(
    "id, member_id, plan_name_snapshot, plan_price_snapshot, status, started_at, ends_at, member:member_profiles(full_name, phone)",
    { count: "exact" },
  );
  if (status !== "all") query = query.eq("status", status);
  const start = (currentPage - 1) * pageSize;
  const { data: subscriptions, error, count } = await query.order("started_at", { ascending: false }).range(start, start + pageSize - 1);
  const rows = subscriptions ?? [];
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / pageSize));

  return (
    <main className="admin-page">
      <header className="admin-page-header"><div><p className="eyebrow">Member subscription records</p><h1 className="display-font">Subscriptions</h1></div><Link className="button-outline" href="/ashik-loves-jannat/subscription-plans">Plan catalogue <span aria-hidden="true">→</span></Link></header>
      <p className="admin-help-note">These are stored subscription snapshots and dates. The one-time membership activation fee is separate; this page does not create or edit subscriptions.</p>
      <form action="/ashik-loves-jannat/subscriptions" className="admin-book-filters" method="get"><label>Status<select defaultValue={status} name="status"><option value="all">All statuses</option>{statuses.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><button className="admin-action-button" type="submit">Filter</button></form>
      {error ? <p className="admin-form-error" role="alert">Subscription records could not be loaded. Refresh to try again.</p> : null}
      <section className="admin-recent-panel">{rows.length ? <ul className="admin-recent-list">{rows.map((subscription) => <li key={subscription.id}><div className="admin-subscription-record"><strong>{subscription.member?.full_name ?? "Member record unavailable"}</strong><span>{subscription.member?.phone ?? "Phone unavailable"} · {subscription.plan_name_snapshot}</span><span>Plan snapshot: ৳{Number(subscription.plan_price_snapshot).toLocaleString("en-BD")}</span><span>Started {formatDate(subscription.started_at)} · Ends {formatDate(subscription.ends_at)}</span></div><span className={statusClass(subscription.status)}>{subscription.status}</span></li>)}</ul> : !error ? <p className="admin-empty-note">No subscription records match this filter.</p> : null}</section>
      <nav aria-label="Subscription pages" className="admin-pagination"><span>Page {currentPage} of {totalPages} · {count ?? 0} records</span>{currentPage > 1 ? <Link className="admin-action-button" href={pageHref(currentPage - 1, status)}>Previous</Link> : null}{currentPage < totalPages ? <Link className="admin-action-button" href={pageHref(currentPage + 1, status)}>Next</Link> : null}</nav>
    </main>
  );
}