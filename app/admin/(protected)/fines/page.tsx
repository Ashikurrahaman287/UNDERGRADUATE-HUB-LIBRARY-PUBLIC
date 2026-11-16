import type { Metadata } from "next";
import Link from "next/link";
import { AdminSubmitButton } from "@/components/admin/admin-submit-button";
import { reviewFineAction, sendFineReminderAction } from "@/app/admin/(protected)/fines/actions";
import { requireAdminSession } from "@/lib/admin/session";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { getAdminSearchCookie } from "@/lib/admin/search-cookie";
import { searchAdminQueueAction } from "@/app/admin/(protected)/search-actions";

type FineRecord = {
  id: string;
  member_id: string;
  rental_id: string | null;
  amount_bdt: number;
  fine_date: string;
  reason: string;
  status: "outstanding" | "paid" | "waived";
  paid_at: string | null;
  original_amount_bdt: number | null;
  review_note: string | null;
  member: { full_name: string; phone: string } | null;
  rental: { subscription_ends_at: string | null; return_requested_at: string | null; returned_at: string | null } | null;
};

type QueryResult<T> = { data: T | null; error: { message: string } | null; count?: number | null };
type FineAdjustment = { id: string; fine_id: string; action: string; previous_amount_bdt: number; new_amount_bdt: number; previous_status: string; new_status: string; note: string; created_at: string };
type FineQuery = {
  eq(column: "status", value: string): FineQuery;
  in(column: "member_id", values: string[]): FineQuery;
  ilike(column: "reason", pattern: string): FineQuery;
  order(column: "fine_date", options: { ascending: boolean }): {
    range(from: number, to: number): PromiseLike<QueryResult<FineRecord[]>>;
  };
};
type FineQueryClient = {
  from(table: "fine_ledger"): { select(columns: string, options: { count: "exact" }): FineQuery };
};

