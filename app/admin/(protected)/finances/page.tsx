import type { Metadata } from "next";
import Link from "next/link";
import { deleteFinanceTransactionAction, createFinanceTransactionAction, updateFinanceTransactionAction } from "@/app/admin/(protected)/finances/actions";
import { requireSuperAdminSession } from "@/lib/admin/session";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

type FinanceEntry = {
  id: string;
  entry_type: "income" | "expense";
  category: string;
  amount_bdt: number;
  transaction_date: string;
  description: string;
  payment_method: string | null;
  external_ref: string | null;
  created_at: string;
};

const incomeCategories = [
  "Subscription Fees",
  "Fine Payments",
  "Book Sales",
  "Sponsorships",
  "Others",
] as const;

const expenseCategories = [
  "Book Purchases",
  "Web Hosting / Vercel",
  "Marketing",
  "Operations",
  "Maintenance",
] as const;

const paymentMethods = ["bKash", "Nagad", "Bank", "Cash", "Card", "Other"] as const;

function money(value: number): string {
  return `৳${Number(value).toLocaleString("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(value: string | null): string {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleDateString("en-BD", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dhaka" });
}

export const metadata: Metadata = { title: "Finance Management", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminFinancePage({ searchParams }: { searchParams?: Promise<{ status?: string; category?: string; type?: string; from?: string; to?: string; edit?: string }> }) {
  await requireSuperAdminSession();
  const params = await searchParams;
  const selectedCategory = params?.category ?? "all";
  const selectedType = params?.type === "expense" || params?.type === "income" ? params.type : "all";
  const startDate = params?.from ?? "";
  const endDate = params?.to ?? "";
  const editId = params?.edit ?? "";

  const client = createAdminSupabaseClient();
  let query = client.from("finance_transactions").select("id, entry_type, category, amount_bdt, transaction_date, description, payment_method, external_ref, created_at");
  if (selectedType !== "all") query = query.eq("entry_type", selectedType);
  if (selectedCategory !== "all") query = query.eq("category", selectedCategory);
  if (startDate) query = query.gte("transaction_date", startDate);
  if (endDate) query = query.lte("transaction_date", endDate);

  const { data: entries, error } = await query.order("transaction_date", { ascending: false }).limit(200);
  const rows = (entries ?? []) as FinanceEntry[];
  const totalRevenue = rows.filter((row) => row.entry_type === "income").reduce((sum, row) => sum + Number(row.amount_bdt), 0);
  const totalExpenses = rows.filter((row) => row.entry_type === "expense").reduce((sum, row) => sum + Number(row.amount_bdt), 0);
  const balance = totalRevenue - totalExpenses;
  const editingEntry = rows.find((row) => row.id === editId) ?? null;

  return (
    <main className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="eyebrow">Finance operations</p>
          <h1 className="display-font">Finance Management</h1>
        </div>
        <Link className="button-outline" href="/ashik-loves-jannat/audit">Business audit <span aria-hidden="true">→</span></Link>
      </header>

      {params?.status === "created" ? <p className="admin-flash-success" role="status">Finance transaction saved.</p> : null}
      {params?.status === "updated" ? <p className="admin-flash-success" role="status">Finance entry updated.</p> : null}
      {params?.status === "deleted" ? <p className="admin-flash-success" role="status">Transaction deleted.</p> : null}
      {params?.status === "error" ? <p className="admin-form-error" role="alert">The finance entry could not be saved. Verify the form inputs and try again.</p> : null}

      <section className="admin-stat-grid">
        <article className="admin-stat-card">
          <span>Total Revenue</span>
          <strong>{money(totalRevenue)}</strong>
        </article>
        <article className="admin-stat-card">
          <span>Total Expenses</span>
          <strong>{money(totalExpenses)}</strong>
        </article>
        <article className="admin-stat-card">
          <span>Net Cash Balance</span>
          <strong>{money(balance)}</strong>
        </article>
      </section>

      <section className="admin-recent-panel">
        <div className="admin-section-heading">
          <div>
            <p className="eyebrow">Entry</p>
            <h2 className="display-font">Add finance record</h2>
          </div>
        </div>

        <form action={createFinanceTransactionAction} className="admin-book-filters" method="post">
          <label>Type<select defaultValue="income" name="entryType"><option value="income">Income (+)</option><option value="expense">Expense (-)</option></select></label>
          <label>Category<select name="category">
            {incomeCategories.map((category) => <option key={category} value={category}>{category}</option>)}
            {expenseCategories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select></label>
          <label>Amount<input min="0.01" name="amount" required step="0.01" type="number" /></label>
          <label>Date<input name="transactionDate" required type="date" /></label>
          <label>Description<input maxLength={200} name="description" placeholder="e.g. August membership income" required type="text" /></label>
          <label>Payment Method<select name="paymentMethod">
            {paymentMethods.map((method) => <option key={method} value={method}>{method}</option>)}
          </select></label>
          <label>TXID / Receipt<input maxLength={120} name="externalRef" placeholder="Optional" type="text" /></label>
          <button className="button-primary" type="submit">Add entry</button>
        </form>
      </section>

      <section className="admin-recent-panel">
        <div className="admin-section-heading">
          <div>
            <p className="eyebrow">Filters</p>
            <h2 className="display-font">Ledger</h2>
          </div>
        </div>

        <form action="/ashik-loves-jannat/finances" className="admin-book-filters" method="get">
          <label>Type<select defaultValue={selectedType} name="type"><option value="all">All</option><option value="income">Income</option><option value="expense">Expense</option></select></label>
          <label>Category<select defaultValue={selectedCategory} name="category"><option value="all">All categories</option>{[...incomeCategories, ...expenseCategories].map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
          <label>From<input defaultValue={startDate} name="from" type="date" /></label>
          <label>To<input defaultValue={endDate} name="to" type="date" /></label>
          <button className="admin-action-button" type="submit">Apply filters</button>
        </form>

        {error ? <p className="admin-form-error" role="alert">The finance ledger could not be loaded. Refresh the page and try again.</p> : null}
        {rows.length ? (
          <div className="admin-table-wrap">
            <table className="admin-books-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Description</th>
                  <th>Ref</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((entry) => (
                  <tr key={entry.id}>
                    <td>{formatDate(entry.transaction_date)}</td>
                    <td><span className={`admin-status ${entry.entry_type === "income" ? "admin-status-available" : "admin-status-unavailable"}`}>{entry.entry_type === "income" ? "Income" : "Expense"}</span></td>
                    <td>{entry.category}</td>
                    <td>{entry.entry_type === "income" ? "+" : "-"}{money(Number(entry.amount_bdt))}</td>
                    <td>{entry.payment_method ?? "—"}</td>
                    <td>{entry.description}</td>
                    <td>{entry.external_ref ?? "—"}</td>
                    <td>
                      <div className="admin-fine-review">
                        <Link className="text-link" href={`/ashik-loves-jannat/finances?edit=${entry.id}`} prefetch={false}>Edit</Link>
                        <form action={deleteFinanceTransactionAction} method="post">
                          <input name="transactionId" type="hidden" value={entry.id} />
                          <button className="button-danger" type="submit">Delete</button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="admin-empty-note">No finance transactions match the current filters.</p>}
      </section>

      {editingEntry ? (
        <section className="admin-recent-panel">
          <div className="admin-section-heading">
            <div><p className="eyebrow">Edit record</p><h2 className="display-font">Update transaction</h2></div>
          </div>
          <form action={updateFinanceTransactionAction} className="admin-book-filters" method="post">
            <input name="transactionId" type="hidden" value={editingEntry.id} />
            <label>Type<select defaultValue={editingEntry.entry_type} name="entryType"><option value="income">Income (+)</option><option value="expense">Expense (-)</option></select></label>
            <label>Category<select defaultValue={editingEntry.category} name="category">
              {categoryOptions(editingEntry.entry_type).map((category) => <option key={category} value={category}>{category}</option>)}
            </select></label>
            <label>Amount<input defaultValue={Number(editingEntry.amount_bdt).toFixed(2)} min="0.01" name="amount" required step="0.01" type="number" /></label>
            <label>Date<input defaultValue={editingEntry.transaction_date} name="transactionDate" required type="date" /></label>
            <label>Description<input defaultValue={editingEntry.description} maxLength={200} name="description" required type="text" /></label>
            <label>Payment Method<select defaultValue={editingEntry.payment_method ?? paymentMethods[0]} name="paymentMethod">
              {paymentMethods.map((method) => <option key={method} value={method}>{method}</option>)}
            </select></label>
            <label>TXID / Receipt<input defaultValue={editingEntry.external_ref ?? ""} maxLength={120} name="externalRef" type="text" /></label>
            <button className="button-primary" type="submit">Update entry</button>
          </form>
        </section>
      ) : null}
    </main>
  );
}

function categoryOptions(type: "income" | "expense") {
  return type === "income" ? incomeCategories : expenseCategories;
}
