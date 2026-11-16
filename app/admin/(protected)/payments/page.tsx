import type { Metadata } from "next";
import Link from "next/link";
import { UnifiedPaymentsPage } from "@/components/admin/unified-payments-page";
import { AdminSubmitButton } from "@/components/admin/admin-submit-button";
import { reviewMemberPaymentAction, reviewWalletTransactionAction } from "@/app/admin/(protected)/payments/actions";
import { requireAdminSession } from "@/lib/admin/session";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

type Payment = {
  id: string;
  member_id: string;
  payment_type: "membership" | "rental" | "renewal" | "fine";
  related_membership_application_id: string | null;
  related_rental_request_id: string | null;
  related_fine_id: string | null;
  payment_method: "bkash" | "nagad";
  amount_bdt: number;
  transaction_id: string;
  screenshot_path: string | null;
  status: "pending" | "approved" | "rejected";
  submitted_at: string;
  reviewed_at: string | null;
  admin_note: string | null;
  member: { id: string; full_name: string; phone: string } | null;
};
type WalletPayment = {
  transaction_id: string;
  user_id: string;
  amount: number;
  type: "TOPUP" | "LATE_FEE" | "SUBSCRIPTION_RENEWAL";
  status: "PENDING" | "APPROVED" | "FAILED";
  payment_method: "bkash" | "nagad";
  trx_id: string;
  created_at: string;
  member: { full_name: string; phone: string } | null;
};

type ExpectedAmount = { id: string; amount_bdt: number };
type FineBalance = { id: string; member_id: string; amount_bdt: number; status: string; payment_submission_id: string | null };
type RenewalMember = { id: string; current_plan_id: string | null };
type RenewalPlan = { id: string; price_bdt: number; is_active: boolean; duration_days: number };
type FineOverviewEntry = { member_id: string; amount_bdt: number; fine_date: string; reason: string; member: { full_name: string; phone: string } | null; rental: { subscription_ends_at: string | null; return_requested_at: string | null } | null };
type QueryResult<T> = { data: T | null; error: { message: string } | null; count?: number | null };
type PaymentQueryClient = {
  from(table: "payment_submissions"): {
    select(columns: string, options: { count: "exact" }): PaymentQuery;
  };
};
type PaymentQuery = {
  eq(column: "status", value: string): PaymentQuery;
  or(filters: string): PaymentQuery;
  order(column: "submitted_at", options: { ascending: boolean }): {
    range(from: number, to: number): PromiseLike<QueryResult<Payment[]>>;
  };
};
type WalletPaymentQuery = {
  eq(column: "status", value: "PENDING"): WalletPaymentQuery;
  order(column: "created_at", options: { ascending: boolean }): {
    limit(count: number): PromiseLike<QueryResult<WalletPayment[]>>;
  };
};
type WalletPaymentClient = {
  from(table: "wallet_transactions"): { select(columns: string): WalletPaymentQuery };
};
type FineOverviewQuery = {
  from(table: "fine_ledger"): {
    select(columns: string): {
      eq(column: "status", value: "outstanding"): {
        order(column: "fine_date", options: { ascending: boolean }): {
          limit(count: number): PromiseLike<{ data: FineOverviewEntry[] | null; error: { message: string } | null }>;
        };
      };
    };
  };
};

