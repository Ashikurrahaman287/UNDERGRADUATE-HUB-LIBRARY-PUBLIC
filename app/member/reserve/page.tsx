import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createBookReservationAction } from "@/app/member/reservations/actions";
import { MemberSubmitButton } from "@/components/member/member-submit-button";
import { requireMemberSession } from "@/lib/member/session";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

type BookLookup = { id: string; title: string; availability: "available" | "limited" | "unavailable"; is_active: boolean };
type ProfileLookup = { id: string; membership_status: string; current_plan_id: string | null; is_id_verified: boolean; id_card_url: string | null };
type SubscriptionLookup = { plan_id: string; status: string; ends_at: string | null };
type PlanLookup = { id: string; is_active: boolean };
type QueryResult<T> = { data: T | null; error: { message: string } | null };

export const metadata: Metadata = { title: "Reserve a Book", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

function validUuid(value: string): boolean {
  return /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
}

export default async function ReserveBookPage({ searchParams }: { searchParams?: Promise<{ bookId?: string }> }) {
  const params = await searchParams;
  const bookId = params?.bookId;
  if (!bookId || !validUuid(bookId)) redirect("/books");

  const session = await requireMemberSession(`/member/reserve?bookId=${encodeURIComponent(bookId)}`);
  const [bookResult, profileResult] = await Promise.all([
    createAdminSupabaseClient().from("books").select("id, title, availability, is_active").eq("id", bookId).maybeSingle() as unknown as Promise<QueryResult<BookLookup>>,
    session.supabase.from("member_profiles").select("id, membership_status, current_plan_id, is_id_verified, id_card_url").eq("user_id", session.user.id).maybeSingle() as unknown as Promise<QueryResult<ProfileLookup>>,
  ]);
  const book = bookResult.data;
  const profile = profileResult.data;
  if (!book || !book.is_active) redirect("/books");

  let eligible = false;
  let eligibilityLookupFailed = Boolean(bookResult.error || profileResult.error);
  if (profile?.membership_status === "active" && profile.is_id_verified && profile.id_card_url) {
    const subscriptionFilter = session.supabase.from("member_subscriptions")
      .select("plan_id, status, ends_at")
      .eq("member_id", profile.id)
      .eq("status", "active")
      .not("ends_at", "is", null)
      .gt("ends_at", new Date().toISOString());
    const currentSubscriptionFilter = profile.current_plan_id
      ? subscriptionFilter.eq("plan_id", profile.current_plan_id)
      : subscriptionFilter;
    const subscriptionResult = await (currentSubscriptionFilter.order("ends_at", { ascending: false })
      .limit(1)
      .maybeSingle() as unknown as Promise<QueryResult<SubscriptionLookup>>);
    const subscription = subscriptionResult.data;
    eligibilityLookupFailed ||= Boolean(subscriptionResult.error);
    const currentPlanMatches = Boolean(subscription && (!profile.current_plan_id || profile.current_plan_id === subscription.plan_id));

    if (subscription && currentPlanMatches) {
      const planId = profile.current_plan_id ?? subscription.plan_id;
      const planResult = await (session.supabase.from("subscription_plans")
        .select("id, is_active")
        .eq("id", planId)
        .maybeSingle() as unknown as Promise<QueryResult<PlanLookup>>);
      eligibilityLookupFailed ||= Boolean(planResult.error);
      eligible = planResult.data?.is_active === true;
    }
  }

  return (
    <main className="container member-page" id="main-content">
      <header className="member-page-heading"><p className="eyebrow">Reservation queue</p><h1 className="display-font">{book.title}</h1></header>
      {eligibilityLookupFailed ? <p className="member-form-message member-form-message-error" role="alert">Reservation eligibility could not be checked. Refresh to try again.</p> : null}
      {!profile ? <section className="member-panel"><h2>Complete your member profile</h2><p>A library profile is required to join a reservation queue.</p><Link className="button-primary" href="/member/register">Complete profile</Link></section> : null}
      {profile && profile.membership_status !== "active" ? <section className="member-panel"><h2>Active membership required</h2><p>Your membership status is <strong>{profile.membership_status}</strong>. Reservation access requires active membership and a current subscription.</p><Link className="text-link" href="/member/dashboard">View member status <span aria-hidden="true">→</span></Link></section> : null}
      {profile?.membership_status === "active" && (!profile.is_id_verified || !profile.id_card_url) ? <section className="member-panel"><h2>ID verification required</h2><p>Book requests are locked until your ID details and photo are approved.</p><Link className="button-primary" href="/member/dashboard#identity-verification">Complete verification in My Profile</Link></section> : null}
      {profile?.membership_status === "active" && profile.is_id_verified && profile.id_card_url && !eligible && !eligibilityLookupFailed ? <section className="member-panel"><h2>Current subscription required</h2><p>An active subscription for your current plan is required to reserve a book.</p><Link className="text-link" href="/member/dashboard#membership">View subscription status <span aria-hidden="true">→</span></Link></section> : null}

      {eligible && book.availability === "available" ? <section className="member-panel"><h2>This book is available</h2><p>You can request it through the rental review process.</p><Link className="button-primary" href={`/member/rent?bookId=${book.id}`}>Continue to rental request</Link></section> : null}
      {eligible && book.availability !== "available" ? (
        <section className="member-panel">
          <h2>Join the reservation queue</h2>
          <p>Current availability: <strong>{book.availability}</strong>. Requests are ordered by the authoritative FIFO queue; members cannot choose or change their position.</p>
          <form action={createBookReservationAction}><input name="bookId" type="hidden" value={book.id} /><MemberSubmitButton pendingLabel="Adding reservation…">Join reservation queue</MemberSubmitButton></form>
        </section>
      ) : null}
      <p><Link className="text-link" href="/member/reservations">View my reservations <span aria-hidden="true">→</span></Link></p>
    </main>
  );
}