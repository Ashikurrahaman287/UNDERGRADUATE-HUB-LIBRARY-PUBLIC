import type { Metadata } from "next";
import Link from "next/link";
import { AdminPaymentReviewControls } from "@/components/admin/admin-payment-review-controls";
import { requireAdminSession } from "@/lib/admin/session";
import { decryptMemberPii, decryptPiiField } from "@/lib/security/pii";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

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
type PaymentSubmission = {
  id: string;
  member_id: string;
  payment_type: "membership" | "rental" | "renewal" | "fine";
  related_membership_application_id: string | null;
  related_rental_request_id: string | null;
  payment_method: "bkash" | "nagad";
  amount_bdt: number;
  transaction_id: string;
  payer_phone: string | null;
  screenshot_path: string | null;
  status: "pending" | "approved" | "rejected";
  submitted_at: string;
  admin_note: string | null;
  member: Member | null;
};
type Plan = { id: string; name: string; price_bdt: number; duration_days: number };
type QueryResult<T> = { data: T | null; error: { message: string } | null; count?: number | null };
type QueryBuilder = {
  eq(column: string, value: string): QueryBuilder;
  in(column: string, values: string[]): QueryBuilder;
  order(column: string, options: { ascending: boolean }): QueryBuilder;
  range(from: number, to: number): QueryBuilder;
};
type QueryClient = {
  from(table: "payment_submissions"): {
    select(columns: string, options?: { count?: "exact"; head?: boolean }): QueryBuilder;
  };
};
type UnifiedPaymentType = "MEMBERSHIP_SUBSCRIPTION" | "LATE_FEE";
type UnifiedPaymentStatus = "PENDING" | "APPROVED" | "REJECTED";
type UnifiedPayment = {
  id: string;
  memberId: string;
  name: string;
  identity: string;
  institution: string;
  phone: string;
  email: string;
  type: UnifiedPaymentType;
  originalType: string;
  paymentMethod: "bKash" | "Nagad";
  amount: number;
  trxId: string;
  createdAt: string;
  status: UnifiedPaymentStatus;
  note: string | null;
  relatedId: string | null;
  proofPath: string | null;
};

