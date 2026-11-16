import type { Metadata } from "next";
import { cancelBookReservationAction } from "@/app/member/reservations/actions";
import { MemberSubmitButton } from "@/components/member/member-submit-button";
import { createMemberSupabaseServerClient, requireMemberSession } from "@/lib/member/session";

type MemberReservationsClient = {
  rpc(functionName: "get_my_book_reservations", args: Record<never, never>): Promise<{
    data: {
      reservation_id: string;
      book_id: string;
      book_title: string;
      status: "waiting" | "notified" | "fulfilled" | "cancelled" | "expired";
      requested_at: string;
      queue_position: number | null;
    }[] | null;
    error: { message: string } | null;
  }>;
};

export const metadata: Metadata = {
  title: "My Reservations",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function MemberReservationsPage({ searchParams }: { searchParams?: Promise<{ created?: string; cancelled?: string }> }) {
  await requireMemberSession("/member/reservations");
  const client = await createMemberSupabaseServerClient() as unknown as MemberReservationsClient;
  const { data: reservations, error } = await client.rpc("get_my_book_reservations", {});
  const params = await searchParams;

  return (
    <main className="container member-form-page-shell" id="main-content">
      <header className="member-reservations-heading">
        <p className="eyebrow">Member portal</p>
        <h1 className="display-font">My Reservations</h1>
      </header>
      {params?.created ? <p className="member-form-message member-form-message-success" role="status">Your reservation was added to the queue.</p> : null}
      {params?.cancelled ? <p className="member-form-message member-form-message-success" role="status">Your reservation was cancelled.</p> : null}
      {error ? <p role="alert">Your reservations could not be loaded. Refresh to try again.</p> : null}
      {!error && (!reservations || reservations.length === 0) ? <p>You have no book reservations.</p> : null}
      {reservations && reservations.length > 0 ? (
        <ul className="admin-recent-list">
          {reservations.map((reservation) => (
            <li key={reservation.reservation_id}>
              <div>
                <strong>{reservation.book_title}</strong>
                <span>{reservation.status}</span>
                {reservation.queue_position ? <span>Queue position {reservation.queue_position}</span> : null}
                <time dateTime={reservation.requested_at}>{new Date(reservation.requested_at).toLocaleDateString("en-BD", { day: "numeric", month: "short", year: "numeric" })}</time>
              </div>
              {reservation.status === "waiting" || reservation.status === "notified" ? (
                <form action={cancelBookReservationAction}>
                  <input name="reservationId" type="hidden" value={reservation.reservation_id} />
                  <MemberSubmitButton className="button-outline" pendingLabel="Cancelling…">Cancel reservation</MemberSubmitButton>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}
