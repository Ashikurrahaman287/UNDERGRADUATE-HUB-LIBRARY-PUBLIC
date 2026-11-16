import type { Metadata } from "next";
import Link from "next/link";
import { AdminSubmitButton } from "@/components/admin/admin-submit-button";
import { assignMemberRentalPlanAction } from "@/app/admin/(protected)/manual-approved-members/actions";
import { requireAdminSession } from "@/lib/admin/session";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

type Member = { id: string; full_name: string; phone: string; email: string | null; created_at: string };
type Plan = { id: string; name: string; price_bdt: number; duration_days: number };
type QueryResult<T> = { data: T | null; error: { message: string } | null; count?: number | null };

export const metadata: Metadata = { title: "Manual Approved Members", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const pageSize = 30;

function pageHref(page: number): string {
  return `/ashik-loves-jannat/manual-approved-members?page=${page}`;
}

export default async function ManualApprovedMembersPage({ searchParams }: { searchParams?: Promise<{ page?: string; assign?: string }> }) {
  await requireAdminSession();
  const params = await searchParams;
  const parsedPage = Number(params?.page ?? "1");
  const currentPage = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const client = createAdminSupabaseClient();
  const start = (currentPage - 1) * pageSize;
  const [memberResult, planResult] = await Promise.all([
    client.from("member_profiles")
      .select("id, full_name, phone, email, created_at", { count: "exact" })
      .eq("membership_status", "active")
      .is("current_plan_id", null)
      .order("created_at", { ascending: false })
      .range(start, start + pageSize - 1) as unknown as Promise<QueryResult<Member[]>>,
    client.from("subscription_plans")
      .select("id, name, price_bdt, duration_days")
      .eq("is_active", true)
      .eq("duration_days", 30)
      .in("price_bdt", [29, 49])
      .order("price_bdt", { ascending: true }) as unknown as Promise<QueryResult<Plan[]>>,
  ]);
  const members = memberResult.data ?? [];
  const plans = planResult.data ?? [];
  const totalPages = Math.max(1, Math.ceil((memberResult.count ?? 0) / pageSize));

  return (
    <main className="admin-page">
      <header className="admin-page-header"><div><p className="eyebrow">Rental plan assignment</p><h1 className="display-font">Manual Approved Members</h1></div></header>
      {params?.assign === "assigned" ? <p className="admin-flash-success" role="status">Rental plan assigned. The member can now submit their subscription payment.</p> : null}
      {params?.assign === "already_assigned" ? <p className="admin-help-note" role="status">This member already has a rental plan assigned.</p> : null}
      {params?.assign === "error" ? <p className="admin-form-error" role="alert">The plan could not be assigned. Confirm the member is still active and the plan is available.</p> : null}
      <p className="admin-help-note">Active members without a selected rental plan appear here. Choose an active 30-day plan; the subscription period begins only after the member submits payment and the library approves it.</p>
      {memberResult.error ? <p className="admin-form-error" role="alert">Member records could not be loaded. Refresh to try again.</p> : null}
      {planResult.error ? <p className="admin-form-error" role="alert">Rental plans could not be loaded. Refresh before assigning a plan.</p> : null}
      <section className="admin-recent-panel">
        {members.length ? <ul className="admin-recent-list">{members.map((member) => <li key={member.id}>
          <div><strong>{member.full_name}</strong><span>{member.phone} · {member.email ?? "No email"}</span><time dateTime={member.created_at}>Joined {new Date(member.created_at).toLocaleDateString("en-BD", { day: "numeric", month: "short", year: "numeric" })}</time><span>No rental plan assigned</span></div>
          <form action={assignMemberRentalPlanAction} className="admin-membership-extension">
            <input name="memberId" type="hidden" value={member.id} />
            <label htmlFor={`rental-plan-${member.id}`}>Assign Rental Plan</label>
            <select defaultValue="" id={`rental-plan-${member.id}`} name="planId" required>
              <option value="" disabled>Select 30-day plan</option>
              {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · ৳{Number(plan.price_bdt).toLocaleString("en-BD")} / {plan.duration_days} days</option>)}
            </select>
            <AdminSubmitButton disabled={!plans.length || Boolean(planResult.error)} pendingLabel="Assigning…">Assign Plan</AdminSubmitButton>
          </form>
        </li>)}</ul> : !memberResult.error ? <p className="admin-empty-note">No active members are missing a rental plan.</p> : null}
      </section>
      <nav aria-label="Manual approved member pages" className="admin-pagination"><span>Page {currentPage} of {totalPages} · {memberResult.count ?? 0} members</span>{currentPage > 1 ? <Link className="admin-action-button" href={pageHref(currentPage - 1)}>Previous</Link> : null}{currentPage < totalPages ? <Link className="admin-action-button" href={pageHref(currentPage + 1)}>Next</Link> : null}</nav>
    </main>
  );
}