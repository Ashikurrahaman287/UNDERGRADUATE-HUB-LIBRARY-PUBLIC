import type { Metadata } from "next";
import Link from "next/link";
import { SubscriptionRenewalForm } from "@/components/member/subscription-renewal-form";
import { NextMonthSubscriptionCard } from "@/components/member/next-month-subscription-card";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { requireMemberSession } from "@/lib/member/session";

type QueryResult<T> = { data: T | null; error: { message: string } | null };
type Profile = { id: string; membership_status: string; current_plan_id: string | null; is_id_verified: boolean; verification_status: "PENDING" | "APPROVED" | "REJECTED"; id_card_url: string | null };

async function safeQuery<T>(request: Promise<QueryResult<T>>): Promise<QueryResult<T>> {
  try {
    return await request;
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : "Query failed." } };
  }
}
type Plan = { id: string; name: string; price_bdt: number; duration_days: number; is_active: boolean };
type Subscription = { id: string; plan_id: string; plan_name_snapshot: string; plan_price_snapshot: number; status: string; started_at: string; ends_at: string | null };
type Fine = { id: string; rental_id: string | null; amount_bdt: number; fine_date: string; reason: string; status: "outstanding" | "paid" | "waived" };
type Payment = { id: string; payment_type: string; amount_bdt: number; payment_method: string; transaction_id: string; status: string; submitted_at: string; admin_note: string | null };