export const metadata: Metadata = { title: "Fine Ledger", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const pageSize = 30;
const statuses = ["outstanding", "paid", "waived"] as const;

function pageHref(page: number, status: string): string {
  const params = new URLSearchParams();
  if (status !== "all") params.set("status", status);
  params.set("page", String(page));
  return `/ashik-loves-jannat/fines?${params.toString()}`;
}

export default async function AdminFinesPage({ searchParams }: { searchParams?: Promise<{ q?: string; status?: string; page?: string; review?: string; reminder?: string }> }) {
  await requireAdminSession();
  const params = await searchParams;
  const queryText = (await getAdminSearchCookie("fines")).replace(/[^A-Za-z0-9 ._-]/g, "").trim().slice(0, 80);
  const status = statuses.includes(params?.status as (typeof statuses)[number]) ? params?.status as string : "all";
  const parsedPage = Number(params?.page ?? "1");
  const currentPage = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const client = createAdminSupabaseClient();
  let matchedMemberIds: string[] | null = null;
  let memberSearchError = false;
  if (queryText) {
    const pattern = `%${queryText}%`;
    const { data, error: memberError } = await client.from("member_profiles").select("id").or(`full_name.ilike.${pattern},phone.ilike.${pattern}`);
    matchedMemberIds = (data ?? []).map((member) => member.id);
    memberSearchError = Boolean(memberError);
  }
  let query = (client as unknown as FineQueryClient).from("fine_ledger").select(
    "id, member_id, rental_id, amount_bdt, fine_date, reason, status, paid_at, original_amount_bdt, review_note, member:member_profiles(full_name, phone), rental:rentals(subscription_ends_at, return_requested_at, returned_at)",
    { count: "exact" },
  );
  if (queryText) {
    const memberIds = matchedMemberIds ?? [];
    if (memberSearchError) query = query.in("member_id", ["00000000-0000-0000-0000-000000000000"]);
    else if (memberIds.length > 0) query = query.in("member_id", memberIds);
    else query = query.ilike("reason", `%${queryText}%`);
  }
  if (status !== "all") query = query.eq("status", status);
  const start = (currentPage - 1) * pageSize;
  const { data: fines, error, count } = await query.order("fine_date", { ascending: false }).range(start, start + pageSize - 1);
  const { data: adjustments, error: auditError } = await (client.from("fine_ledger_adjustments")
    .select("id, fine_id, action, previous_amount_bdt, new_amount_bdt, previous_status, new_status, note, created_at")
    .order("created_at", { ascending: false })
    .limit(30) as unknown as Promise<QueryResult<FineAdjustment[]>>);
  const rows = fines ?? [];
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / pageSize));

  return (
    <main className="admin-page">
      <header className="admin-page-header"><div><p className="eyebrow">Recorded daily liabilities</p><h1 className="display-font">Fine Ledger</h1></div><Link className="button-outline" href="/ashik-loves-jannat/rentals">View rentals <span aria-hidden="true">→</span></Link></header>
      {params?.review === "override" || params?.review === "waive" ? <p className="admin-flash-success" role="status">Fine adjustment recorded in the admin audit log.</p> : null}
      {params?.review === "error" ? <p className="admin-form-error" role="alert">Fine adjustment failed. Refresh and verify that the fine is still outstanding.</p> : null}
      {params?.reminder === "sent" ? <p className="admin-flash-success" role="status">Payment reminder added to the member notification queue.</p> : null}
      {params?.reminder === "error" ? <p className="admin-form-error" role="alert">Payment reminder could not be sent.</p> : null}
      <p className="admin-help-note">Daily fine entries are produced by the scheduled accrual job. Overrides and waivers require a note and are recorded in the fine adjustment audit log.</p>
      <form action={searchAdminQueueAction} className="admin-book-filters"><input name="searchKey" type="hidden" value="fines" /><label className="admin-filter-search">Search member or reason<input defaultValue={queryText} maxLength={80} name="q" type="search" /></label><label>Status<select defaultValue={status} name="status"><option value="all">All statuses</option>{statuses.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><button className="admin-action-button" type="submit">Filter</button></form>
      {error || memberSearchError ? <p className="admin-form-error" role="alert">Fine ledger records or member search could not be loaded. Refresh to try again.</p> : null}
      <section className="admin-recent-panel">
        {rows.length ? <ul className="admin-recent-list">{rows.map((fine) => <li key={fine.id}>
          <div className="admin-fine-record"><strong>{fine.member?.full_name ?? "Member record unavailable"} · ৳{Number(fine.amount_bdt).toLocaleString("en-BD")}</strong><span>{fine.member?.phone ?? "Phone unavailable"}</span><span>Fine date {new Date(fine.fine_date).toLocaleDateString("en-BD", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dhaka" })}{fine.rental?.subscription_ends_at ? ` · Due ${new Date(fine.rental.subscription_ends_at).toLocaleDateString("en-BD", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dhaka" })}` : ""}{fine.rental?.return_requested_at ? ` · Return requested ${new Date(fine.rental.return_requested_at).toLocaleDateString("en-BD", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dhaka" })}` : ""}</span><span>{fine.reason}</span>{fine.review_note ? <span>Admin note: {fine.review_note}</span> : null}{fine.paid_at ? <span>Paid at {new Date(fine.paid_at).toLocaleString("en-BD", { dateStyle: "medium", timeStyle: "short" })}</span> : null}</div>
          <div className="admin-fine-review"><span className={`admin-status ${fine.status === "outstanding" ? "admin-status-limited" : fine.status === "paid" ? "admin-status-available" : "admin-status-unavailable"}`}>{fine.status}</span>
            {fine.status === "outstanding" ? <>
              <form action={reviewFineAction} className="admin-review-form"><input name="fineId" type="hidden" value={fine.id} /><input name="action" type="hidden" value="override" /><label>Override amount (BDT)<input defaultValue={Number(fine.amount_bdt).toFixed(2)} max="1000000" min="0.01" name="amount" required step="0.01" type="number" /></label><label>Audit note<textarea maxLength={1000} minLength={3} name="note" required rows={2} /></label><AdminSubmitButton pendingLabel="Saving…">Save override</AdminSubmitButton></form>
              <form action={reviewFineAction} className="admin-fine-inline-form"><input name="fineId" type="hidden" value={fine.id} /><input name="action" type="hidden" value="waive" /><input name="note" type="hidden" value="Waived by administrator after review." /><AdminSubmitButton className="button-danger" confirmMessage="Waive this outstanding fine? The action will be audited." pendingLabel="Waiving…">Forgive fine</AdminSubmitButton></form>
              <form action={sendFineReminderAction} className="admin-fine-inline-form"><input name="fineId" type="hidden" value={fine.id} /><AdminSubmitButton className="admin-action-button" pendingLabel="Sending…">Send reminder</AdminSubmitButton></form>
            </> : null}
          </div>
        </li>)}</ul> : !error ? <p className="admin-empty-note">No fine entries match this filter.</p> : null}
      </section>
      <section aria-labelledby="fine-adjustment-audit-title" className="admin-recent-panel">
        <div className="admin-section-heading"><div><p className="eyebrow">Accountability</p><h2 className="display-font" id="fine-adjustment-audit-title">Fine Adjustment Audit</h2></div></div>
        {auditError ? <p className="admin-form-error" role="alert">Fine adjustment audit records could not be loaded.</p> : adjustments?.length ? <ul className="admin-recent-list">{adjustments.map((adjustment) => <li key={adjustment.id}><div className="admin-fine-record"><strong>{adjustment.action === "waive" ? "Fine forgiven" : "Fine amount overridden"} · #{adjustment.fine_id.slice(0, 8)}</strong><span>৳{Number(adjustment.previous_amount_bdt).toLocaleString("en-BD")} → ৳{Number(adjustment.new_amount_bdt).toLocaleString("en-BD")} · {adjustment.previous_status} → {adjustment.new_status}</span><span>{adjustment.note}</span><time dateTime={adjustment.created_at}>{new Date(adjustment.created_at).toLocaleString("en-BD", { dateStyle: "medium", timeStyle: "short" })}</time></div></li>)}</ul> : <p className="admin-empty-note">No fine adjustments have been recorded.</p>}
      </section>
      <nav aria-label="Fine ledger pages" className="admin-pagination"><span>Page {currentPage} of {totalPages} · {count ?? 0} entries</span>{currentPage > 1 ? <Link className="admin-action-button" href={pageHref(currentPage - 1, status)}>Previous</Link> : null}{currentPage < totalPages ? <Link className="admin-action-button" href={pageHref(currentPage + 1, status)}>Next</Link> : null}</nav>
    </main>
  );
}