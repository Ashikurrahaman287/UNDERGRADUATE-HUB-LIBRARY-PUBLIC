import type { Metadata } from "next";
import Link from "next/link";
import { approveMembershipAction, rejectMembershipAction } from "@/app/admin/(protected)/membership-requests/actions";
import { AdminSubmitButton } from "@/components/admin/admin-submit-button";
import { requireAdminSession } from "@/lib/admin/session";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { verifyMemberIdAction } from "@/app/admin/(protected)/members/actions";
import { decryptMemberPii } from "@/lib/security/pii";
import { getAdminSearchCookie } from "@/lib/admin/search-cookie";
import { searchAdminQueueAction } from "@/app/admin/(protected)/search-actions";
type ApplicationMember = { id: string; full_name: string; phone: string; address: string | null; id_type: "NID" | "Student ID" | null; id_number: string | null; dob: string | null; institution_name: string | null; id_card_url: string | null; is_id_verified: boolean };
type Application = { id: string; member_id: string; amount_bdt: number; payment_method: string; transaction_id: string; status: "pending" | "approved" | "rejected"; submitted_at: string; reviewed_at: string | null; admin_note: string | null; member: ApplicationMember | null };
type Payment = { related_membership_application_id: string | null; status: "pending" | "approved" | "rejected"; amount_bdt: number; submitted_at: string };
type Plan = { id: string; name: string; price_bdt: number; duration_days: number };
type QueryResult<T> = { data: T | null; error: { message: string } | null; count?: number | null };
type MembershipQueryClient = {
  from(table: "membership_applications"): {
    select(columns: string, options: { count: "exact" }): MembershipQuery;
  };
};
type MembershipQuery = {
  ilike(column: "transaction_id", pattern: string): MembershipQuery;
  eq(column: "status", value: string): MembershipQuery;
  order(column: "submitted_at", options: { ascending: boolean }): {
    range(from: number, to: number): PromiseLike<QueryResult<Application[]>>;
  };
};
export const metadata: Metadata = { title: "Membership Requests", robots: { index: false, follow: false } };
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
  return `/ashik-loves-jannat/membership-requests?${params.toString()}`;
}

