import type { Metadata } from "next";
import Link from "next/link";
import { requireSuperAdminSession } from "@/lib/admin/session";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

type RevenueBreakdown = {
  rental_subscriptions: number;
  late_fines: number;
  total: number;
};

function money(value: number): string {
  return `৳${Number(value).toLocaleString("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const metadata: Metadata = { title: "Business Audit", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminAuditPage() {
  await requireSuperAdminSession();
  const client = createAdminSupabaseClient();

  const [finance, payments, activeSubscriptions, outstandingFines, rentalTransactions] = await Promise.all([
    client.from("finance_transactions").select("entry_type, amount_bdt").order("transaction_date", { ascending: false }) as unknown as Promise<{ data: { entry_type: string; amount_bdt: number }[] | null; error: { message: string } | null }>,
    client.from("payment_submissions").select("payment_type, amount_bdt, status").eq("status", "approved") as unknown as Promise<{ data: { payment_type: string; amount_bdt: number; status: string }[] | null; error: { message: string } | null }>,
    client.from("member_subscriptions").select("id", { count: "exact", head: true }).eq("status", "active") as unknown as Promise<{ count: number | null; error: { message: string } | null }>,
    client.from("fine_ledger").select("id", { count: "exact", head: true }).eq("status", "outstanding") as unknown as Promise<{ count: number | null; error: { message: string } | null }>,
    client.from("rentals").select("id, member_id, subscription_ends_at, status").eq("status", "returned") as unknown as Promise<{ data: { id: string; member_id: string; subscription_ends_at: string | null; status: string }[] | null; error: { message: string } | null }>,
  ]);

  const manualLedger = finance.data ?? [];
  const revenue = manualLedger.filter((row) => row.entry_type === "income").reduce((sum, row) => sum + Number(row.amount_bdt), 0);
  const expenses = manualLedger.filter((row) => row.entry_type === "expense").reduce((sum, row) => sum + Number(row.amount_bdt), 0);
  const grossEarnings = (payments.data ?? []).reduce((sum, payment) => sum + Number(payment.amount_bdt), 0);
  const netProfit = revenue - expenses;
  const recurringRevenue = (payments.data ?? []).filter((payment) => payment.payment_type === "renewal").reduce((sum, payment) => sum + Number(payment.amount_bdt), 0);
  const revenueSources: RevenueBreakdown = {
    rental_subscriptions: (payments.data ?? []).filter((payment) => payment.payment_type === "renewal" || payment.payment_type === "rental").reduce((sum, payment) => sum + Number(payment.amount_bdt), 0),
    late_fines: (payments.data ?? []).filter((payment) => payment.payment_type === "fine").reduce((sum, payment) => sum + Number(payment.amount_bdt), 0),
    total: (payments.data ?? []).reduce((sum, payment) => sum + Number(payment.amount_bdt), 0),
  };

  const auditDiscrepancies = (payments.data ?? []).filter((payment) => payment.payment_type === "fine" || payment.payment_type === "renewal").map((payment) => ({
    payment_type: payment.payment_type,
    amount_bdt: Number(payment.amount_bdt),
    status: payment.status,
  }));

  return (
    <main className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="eyebrow">Operating intelligence</p>
          <h1 className="display-font">Business Audit & Earnings</h1>
        </div>
        <Link className="button-outline" href="/ashik-loves-jannat/finances">Finance ledger <span aria-hidden="true">→</span></Link>
      </header>

      <section className="admin-stat-grid">
        <article className="admin-stat-card">
          <span>Gross Earnings</span>
          <strong>{money(grossEarnings)}</strong>
        </article>
        <article className="admin-stat-card">
          <span>Net Profit</span>
          <strong>{money(netProfit)}</strong>
        </article>
        <article className="admin-stat-card">
          <span>MRR</span>
          <strong>{money(recurringRevenue)}</strong>
        </article>
      </section>

      <section className="admin-recent-panel">
        <div className="admin-section-heading">
          <div>
            <p className="eyebrow">Operational checks</p>
            <h2 className="display-font">Audit summary</h2>
          </div>
        </div>

        <ul className="admin-recent-list">
          <li><div><strong>Active subscriptions</strong><span>{activeSubscriptions.count ?? 0}</span></div></li>
          <li><div><strong>Outstanding fines</strong><span>{outstandingFines.count ?? 0}</span></div></li>
          <li><div><strong>Returned rentals in ledger</strong><span>{rentalTransactions.data?.length ?? 0}</span></div></li>
          <li><div><strong>Manual ledger revenue</strong><span>{money(revenue)}</span></div></li>
          <li><div><strong>Manual ledger expenses</strong><span>{money(expenses)}</span></div></li>
        </ul>
      </section>

      <section className="admin-recent-panel">
        <div className="admin-section-heading">
          <div>
            <p className="eyebrow">Cross-verification</p>
            <h2 className="display-font">Discrepancy alerts</h2>
          </div>
        </div>

        {auditDiscrepancies.length ? (
          <ul className="admin-recent-list">
            {auditDiscrepancies.map((entry, index) => (
              <li key={`${entry.payment_type}-${index}`}>
                <div>
                  <strong>{entry.payment_type.replaceAll("_", " ")}</strong>
                  <span>{money(entry.amount_bdt)} · {entry.status}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="admin-empty-note">No discrepancy alerts were triggered in the current audit window.</p>
        )}
      </section>

      <section className="admin-recent-panel">
        <div className="admin-section-heading">
          <div>
            <p className="eyebrow">Analytics</p>
            <h2 className="display-font">Reporting</h2>
          </div>
        </div>

        <div className="admin-stat-grid">
          <article className="admin-stat-card">
            <span>Rental subscription share</span>
            <strong>{revenueSources.total ? `${((revenueSources.rental_subscriptions / revenueSources.total) * 100).toFixed(1)}%` : "0%"}</strong>
          </article>
          <article className="admin-stat-card">
            <span>Late fine share</span>
            <strong>{revenueSources.total ? `${((revenueSources.late_fines / revenueSources.total) * 100).toFixed(1)}%` : "0%"}</strong>
          </article>
        </div>

        <div className="admin-fine-review">
          <Link className="button-primary" href="/ashik-loves-jannat/finances">Export CSV</Link>
          <Link className="button-secondary" href="/ashik-loves-jannat/finances">Export PDF</Link>
        </div>
      </section>
    </main>
  );
}