export const metadata: Metadata = { title: "Payments", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const pageSize = 25;
const filters = ["all", "pending", "membership"] as const;
type Filter = (typeof filters)[number];

function transactionCategory(type: string): UnifiedPaymentType {
  return type === "fine" ? "LATE_FEE" : "MEMBERSHIP_SUBSCRIPTION";
}

function paymentLabel(method: "bkash" | "nagad"): UnifiedPayment["paymentMethod"] {
  return method === "bkash" ? "bKash" : "Nagad";
}

function statusClass(status: UnifiedPaymentStatus): string {
  if (status === "APPROVED") return "admin-status admin-status-available";
  if (status === "PENDING") return "admin-status admin-status-limited";
  return "admin-status admin-status-unavailable";
}

function makeQuery(client: QueryClient, filter: Filter): QueryBuilder {
  let query = client.from("payment_submissions").select("id", { count: "exact", head: true });
  if (filter === "pending") query = query.eq("status", "pending");
  if (filter === "membership") query = query.in("payment_type", ["membership", "rental", "renewal"]);
  return query;
}

function pageQuery(client: QueryClient, filter: Filter, to: number): QueryBuilder {
  let query = client.from("payment_submissions").select("id, member_id, payment_type, related_membership_application_id, related_rental_request_id, payment_method, amount_bdt, transaction_id, payer_phone, screenshot_path, status, submitted_at, admin_note, member:member_profiles(id, full_name, phone, email, id_type, id_number, institution_name, address, dob)");
  if (filter === "pending") query = query.eq("status", "pending");
  if (filter === "membership") query = query.in("payment_type", ["membership", "rental", "renewal"]);
  return query.order("submitted_at", { ascending: false }).range(0, to);
}

function decodeMember(member: Member | null): { member: Member | null; identity: string; institution: string } {
  if (!member) return { member: null, identity: "Unavailable", institution: "Unavailable" };
  try {
    const decoded = decryptMemberPii(member);
    return {
      member: decoded,
      identity: `${decoded.id_type ?? "ID"}: ${decoded.id_number ?? "Not recorded"}`,
      institution: decoded.institution_name ?? (decoded.id_type === "NID" ? "NID holder" : "Not recorded"),
    };
  } catch {
    return { member, identity: "Unavailable", institution: "Unavailable" };
  }
}

function payerPhone(value: string | null): string {
  if (!value) return "";
  try {
    return decryptPiiField(value, "payer_phone") ?? "";
  } catch {
    return "";
  }
}

function filterHref(filter: Filter): string {
  return `/ashik-loves-jannat/payments${filter === "all" ? "" : `?filter=${filter}`}`;
}

function pageHref(page: number, filter: Filter): string {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("filter", filter);
  params.set("page", String(page));
  return `/ashik-loves-jannat/payments?${params.toString()}`;
}

export async function UnifiedPaymentsPage({ searchParams }: { searchParams?: Promise<{ filter?: string; page?: string; review?: string; sms?: string }> }) {
  await requireAdminSession();
  const params = await searchParams;
  const filter = filters.includes(params?.filter as Filter) ? params?.filter as Filter : "all";
  const requestedPage = Number(params?.page ?? "1");
  const safeRequestedPage = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const rawClient = createAdminSupabaseClient();
  const client = rawClient as unknown as QueryClient;
  const paymentCountQuery = makeQuery(client, filter);
  const [paymentCountResult, plansResult] = await Promise.all([
    paymentCountQuery as unknown as Promise<QueryResult<never[]>>,
    rawClient.from("subscription_plans").select("id, name, price_bdt, duration_days").eq("is_active", true).order("price_bdt", { ascending: true }) as unknown as Promise<QueryResult<Plan[]>>,
  ]);
  const totalCount = paymentCountResult.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(safeRequestedPage, totalPages);
  const end = currentPage * pageSize - 1;
  const paymentPageQuery = pageQuery(client, filter, end);
  const paymentResult = await (paymentPageQuery as unknown as Promise<QueryResult<PaymentSubmission[]>>);
  const paymentRows = paymentResult.data ?? [];
  const proofUrls = new Map<string, string>();
  await Promise.all(paymentRows.map(async (payment) => {
    const path = payment.screenshot_path;
    if (!path || !path.startsWith(`payment-proofs/${payment.member_id}/`) || path.includes("..")) return;
    const { data, error } = await rawClient.storage.from("payment-proofs").createSignedUrl(path, 300);
    if (!error && data?.signedUrl) proofUrls.set(payment.id, data.signedUrl);
  }));

  const unified: UnifiedPayment[] = paymentRows.map((payment) => {
    const decoded = decodeMember(payment.member);
    const senderPhone = payerPhone(payment.payer_phone);
    return {
      id: payment.id,
      memberId: payment.member_id,
      name: decoded.member?.full_name ?? "Member record unavailable",
      identity: decoded.identity,
      institution: decoded.institution,
      phone: senderPhone || decoded.member?.phone || "Phone unavailable",
      email: decoded.member?.email ?? "No email",
      type: transactionCategory(payment.payment_type),
      originalType: payment.payment_type,
      paymentMethod: paymentLabel(payment.payment_method),
      amount: Number(payment.amount_bdt),
      trxId: payment.transaction_id,
      createdAt: payment.submitted_at,
      status: payment.status.toUpperCase() as UnifiedPayment["status"],
      note: payment.admin_note,
      relatedId: payment.related_membership_application_id ?? payment.related_rental_request_id,
      proofPath: proofUrls.get(payment.id) ?? null,
    };
  });
  unified.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const rows = unified.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const plans = (plansResult.data ?? []).filter((plan) => plan.duration_days === 30 && [29, 49].includes(Number(plan.price_bdt)));
  const hasError = Boolean(paymentCountResult.error || paymentResult.error);

  return <main className="admin-page">
    <header className="admin-page-header"><div><p className="eyebrow">Incoming funds</p><h1 className="display-font">Payments</h1></div></header>
    {params?.review === "approved" || params?.review === "rejected" ? <p className="admin-flash-success" role="status">Payment review recorded as {params.review}.</p> : null}
    {params?.review === "error" ? <p className="admin-form-error" role="alert">Payment could not be reviewed. Refresh and verify the linked membership, subscription, rental, or fine record.</p> : null}
    {params?.sms === "failed" ? <p className="admin-form-error" role="alert">The payment review was recorded, but the member SMS could not be sent.</p> : null}
    {plansResult.error ? <p className="admin-form-error" role="alert">Membership plans could not be loaded. Membership approvals are disabled until plans are available.</p> : null}
    <nav aria-label="Payment filters" className="admin-payment-tabs">
      {([["all", "All"], ["pending", "Pending Verification"], ["membership", "Membership Payments"]] as const).map(([value, label]) => <Link aria-current={filter === value ? "page" : undefined} href={filterHref(value)} key={value}>{label}</Link>)}
    </nav>
    <p className="admin-result-count">{totalCount.toLocaleString("en-BD")} transaction{totalCount === 1 ? "" : "s"}</p>
    {hasError ? <p className="admin-form-error" role="alert">Payment records could not be loaded. Refresh to try again.</p> : null}
    {!hasError && rows.length ? <div className="admin-table-wrap admin-payments-table-wrap"><table className="admin-books-table admin-payments-table"><thead><tr>
      <th>User Name</th><th>Student ID / Institution</th><th>Payment Type</th><th>Payment Method</th><th>Phone / Email</th><th>Amount (TK)</th><th>TrxID</th><th>Submission Time</th><th>Status</th><th>Actions</th>
    </tr></thead><tbody>{rows.map((row) => <tr key={row.id}>
      <td><strong>{row.name}</strong></td>
      <td><strong>{row.identity}</strong><span>{row.institution}</span></td>
      <td>{row.type}</td>
      <td>{row.paymentMethod}</td>
      <td><strong>{row.phone}</strong><span>{row.email}</span></td>
      <td>৳{row.amount.toLocaleString("en-BD", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
      <td><strong>{row.trxId}</strong>{row.proofPath ? <a className="text-link" href={row.proofPath} rel="noreferrer" target="_blank">Open proof</a> : null}{row.note ? <small>Note: {row.note}</small> : null}</td>
      <td><time dateTime={row.createdAt}>{new Date(row.createdAt).toLocaleString("en-BD", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" })}</time></td>
      {row.status === "PENDING" ? <AdminPaymentReviewControls plans={plans} recordId={row.id} recordType={row.originalType} relatedId={row.relatedId} status={row.status} /> : <><td><span className={statusClass(row.status)}>{row.status}</span></td><td><span>Reviewed</span></td></>}
    </tr>)}</tbody></table></div> : null}
    {!hasError && !rows.length ? <p className="admin-empty-note">No transactions match this filter.</p> : null}
    <nav aria-label="Payment pages" className="admin-pagination"><span>Page {currentPage} of {totalPages}</span>{currentPage > 1 ? <Link className="admin-action-button" href={pageHref(currentPage - 1, filter)}>Previous</Link> : null}{currentPage < totalPages ? <Link className="admin-action-button" href={pageHref(currentPage + 1, filter)}>Next</Link> : null}</nav>
  </main>;
}