export default async function AdminMembershipRequestsPage({ searchParams }: { searchParams?: Promise<{ q?: string; status?: string; page?: string; review?: string; sms?: string }> }) {
  await requireAdminSession();
  const params = await searchParams;
  const queryText = (await getAdminSearchCookie("membership")).replace(/[^A-Za-z0-9\-]/g, "").slice(0, 64);
  const status = statuses.includes(params?.status as (typeof statuses)[number]) ? params?.status as string : "all";
  const parsedPage = Number(params?.page ?? "1");
  const currentPage = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const client = createAdminSupabaseClient();
  const membershipClient = client as unknown as MembershipQueryClient;
  let query = membershipClient.from("membership_applications").select(
    "id, member_id, amount_bdt, payment_method, transaction_id, status, submitted_at, reviewed_at, admin_note, member:member_profiles(id, full_name, phone, address, id_type, id_number, dob, institution_name, id_card_url, is_id_verified)",
    { count: "exact" },
  );
  if (queryText) query = query.ilike("transaction_id", `%${queryText}%`) as typeof query;
  if (status !== "all") query = query.eq("status", status) as typeof query;
  const start = (currentPage - 1) * pageSize;
  const { data: requests, error, count } = await query.order("submitted_at", { ascending: false }).range(start, start + pageSize - 1);
  const applications = (requests ?? []).map((application) => ({
    ...application,
    member: application.member ? decryptMemberPii(application.member) : null,
  }));
  const applicationIds = applications.map((application) => application.id);
  const identityPhotoUrls = new Map<string, string>();
  await Promise.all(applications.map(async (application) => {
    const member = application.member;
    const path = member?.id_card_url;
    if (!member || !path || !path.startsWith(`member-ids/${member.id}/`) || path.includes("..")) return;
    const { data, error: signingError } = await client.storage.from("member-ids").createSignedUrl(path, 300);
    if (!signingError && data?.signedUrl) identityPhotoUrls.set(member.id, data.signedUrl);
  }));

  const [paymentResult, plansResult, feeResult] = await Promise.all([
    applicationIds.length
      ? client.from("payment_submissions").select("related_membership_application_id, status, amount_bdt, submitted_at").eq("payment_type", "membership").in("related_membership_application_id", applicationIds) as unknown as Promise<QueryResult<Payment[]>>
      : Promise.resolve({ data: [], error: null }),
    client.from("subscription_plans").select("id, name, price_bdt, duration_days").eq("is_active", true).order("price_bdt", { ascending: true }) as unknown as Promise<QueryResult<Plan[]>>,
    client.from("library_settings").select("value_number").eq("key", "membership_fee_bdt").maybeSingle() as unknown as Promise<QueryResult<{ value_number: number | null }>>,
  ]);
  const paymentsByApplication = new Map<string, Payment[]>();
  for (const payment of paymentResult.data ?? []) {
    if (!payment.related_membership_application_id) continue;
    const existing = paymentsByApplication.get(payment.related_membership_application_id) ?? [];
    existing.push(payment);
    paymentsByApplication.set(payment.related_membership_application_id, existing);
  }
  const fee = feeResult.data?.value_number ?? null;
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / pageSize));

  return (
    <main className="admin-page">
      <header className="admin-page-header"><div><p className="eyebrow">Review queue</p><h1 className="display-font">Membership Requests</h1></div></header>
      {params?.review === "success" ? <p className="admin-flash-success" role="status">Membership review recorded.</p> : null}
      {params?.review === "error" ? <p className="admin-form-error" role="alert">Membership review could not be completed.</p> : null}
      {params?.sms === "failed" ? <p className="admin-form-error" role="alert">The membership was approved, but the SMS could not be sent. Check the member phone and SMS gateway.</p> : null}
      <p className="admin-help-note">Initial membership fee: {fee === null ? "not configured" : `৳${Number(fee).toLocaleString("en-BD")} one time`}. Plan selection assigns the member’s rental plan; the 30-day cycle starts only after the first rental payment is approved.</p>
      {error ? <p className="admin-form-error" role="alert">Membership applications could not be loaded. Refresh to try again.</p> : null}
      {!error && (paymentResult.error || plansResult.error || feeResult.error) ? <p className="admin-form-error" role="alert">Some linked payment, plan, or fee details could not be loaded.</p> : null}
      {fee !== null && Number(fee) !== 99 ? <p className="admin-form-error" role="alert">The configured membership fee is not ৳99. Review the fee setting before approving applications.</p> : null}

      <form action={searchAdminQueueAction} className="admin-book-filters">
        <input name="searchKey" type="hidden" value="membership" />
        <label className="admin-filter-search">Search transaction ID<input defaultValue={queryText} maxLength={64} name="q" type="search" /></label>
        <label>Status<select defaultValue={status} name="status"><option value="all">All statuses</option>{statuses.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <button className="admin-action-button" type="submit">Filter</button>
      </form>

      <section className="admin-recent-panel">
        {applications.length ? <ul className="admin-recent-list">{applications.map((application) => {
          const linkedPayments = paymentsByApplication.get(application.id) ?? [];
          const payment = linkedPayments[0];
          const paymentMethod = application.payment_method === "bkash" ? "bKash" : application.payment_method === "nagad" ? "Nagad" : null;
          const applicationPaymentsValid = linkedPayments.length === 1 && payment?.status === "pending" && Number(payment.amount_bdt) === Number(application.amount_bdt);
          return <li key={application.id}>
            <div className="admin-membership-record">
              <strong>{application.member?.full_name ?? "Member record unavailable"}</strong>
              <span>{application.member?.phone ?? "Phone unavailable"} · Submitted {new Date(application.submitted_at).toLocaleString("en-BD", { dateStyle: "medium", timeStyle: "short" })}</span>
              <span>One-time fee: ৳{Number(application.amount_bdt).toLocaleString("en-BD")}{paymentMethod ? ` · ${paymentMethod} · TXID ${application.transaction_id}` : " · Historical payment"}</span>
              <span>Linked payment: {linkedPayments.length === 0 ? "missing" : linkedPayments.length > 1 ? "multiple records; review required" : `${payment?.status} · ৳${Number(payment?.amount_bdt ?? 0).toLocaleString("en-BD")}`}</span>
              {application.member ? <>
                <span>ID type: {application.member.id_type ?? "Not submitted"} · ID number: {application.member.id_number ?? "Not submitted"}</span>
                <span>Date of birth: {application.member.dob ?? "Not applicable / not submitted"} · Institution: {application.member.institution_name ?? "Not applicable / not submitted"}</span>
                <span>Address: {application.member.address ?? "Not submitted"}</span>
                {identityPhotoUrls.has(application.member.id) ? <a href={identityPhotoUrls.get(application.member.id)} rel="noreferrer" target="_blank">Open private ID photo</a> : <span>ID photo unavailable</span>}
                <span>ID verification: {application.member.is_id_verified ? "verified" : "pending review"}</span>
              </> : <span>Member identity details unavailable</span>}
              {application.reviewed_at ? <span>Reviewed {new Date(application.reviewed_at).toLocaleString("en-BD", { dateStyle: "medium", timeStyle: "short" })}</span> : null}
              {application.admin_note ? <span>Review note: {application.admin_note}</span> : null}
            </div>
            <div className="admin-review-actions">
              <span className={statusClass(application.status)}>{application.status}</span>
              {application.member && !application.member.is_id_verified && identityPhotoUrls.has(application.member.id) ? <form action={verifyMemberIdAction}><input name="memberId" type="hidden" value={application.member.id} /><AdminSubmitButton pendingLabel="Verifying ID…">Approve ID verification</AdminSubmitButton></form> : null}
              {application.status === "pending" ? <>
                <form action={approveMembershipAction} className="admin-review-form">
                  <input name="applicationId" type="hidden" value={application.id} />
                  <label>Subscription plan<select name="planId" required defaultValue=""><option value="" disabled>Select active plan</option>{(plansResult.data ?? []).map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · ৳{Number(plan.price_bdt).toLocaleString("en-BD")} / {plan.duration_days} days</option>)}</select></label>
                  <label>Review note<textarea maxLength={1000} name="adminNote" rows={2} defaultValue="Membership approved." /></label>
                  <AdminSubmitButton pendingLabel="Approving…" disabled={!applicationPaymentsValid || fee !== 99 || !plansResult.data?.length}>Approve membership</AdminSubmitButton>
                  {!applicationPaymentsValid ? <small className="admin-form-error">A single matching pending payment is required before approval.</small> : null}
                </form>
                <form action={rejectMembershipAction} className="admin-review-form">
                  <input name="applicationId" type="hidden" value={application.id} />
                  <label>Rejection note<textarea maxLength={1000} name="adminNote" rows={2} defaultValue="Membership payment rejected." /></label>
                  <AdminSubmitButton className="button-danger" confirmMessage="Reject this pending membership application?" pendingLabel="Rejecting…">Reject application</AdminSubmitButton>
                </form>
              </> : null}
            </div>
          </li>;
        })}</ul> : !error ? <p className="admin-empty-note">No membership applications match these filters.</p> : null}
      </section>
      <nav aria-label="Membership request pages" className="admin-pagination"><span>Page {currentPage} of {totalPages} · {count ?? 0} applications</span>{currentPage > 1 ? <Link className="admin-action-button" href={pageHref(currentPage - 1, status)}>Previous</Link> : null}{currentPage < totalPages ? <Link className="admin-action-button" href={pageHref(currentPage + 1, status)}>Next</Link> : null}</nav>
      <p className="admin-help-note">Review private payment proofs on the Payments page. Membership approval writes are not one atomic database transaction; if an operation fails partway through, verify the member, subscription, payment, and application records before retrying.</p>
    </main>
  );
}