export const metadata: Metadata = { title: "Payments & Subscription", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

function date(value: string | null): string {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleDateString("en-BD", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dhaka" });
}

function money(value: number): string {
  return `৳${Number(value).toLocaleString("en-BD", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function daysLeft(value: string | null): number {
  return value ? Math.max(0, Math.ceil((Date.parse(value) - Date.now()) / 86_400_000)) : 0;
}

function paymentStatus(status: string): string {
  if (status === "pending") return "Pending verification";
  if (status === "approved") return "Approved";
  return "Rejected";
}

export default async function MemberPaymentsPage() {
  const session = await requireMemberSession("/member/dashboard/payments");
  const client = session.supabase;
  const { data: profile, error: profileError } = await (client.from("member_profiles")
    .select("id, membership_status, current_plan_id, is_id_verified, verification_status, id_card_url")
    .eq("user_id", session.user.id)
    .maybeSingle() as unknown as Promise<QueryResult<Profile>>);
  if (profileError || !profile) {
    return <main className="container member-page" id="main-content"><p className="member-form-message member-form-message-error" role="alert">Your payment details could not be loaded.</p></main>;
  }

  const [subscriptionResult, fineResult, paymentResult, planResult] = await Promise.all([
    safeQuery(client.from("member_subscriptions").select("id, plan_id, plan_name_snapshot, plan_price_snapshot, status, started_at, ends_at").eq("member_id", profile.id).order("started_at", { ascending: false }).limit(20) as unknown as Promise<QueryResult<Subscription[]>>),
    safeQuery(client.from("fine_ledger").select("id, rental_id, amount_bdt, fine_date, reason, status").eq("member_id", profile.id).order("fine_date", { ascending: false }).limit(100) as unknown as Promise<QueryResult<Fine[]>>),
    safeQuery(client.from("payment_submissions").select("id, payment_type, amount_bdt, payment_method, transaction_id, status, submitted_at, admin_note").eq("member_id", profile.id).order("submitted_at", { ascending: false }).limit(100) as unknown as Promise<QueryResult<Payment[]>>),
    profile.current_plan_id
      ? safeQuery(createAdminSupabaseClient().from("subscription_plans").select("id, name, price_bdt, duration_days, is_active").eq("id", profile.current_plan_id).maybeSingle() as unknown as Promise<QueryResult<Plan>>)
      : Promise.resolve({ data: null, error: null }),
  ]);

  const now = new Date().toISOString();
  const subscriptions = subscriptionResult.data ?? [];
  const planSubscriptions = profile.current_plan_id
    ? subscriptions.filter((item) => item.plan_id === profile.current_plan_id)
    : subscriptions;
  const hasSubscriptionHistory = planSubscriptions.length > 0;
  const activeCycle = planSubscriptions.find((item) => item.status === "active"
    && item.started_at <= now && item.ends_at && item.ends_at > now) ?? null;
  const scheduledCycle = planSubscriptions.find((item) => item.status === "active"
    && item.started_at > now && item.ends_at && item.ends_at > now) ?? null;
  const subscription = activeCycle ?? scheduledCycle
    ?? planSubscriptions[0]
    ?? null;
  const activeSubscription = Boolean(activeCycle);
  const status = profile.membership_status !== "active" ? "On hold" : activeSubscription || scheduledCycle ? "Active" : hasSubscriptionHistory ? "Expired" : "Not started";
  const expirationDate = activeCycle?.ends_at ?? scheduledCycle?.started_at ?? subscription?.ends_at ?? null;
  const outstandingFines = (fineResult.data ?? []).filter((fine) => fine.status === "outstanding");
  const unpaidTotal = outstandingFines.reduce((total, fine) => total + Number(fine.amount_bdt), 0);
  const payments = paymentResult.data ?? [];
  const plan = planResult.data;
  const identityVerified = profile.is_id_verified && profile.verification_status === "APPROVED" && Boolean(profile.id_card_url);
  const pendingSubscriptionPayment = payments.some((payment) => payment.status === "pending"
    && (payment.payment_type === "renewal" || (!hasSubscriptionHistory && payment.payment_type === "rental")));
  const dataError = subscriptionResult.error || fineResult.error || paymentResult.error || planResult.error;

  return (
    <main className="container member-page" id="main-content">
      <header className="member-page-heading"><p className="eyebrow">Member area</p><h1 className="display-font">Payments &amp; Subscription</h1><p className="member-muted">Your 30-day subscription covers multiple books; rental requests have no per-book fee.</p></header>
      <nav aria-label="Member dashboard pages" className="member-dashboard-tabs">
        <Link href="/member/dashboard/my-books">My Rented Books</Link>
        <Link aria-current="page" href="/member/dashboard/payments">Payments &amp; Subscription</Link>
        <Link href="/member/dashboard/referrals">Refer &amp; Earn</Link>
        <Link href="/member/dashboard">Dashboard</Link>
      </nav>
      {dataError ? <p className="member-form-message member-form-message-error" role="alert">Some subscription or payment records could not be loaded.</p> : null}

      <section aria-labelledby="subscription-card-title" className="member-subscription-card">
        <div className="member-panel-heading"><div><p className="eyebrow">30-day cycle</p><h2 className="display-font" id="subscription-card-title">Rental Subscription</h2></div><span className={`member-status ${status === "Active" ? "member-status-positive" : status === "Expired" ? "member-status-attention" : "member-status-pending"}`}>{status}</span></div>
        <div className="member-subscription-metrics">
          <div><span>Plan</span><strong>{plan ? `${plan.name} · ${money(plan.price_bdt)} / ${plan.duration_days} days` : subscription?.plan_name_snapshot ?? "No assigned plan"}</strong></div>
          <div><span>Expiration</span><strong>{date(expirationDate)}</strong></div>
          <div><span>Days remaining</span><strong>{expirationDate && activeSubscription ? `${daysLeft(expirationDate)} / 30` : "0 / 30"}</strong></div>
        </div>
        {hasSubscriptionHistory ? <p className="member-field-note">The plan price is one fee for the full 30-day period, regardless of how many books you rent. Books must be returned or the subscription renewed by its expiration date.</p> : <p className="member-field-note">Your first 30-day subscription starts after payment approval and covers multiple books.</p>}
        {profile.membership_status !== "active" ? <p className="member-field-note">An active library membership is required before rental payments can renew a cycle.</p> : null}
        {pendingSubscriptionPayment ? <p className="member-field-note" role="status">Your subscription payment is awaiting library verification.</p> : null}
        {scheduledCycle && !activeSubscription ? <p className="member-field-note" role="status">Your next 30-day cycle is approved and scheduled to begin {date(scheduledCycle.started_at)}. Locked referral reward days have been applied automatically.</p> : null}
        {!pendingSubscriptionPayment && !scheduledCycle && activeSubscription && hasSubscriptionHistory && profile.membership_status === "active" && plan?.is_active && plan.duration_days === 30 ? <NextMonthSubscriptionCard amount={Number(plan.price_bdt)} currentEndsAt={expirationDate} identityVerified={identityVerified} /> : null}
        {!pendingSubscriptionPayment && !activeSubscription && profile.membership_status === "active" && plan?.is_active && plan.duration_days === 30 ? <div className="member-renewal-panel"><h3>{hasSubscriptionHistory ? "Renew your 30-day subscription" : "Pay for your first 30-day subscription"}</h3><SubscriptionRenewalForm amount={Number(plan.price_bdt)} identityVerified={identityVerified} isFirstSubscription={!hasSubscriptionHistory} /></div> : null}
      </section>

      <section aria-labelledby="unpaid-fine-title" className={unpaidTotal > 0 ? "member-fine-banner" : "member-library-section"}>
        <div className="member-section-heading"><div><p className="eyebrow">Fine &amp; penalty</p><h2 className="display-font" id="unpaid-fine-title">{unpaidTotal > 0 ? `Unpaid Fine: ${money(unpaidTotal)}` : "No unpaid fines"}</h2></div></div>
        {unpaidTotal > 0 ? <>
          <ul className="member-fine-breakdown">{outstandingFines.map((fine) => <li key={fine.id}>{fine.reason} · {date(fine.fine_date)} · {money(fine.amount_bdt)}</li>)}</ul>
          <p className="member-field-note">Submit one TXID with a return request from My Rented Books. The library verifies the payment before clearing the fine balance.</p>
          <Link className="button-primary" href="/member/dashboard/my-books">Pay Fine &amp; Request Return <span aria-hidden="true">→</span></Link>
        </> : <p className="member-muted">No overdue or damage penalties are outstanding.</p>}
      </section>

      <section aria-labelledby="payments-history-title" className="member-library-section">
        <div className="member-section-heading"><div><p className="eyebrow">Transactions</p><h2 className="display-font" id="payments-history-title">Payment History</h2></div></div>
        {payments.length ? <div className="member-history-table-wrap"><table className="member-history-table"><thead><tr><th>Date</th><th>Payment type</th><th>Amount</th><th>TXID</th><th>Status</th></tr></thead><tbody>{payments.map((payment) => <tr key={payment.id}><td>{date(payment.submitted_at)}</td><td>{payment.payment_type.replaceAll("_", " ")}</td><td>{money(payment.amount_bdt)}</td><td>{payment.transaction_id}</td><td><span className={`member-status ${payment.status === "approved" ? "member-status-positive" : payment.status === "rejected" ? "member-status-attention" : "member-status-pending"}`}>{paymentStatus(payment.status)}</span>{payment.admin_note ? <small className="member-payment-note">{payment.admin_note}</small> : null}</td></tr>)}</tbody></table></div> : <p className="member-muted">Payment transactions will appear here after submission.</p>}
      </section>
    </main>
  );
}