export const metadata: Metadata = { title: "Payments", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const pageSize = 20;
const statuses = ["pending", "approved", "rejected"] as const;

function statusClass(status: string): string {
  if (status === "approved") return "admin-status admin-status-available";
  if (status === "pending") return "admin-status admin-status-limited";
  return "admin-status admin-status-unavailable";
}

function listHref(page: number, status: string): string {
  const params = new URLSearchParams();
  if (status !== "all") params.set("status", status);
  params.set("page", String(page));
  return `/ashik-loves-jannat/payments?${params.toString()}`;
}

export default async function AdminPaymentsPage({ searchParams }: { searchParams?: Promise<{ status?: string; page?: string; review?: string; wallet?: string; filter?: string; sms?: string; legacy?: string }> }) {
  await requireAdminSession();
  const params = await searchParams;
  return <UnifiedPaymentsPage searchParams={searchParams} />;
  const status = statuses.includes(params?.status as (typeof statuses)[number]) ? params?.status as string : "all";
  const requestedPage = Number(params?.page ?? "1");
  const currentPage = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const client = createAdminSupabaseClient();
  const paymentClient = client as unknown as PaymentQueryClient;
  let query = paymentClient.from("payment_submissions").select(
    "id, member_id, payment_type, related_membership_application_id, related_rental_request_id, related_fine_id, payment_method, amount_bdt, transaction_id, screenshot_path, status, submitted_at, reviewed_at, admin_note, member:member_profiles(id, full_name, phone)",
    { count: "exact" },
  );
  if (status !== "all") query = query.eq("status", status) as typeof query;

  const start = (currentPage - 1) * pageSize;
  const { data: payments, error, count } = await query.order("submitted_at", { ascending: false }).range(start, start + pageSize - 1);
  const paymentRows = payments ?? [];
  const walletClient = client as unknown as WalletPaymentClient;
  const { data: walletPayments, error: walletPaymentsError } = await walletClient.from("wallet_transactions")
    .select("transaction_id, user_id, amount, type, status, payment_method, trx_id, created_at, member:member_profiles(full_name, phone)")
    .eq("status", "PENDING")
    .order("created_at", { ascending: true })
    .limit(50);
  const { data: fineOverviewRows, error: fineOverviewError } = await (client as unknown as FineOverviewQuery)
    .from("fine_ledger")
    .select("member_id, amount_bdt, fine_date, reason, member:member_profiles(full_name, phone), rental:rentals(subscription_ends_at, return_requested_at)")
    .eq("status", "outstanding")
    .order("fine_date", { ascending: true })
    .limit(500);
  const fineOverviewByMember = new Map<string, { name: string; phone: string; amount: number; entries: number; overdueDays: number; oldestDate: string }>();
  for (const fine of fineOverviewRows ?? []) {
    const current = fineOverviewByMember.get(fine.member_id) ?? {
      name: fine.member?.full_name ?? "Member record unavailable",
      phone: fine.member?.phone ?? "Phone unavailable",
      amount: 0,
      entries: 0,
      overdueDays: 0,
      oldestDate: fine.fine_date,
    };
    current.amount += Number(fine.amount_bdt);
    current.entries += 1;
    if (/overdue/i.test(fine.reason)) current.overdueDays += 1;
    current.oldestDate = fine.fine_date < current.oldestDate ? fine.fine_date : current.oldestDate;
    fineOverviewByMember.set(fine.member_id, current);
  }
  const fineOverview = [...fineOverviewByMember.entries()]
    .sort((left, right) => right[1].amount - left[1].amount);
  const membershipIds = paymentRows.flatMap((payment) => payment.related_membership_application_id ? [payment.related_membership_application_id] : []);
  const rentalRequestIds = paymentRows.flatMap((payment) => payment.related_rental_request_id ? [payment.related_rental_request_id] : []);
  const fineIds = paymentRows.flatMap((payment) => payment.related_fine_id ? [payment.related_fine_id] : []);
  const [membershipAmounts, rentalAmounts, fineAmounts] = await Promise.all([
    membershipIds.length ? client.from("membership_applications").select("id, amount_bdt").in("id", membershipIds) : Promise.resolve({ data: [], error: null }),
    rentalRequestIds.length ? client.from("rental_requests").select("id, amount_bdt").in("id", rentalRequestIds) : Promise.resolve({ data: [], error: null }),
    fineIds.length ? client.from("fine_ledger").select("id, amount_bdt").in("id", fineIds) : Promise.resolve({ data: [], error: null }),
  ]) as [{ data: ExpectedAmount[] | null; error: { message: string } | null }, { data: ExpectedAmount[] | null; error: { message: string } | null }, { data: ExpectedAmount[] | null; error: { message: string } | null }];
  const expectedAmounts = new Map<string, number>();
  for (const row of membershipAmounts.data ?? []) expectedAmounts.set(`membership:${row.id}`, Number(row.amount_bdt));
  for (const row of rentalAmounts.data ?? []) expectedAmounts.set(`rental:${row.id}`, Number(row.amount_bdt));
  for (const row of fineAmounts.data ?? []) expectedAmounts.set(`fine:${row.id}`, Number(row.amount_bdt));

  const renewalMemberIds = [...new Set(paymentRows.filter((payment) => payment.payment_type === "renewal").map((payment) => payment.member_id))];
  const { data: renewalMembers, error: renewalMembersError } = renewalMemberIds.length
    ? await (client.from("member_profiles").select("id, current_plan_id").in("id", renewalMemberIds) as unknown as Promise<QueryResult<RenewalMember[]>>)
    : { data: [], error: null };
  const renewalPlanIds = [...new Set((renewalMembers ?? []).flatMap((member) => member.current_plan_id ? [member.current_plan_id] : []))];
  const { data: renewalPlans, error: renewalPlansError } = renewalPlanIds.length
    ? await (client.from("subscription_plans").select("id, price_bdt, is_active, duration_days").in("id", renewalPlanIds) as unknown as Promise<QueryResult<RenewalPlan[]>>)
    : { data: [], error: null };
  const renewalAmounts = new Map((renewalPlans ?? []).filter((plan) => plan.is_active && plan.duration_days === 30).map((plan) => [plan.id, Number(plan.price_bdt)]));
  const renewalAmountByMember = new Map((renewalMembers ?? []).flatMap((member) => {
    const amount = member.current_plan_id ? renewalAmounts.get(member.current_plan_id) : undefined;
    return amount === undefined ? [] : [[member.id, amount] as const];
  }));

  const fineMemberIds = [...new Set(paymentRows.filter((payment) => payment.payment_type === "fine").map((payment) => payment.member_id))];
  const { data: memberFineBalances, error: memberFineBalanceError } = fineMemberIds.length
    ? await (client.from("fine_ledger").select("id, member_id, amount_bdt, status, payment_submission_id").in("member_id", fineMemberIds) as unknown as Promise<QueryResult<FineBalance[]>>)
    : { data: [], error: null };

  const proofUrls = new Map<string, string>();
  await Promise.all(paymentRows.map(async (payment) => {
    const path = payment.screenshot_path;
    if (!path || !payment.member_id || !path.startsWith(`payment-proofs/${payment.member_id}/`) || path.includes("..")) return;
    const { data, error: signingError } = await client.storage.from("payment-proofs").createSignedUrl(path, 300);
    if (!signingError && data?.signedUrl) proofUrls.set(payment.id, data.signedUrl);
  }));

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / pageSize));
  const canReviewMembership = paymentRows.some((payment) => payment.payment_type === "membership");
  const canReviewRentals = paymentRows.some((payment) => payment.payment_type === "rental");
  const canReviewStandalonePayments = paymentRows.some((payment) => payment.payment_type === "fine" || payment.payment_type === "renewal");

  return (
    <main className="admin-page">
      <header className="admin-page-header">
        <div><p className="eyebrow">Private proof review</p><h1 className="display-font">Payments</h1></div>
      </header>
      {params?.review === "approved" || params?.review === "rejected" ? <p className="admin-flash-success" role="status">Payment review recorded as {params?.review}.</p> : null}
      {params?.review === "error" ? <p className="admin-form-error" role="alert">Payment could not be reviewed. Refresh and verify its status and outstanding amount.</p> : null}
      <p className="admin-help-note">Payment submissions are evidence for review, not confirmation that funds were received. Membership and rental payments are reviewed through their corresponding approval workflows.</p>
      {error ? <p className="admin-form-error" role="alert">Payment records could not be loaded. Refresh to try again.</p> : null}
      {!error && (membershipAmounts.error || rentalAmounts.error || fineAmounts.error || renewalMembersError || renewalPlansError) ? <p className="admin-form-error" role="alert">Expected amounts could not all be verified from their linked records.</p> : null}
      {!error && memberFineBalanceError ? <p className="admin-form-error" role="alert">Outstanding fine totals could not be verified.</p> : null}
      {fineOverviewError ? <p className="admin-form-error" role="alert">The outstanding fine overview could not be loaded.</p> : null}

      <form action="/ashik-loves-jannat/payments" className="admin-book-filters" method="get">
        <label>Status<select defaultValue={status} name="status"><option value="all">All statuses</option>{statuses.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <button className="admin-action-button" type="submit">Filter</button>
      </form>

      <section aria-labelledby="fine-overview-title" className="admin-recent-panel">
        <div className="admin-section-heading"><div><p className="eyebrow">Unpaid member balances</p><h2 className="display-font" id="fine-overview-title">Fine Overview</h2></div><Link className="text-link" href="/ashik-loves-jannat/fines">Fine ledger <span aria-hidden="true">→</span></Link></div>
        {fineOverviewError ? null : fineOverview.length ? <>
          <div className="admin-table-wrap"><table className="admin-books-table"><thead><tr><th>Member</th><th>Unpaid total</th><th>Fine entries</th><th>Overdue days</th><th>Oldest fine</th></tr></thead><tbody>{fineOverview.map(([memberId, member]) => <tr key={memberId}><td><strong>{member.name}</strong><span>{member.phone}</span></td><td>৳{member.amount.toLocaleString("en-BD")}</td><td>{member.entries}</td><td>{member.overdueDays}</td><td>{new Date(member.oldestDate).toLocaleDateString("en-BD", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dhaka" })}</td></tr>)}</tbody></table></div>
          <div className="admin-fine-overview-cards">{fineOverview.map(([memberId, member]) => <article className="admin-book-card" key={memberId}><strong>{member.name}</strong><span>{member.phone}</span><dl><div><dt>Unpaid total</dt><dd>৳{member.amount.toLocaleString("en-BD")}</dd></div><div><dt>Fine entries</dt><dd>{member.entries}</dd></div><div><dt>Overdue days</dt><dd>{member.overdueDays}</dd></div><div><dt>Oldest fine</dt><dd>{new Date(member.oldestDate).toLocaleDateString("en-BD", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dhaka" })}</dd></div></dl></article>)}</div>
        </> : <p className="admin-empty-note">No members currently have unpaid fines.</p>}
      </section>

      <section aria-labelledby="wallet-review-title" className="admin-recent-panel">
        <div className="admin-section-heading"><div><p className="eyebrow">Member wallet</p><h2 className="display-font" id="wallet-review-title">Pending Wallet Transactions</h2></div></div>
        {walletPaymentsError ? <p className="admin-form-error" role="alert">Wallet transactions could not be loaded.</p> : walletPayments?.length ? <ul className="admin-recent-list">{walletPayments?.map((transaction) => <li key={transaction.transaction_id}>
          <div className="admin-payment-record">
            <strong>{transaction.member?.full_name ?? "Member record unavailable"} · {transaction.type.replaceAll("_", " ").toLowerCase()}</strong>
            <span>{transaction.member?.phone ?? "Phone unavailable"} · {transaction.payment_method} · {new Date(transaction.created_at).toLocaleString("en-BD", { dateStyle: "medium", timeStyle: "short" })}</span>
            <span>Submitted: ৳{Number(transaction.amount).toLocaleString("en-BD")} · TrxID: {transaction.trx_id}</span>
            <span>The database rechecks outstanding fees or the assigned plan amount before settlement.</span>
            <form action={reviewWalletTransactionAction} className="admin-review-form">
              <input name="transactionId" type="hidden" value={transaction.transaction_id} />
              <label>Review note<textarea maxLength={1000} name="adminNote" rows={2} defaultValue="Payment verified." /></label>
              <div className="admin-payment-review-buttons">
                <AdminSubmitButton name="decision" value="approve" pendingLabel="Approving…">Approve Payment</AdminSubmitButton>
                <AdminSubmitButton className="button-danger" confirmMessage="Reject this wallet transaction? The member's fees or subscription will remain unchanged." name="decision" value="reject" pendingLabel="Rejecting…">Reject / Invalid TXID</AdminSubmitButton>
              </div>
            </form>
          </div>
          <span className="admin-status admin-status-limited">pending</span>
        </li>)}</ul> : <p className="admin-empty-note">No wallet transactions are awaiting verification.</p>}
      </section>

      <section className="admin-recent-panel">
        {paymentRows.length ? <ul className="admin-recent-list">{paymentRows.map((payment) => {
          const expectedKey = payment.payment_type === "membership" && payment.related_membership_application_id
            ? `membership:${payment.related_membership_application_id}`
            : payment.payment_type === "rental" && payment.related_rental_request_id
              ? `rental:${payment.related_rental_request_id}`
              : payment.payment_type === "fine" && payment.related_fine_id
                ? `fine:${payment.related_fine_id}`
                : null;
          const expectedFineAmount = payment.payment_type === "fine"
            ? (memberFineBalances ?? []).filter((fine) => fine.member_id === payment.member_id
              && (payment.status === "pending" ? fine.status === "outstanding" : fine.payment_submission_id === payment.id))
              .reduce((total, fine) => total + Number(fine.amount_bdt), 0)
            : undefined;
          const expectedAmount = expectedFineAmount ?? (payment.payment_type === "renewal"
            ? renewalAmountByMember.get(payment.member_id)
            : expectedKey ? expectedAmounts.get(expectedKey) : undefined);
          return <li key={payment.id}>
            <div className="admin-payment-record">
              <strong>{payment.member?.full_name ?? "Member record unavailable"} · {payment.payment_type.replaceAll("_", " ")}</strong>
              <span>{payment.member?.phone ?? "Phone unavailable"} · {payment.payment_method} · {new Date(payment.submitted_at).toLocaleString("en-BD", { dateStyle: "medium", timeStyle: "short" })}</span>
              <span>TXID: {payment.transaction_id}</span>
              <span>Submitted: ৳{Number(payment.amount_bdt).toLocaleString("en-BD")} · Expected: {expectedAmount === undefined ? "Not linked" : `৳${expectedAmount.toLocaleString("en-BD")}`}</span>
              {payment.admin_note ? <span>Review note: {payment.admin_note}</span> : null}
              {proofUrls.has(payment.id) ? <a className="text-link" href={proofUrls.get(payment.id)} rel="noreferrer" target="_blank">Open private proof (expires in 5 minutes) <span aria-hidden="true">↗</span></a> : <span>{payment.screenshot_path ? "Proof unavailable or path not valid for this member." : "No proof image submitted."}</span>}
              {payment.payment_type === "membership" ? <Link className="text-link" href="/ashik-loves-jannat/membership-requests">Review membership applications <span aria-hidden="true">→</span></Link> : null}
              {payment.payment_type === "rental" ? <Link className="text-link" href="/ashik-loves-jannat/rental-requests">Review rental requests <span aria-hidden="true">→</span></Link> : null}
              {payment.payment_type === "fine" && memberFineBalanceError ? <span className="admin-form-error">Outstanding fine balance could not be verified.</span> : null}
              {payment.status === "pending" && (payment.payment_type === "renewal" || payment.payment_type === "fine") ? <form action={reviewMemberPaymentAction} className="admin-review-form">
                <input name="paymentId" type="hidden" value={payment.id} />
                <label>Review note<textarea maxLength={1000} name="adminNote" rows={2} defaultValue={payment.payment_type === "fine" ? "Fine payment verified." : "Renewal payment verified."} /></label>
                <div className="admin-payment-review-buttons">
                  <AdminSubmitButton disabled={expectedAmount === undefined || expectedAmount <= 0 || Number(payment.amount_bdt) !== expectedAmount} name="decision" value="approve" pendingLabel="Approving…">Approve Payment</AdminSubmitButton>
                  <AdminSubmitButton className="button-danger" confirmMessage="Reject this TXID? The fine or subscription remains unpaid." name="decision" value="reject" pendingLabel="Rejecting…">Reject / Invalid TXID</AdminSubmitButton>
                </div>
                {expectedAmount === undefined || expectedAmount <= 0 || Number(payment.amount_bdt) !== expectedAmount ? <small className="admin-form-error">The submitted amount must match the verifiable balance.</small> : null}
              </form> : null}
            </div>
            <span className={statusClass(payment.status)}>{payment.status}</span>
          </li>;
        })}</ul> : !error ? <p className="admin-empty-note">No payment submissions match these filters.</p> : null}
      </section>
      <nav aria-label="Payment pages" className="admin-pagination">
        <span>Page {currentPage} of {totalPages} · {count ?? 0} records</span>
        {currentPage > 1 ? <Link className="admin-action-button" href={listHref(currentPage - 1, status)}>Previous</Link> : null}
        {currentPage < totalPages ? <Link className="admin-action-button" href={listHref(currentPage + 1, status)}>Next</Link> : null}
      </nav>
      {canReviewMembership || canReviewRentals || canReviewStandalonePayments ? <p className="admin-help-note">Membership and rental payments are reviewed through their linked workflows. Fine and renewal TXIDs can be approved here only when the linked fine balance or assigned 30-day plan amount matches.</p> : null}
    </main>
  );
}