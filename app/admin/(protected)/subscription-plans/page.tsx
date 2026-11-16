import Link from "next/link";
import { requireAdminSession } from "@/lib/admin/session";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminSubscriptionPlansPage() {
  await requireAdminSession();
  const client = createAdminSupabaseClient();
  const { data: plans } = await client
    .from("subscription_plans")
    .select("id, name, description, price_bdt, duration_days, is_active")
    .order("price_bdt", { ascending: true });

  return (
    <main className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="eyebrow">Membership settings</p>
          <h1 className="display-font">Subscription Plans</h1>
        </div>
        <Link className="button-primary" href="/ashik-loves-jannat">Back to dashboard</Link>
      </header>
      <p className="admin-help-note">Plans are shown from their stored records and remain separate from the one-time ৳99 membership activation fee. Plan edits are read-only here because no audited subscription-plan mutation action exists.</p>
      <section className="admin-recent-panel">
        {plans && plans.length > 0 ? (
          <ul className="admin-recent-list">
            {plans.map((plan) => (
              <li key={plan.id}>
                <div>
                  <strong>{plan.name}</strong>
                  <span>{plan.description}</span>
                </div>
                <div className="admin-plan-record"><span>৳{Number(plan.price_bdt).toLocaleString("en-BD")} / {plan.duration_days} days</span><span className={plan.is_active ? "admin-status admin-status-available" : "admin-status admin-status-unavailable"}>{plan.is_active ? "Active" : "Inactive"}</span></div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="admin-empty-note">No plans configured yet.</p>
        )}
      </section>
    </main>
  );
}
