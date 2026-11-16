import type { Metadata } from "next";
import { requireAdminSession } from "@/lib/admin/session";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

type NotificationRecord = { id: string; type: string; title: string; status: "pending" | "sent" | "read" | "failed"; channel: "in_app" | "sms"; created_at: string };
type CountResult = { count: number | null; error: { message: string } | null };
type NotificationQueryClient = {
  from(table: "notifications"): {
    select(columns: string, options: { count: "exact"; head: true }): {
      eq(column: "status", value: string): PromiseLike<CountResult>;
    };
  };
};

export const metadata: Metadata = { title: "Notification Status", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const states = ["pending", "sent", "read", "failed"] as const;

function stateClass(status: string): string {
  if (status === "sent" || status === "read") return "admin-status admin-status-available";
  if (status === "pending") return "admin-status admin-status-limited";
  return "admin-status admin-status-unavailable";
}

export default async function AdminNotificationsPage() {
  await requireAdminSession();
  const client = createAdminSupabaseClient();
  const [recordsResult, ...counts] = await Promise.all([
    client.from("notifications").select("id, type, title, status, channel, created_at").order("created_at", { ascending: false }).limit(50) as unknown as Promise<{ data: NotificationRecord[] | null; error: { message: string } | null }>,
    ...states.map((status) => (client as unknown as NotificationQueryClient).from("notifications").select("id", { count: "exact", head: true }).eq("status", status)),
  ]);
  const countError = counts.some((result) => result.error);

  return (
    <main className="admin-page">
      <header className="admin-page-header"><div><p className="eyebrow">Task 10 notification system</p><h1 className="display-font">Notification Status</h1></div></header>
      <p className="admin-help-note">SMS notifications are sent through the configured SwiftSMS gateway by the scheduled job. A “sent” state means the gateway accepted the request, not that the handset confirmed delivery.</p>
      {recordsResult.error || countError ? <p className="admin-form-error" role="alert">Notification status could not be loaded.</p> : null}
      <section aria-label="Notification state counts" className="admin-stat-grid admin-notification-state-grid">
        {states.map((status, index) => <article className="admin-stat-card" key={status}><span>{status}</span><strong>{counts[index]?.error ? "—" : counts[index]?.count ?? 0}</strong></article>)}
      </section>
      <section className="admin-recent-panel"><div className="admin-section-heading"><div><p className="eyebrow">Recent events</p><h2 className="display-font">Latest notification records</h2></div></div>
        {recordsResult.data?.length ? <ul className="admin-recent-list">{recordsResult.data.map((record) => <li key={record.id}><div><strong>{record.title}</strong><span>{record.type.replaceAll("_", " ")} · {record.channel}</span><time dateTime={record.created_at}>{new Date(record.created_at).toLocaleString("en-BD", { dateStyle: "medium", timeStyle: "short" })}</time></div><span className={stateClass(record.status)}>{record.status}</span></li>)}</ul> : !recordsResult.error ? <p className="admin-empty-note">No notification records yet.</p> : null}
      </section>
    </main>
  );
}