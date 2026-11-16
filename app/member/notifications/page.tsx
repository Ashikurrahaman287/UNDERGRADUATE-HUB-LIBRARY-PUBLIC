import type { Metadata } from "next";
import Link from "next/link";
import { markMemberNotificationReadAction } from "@/app/member/notifications/actions";
import { MemberSubmitButton } from "@/components/member/member-submit-button";
import { createMemberSupabaseServerClient, requireMemberSession } from "@/lib/member/session";

type MemberNotification = {
  id: string;
  type: "membership_submitted" | "membership_approved" | "membership_rejected" | "rental_submitted" | "rental_approved" | "rental_rejected" | "book_issued" | "book_returned" | "rental_due" | "rental_overdue" | "subscription_activated" | "subscription_expiring" | "subscription_expired" | "reservation_available" | "fine_created" | "payment_approved" | "payment_rejected";
  title: string;
  message: string;
  status: "pending" | "sent" | "read" | "failed";
  created_at: string;
  read_at: string | null;
};

type MemberNotificationQueryClient = {
  from(table: "notifications"): {
    select(columns: "id, type, title, message, status, created_at, read_at"): {
      order(column: "created_at", options: { ascending: boolean }): {
        limit(count: number): PromiseLike<{ data: MemberNotification[] | null; error: { message: string } | null }>;
      };
    };
  };
};

export const metadata: Metadata = {
  title: "Notifications",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function destinationFor(type: MemberNotification["type"]): string {
  if (type === "reservation_available") return "/books";
  if (type === "membership_submitted" || type === "membership_rejected" || type === "payment_approved" || type === "payment_rejected") return "/member/apply";
  if (type.startsWith("rental_") || type === "book_issued" || type === "book_returned") return "/member/dashboard#rentals";
  if (type === "fine_created") return "/member/dashboard#payments";
  if (type.startsWith("subscription_") || type === "membership_approved") return "/member/dashboard#membership";
  return "/member/dashboard";
}

export default async function MemberNotificationsPage() {
  await requireMemberSession("/member/notifications");
  const client = await createMemberSupabaseServerClient() as unknown as MemberNotificationQueryClient;
  const { data: notifications, error } = await client
    .from("notifications")
    .select("id, type, title, message, status, created_at, read_at")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <main className="container member-page" id="main-content">
      <header className="member-notifications-heading">
        <p className="eyebrow">Member portal</p>
        <h1 className="display-font">Notifications</h1>
      </header>
      {error ? <p role="alert">Notifications could not be loaded. Refresh to try again.</p> : null}
      {!error && (!notifications || notifications.length === 0) ? (
        <p>You have no notifications yet.</p>
      ) : null}
      {notifications && notifications.length > 0 ? (
        <ul className="admin-recent-list">
          {notifications.map((notification) => (
            <li key={notification.id}>
              <div>
                <strong>{notification.title}</strong>
                <span>{notification.message}</span>
                <time dateTime={notification.created_at}>{new Date(notification.created_at).toLocaleString("en-BD", { dateStyle: "medium", timeStyle: "short" })}</time>
                <span aria-label={notification.read_at ? "Read" : "Unread"}>{notification.read_at ? "Read" : "Unread"}</span>
              </div>
              <div className="member-notification-actions">
                <Link className="text-link" href={destinationFor(notification.type)}>View</Link>
                {!notification.read_at ? (
                  <form action={markMemberNotificationReadAction}>
                    <input name="notificationId" type="hidden" value={notification.id} />
                    <MemberSubmitButton className="button-outline" pendingLabel="Marking read…">Mark as read</MemberSubmitButton>
                  </form>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}
