import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { RentalRequestForm } from "@/components/member/rental-request-form";
import { requireMemberSession } from "@/lib/member/session";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

type BookLookup = { id: string; title: string; availability: "available" | "limited" | "unavailable"; is_active: boolean };
type ProfileLookup = { id: string; membership_status: string; current_plan_id: string | null; is_id_verified: boolean; verification_status: "PENDING" | "APPROVED" | "REJECTED"; id_card_url: string | null };
type SubscriptionLookup = { id: string; plan_id: string; status: string; ends_at: string | null };
type PlanLookup = { id: string; name: string; price_bdt: number; duration_days: number; is_active: boolean };

type QueryResult<T> = { data: T | null; error: { message: string } | null };

export const metadata: Metadata = { title: "Request a Rental", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

function validUuid(value: string): boolean {
  return /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
}

export default async function MemberRentPage({ searchParams }: { searchParams?: Promise<{ bookId?: string }> }) {
  const params = await searchParams;
  const bookId = params?.bookId;
  if (!bookId || !validUuid(bookId)) redirect("/books");

  const session = await requireMemberSession(`/member/rent?bookId=${encodeURIComponent(bookId)}`);
  const client = session.supabase;
  const [bookResult, profileResult] = await Promise.all([
    createAdminSupabaseClient().from("books").select("id, title, availability, is_active").eq("id", bookId).maybeSingle() as unknown as Promise<QueryResult<BookLookup>>,
    client.from("member_profiles").select("id, membership_status, current_plan_id, is_id_verified, verification_status, id_card_url").eq("user_id", session.user.id).maybeSingle() as unknown as Promise<QueryResult<ProfileLookup>>,
  ]);
  const book = bookResult.data;
  const profile = profileResult.data;

  if (!book || !book.is_active) redirect("/books");

  let subscription: SubscriptionLookup | null = null;
  let plan: PlanLookup | null = null;
  let eligibilityLookupFailed = Boolean(bookResult.error || profileResult.error);
  let hasOutstandingFines = false;
  const currentTime = new Date().toISOString();

  if (profile) {
    const fineResult = await client.from("fine_ledger").select("id").eq("member_id", profile.id).eq("status", "outstanding").limit(1).maybeSingle();
    hasOutstandingFines = Boolean(fineResult.data);
    eligibilityLookupFailed ||= Boolean(fineResult.error);
    let subscriptionQuery = client.from("member_subscriptions")
      .select("id, plan_id, status, ends_at")
      .eq("member_id", profile.id);
    if (profile.current_plan_id) subscriptionQuery = subscriptionQuery.eq("plan_id", profile.current_plan_id);
    const subscriptionResult = await (subscriptionQuery
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle() as unknown as Promise<QueryResult<SubscriptionLookup>>);
    subscription = subscriptionResult.data;
    eligibilityLookupFailed ||= Boolean(subscriptionResult.error);

    const planId = profile.current_plan_id ?? subscription?.plan_id;
    if (planId) {
      const planResult = await (client.from("subscription_plans")
        .select("id, name, price_bdt, duration_days, is_active")
        .eq("id", planId)
        .maybeSingle() as unknown as Promise<QueryResult<PlanLookup>>);
      plan = planResult.data;
      eligibilityLookupFailed ||= Boolean(planResult.error);
    }
  }

  const subscriptionIsActive = Boolean(subscription?.status === "active" && subscription.ends_at && subscription.ends_at > currentTime);
  const identityVerified = Boolean(profile?.is_id_verified && profile.verification_status === "APPROVED" && profile.id_card_url);
  const canBorrow = profile?.membership_status === "active"
    && identityVerified
    && !hasOutstandingFines
    && plan?.is_active === true
    && plan.duration_days === 30;

  return (
    <main className="container member-page" id="main-content">
      <header className="member-page-heading"><p className="eyebrow">Borrow from the collection</p><h1 className="display-font">{book.title}</h1></header>
      {eligibilityLookupFailed ? <p className="member-form-message member-form-message-error" role="alert">Current borrowing eligibility could not be checked. Refresh to try again.</p> : null}

      {!profile ? <section className="member-panel"><h2>Complete your member profile</h2><p>A library profile is required before borrowing.</p><Link className="button-primary" href="/member/register">Complete profile</Link></section> : null}
      {profile && profile.membership_status !== "active" ? <section aria-labelledby="active-membership-required" className="member-panel member-verification-required" role="alert"><h2 id="active-membership-required">Active Membership Required</h2><p>Active Membership Required: You need an active Undergraduate Hub membership to rent books.</p><Link className="button-primary" href="/member/apply">Get Membership</Link></section> : null}
      {profile?.membership_status === "active" && !identityVerified ? <section aria-labelledby="rental-id-required" className="member-panel member-verification-required" role="alert"><h2 id="rental-id-required">ID verification required</h2><p>Book requests are locked until your Student ID or NID is approved by an admin.</p><Link className="button-primary" href="/member/dashboard#identity-verification">Verify ID Now</Link></section> : null}
      {profile?.membership_status === "active" && hasOutstandingFines ? <section className="member-panel"><h2>Outstanding overdue fees</h2><p>Pay with bKash or Nagad when submitting your return request. New rental requests unlock after the library verifies payment.</p><Link className="button-primary" href="/member/dashboard/my-books">Go to My Rented Books</Link></section> : null}
      {profile?.membership_status === "active" && !plan ? <section className="member-panel"><h2>Rental plan unavailable</h2><p>An active 30-day plan is required to submit a rental request.</p><Link className="text-link" href="/member/dashboard#membership">View subscription details <span aria-hidden="true">→</span></Link></section> : null}
      {profile?.membership_status === "active" && plan && subscription && !subscriptionIsActive && !eligibilityLookupFailed ? <section className="member-panel"><h2>Active Membership Required</h2><p>Your 30-day membership subscription has expired. Renew it before requesting books.</p><Link className="button-primary" href="/member/dashboard/payments">Renew Membership</Link></section> : null}

      {canBorrow && book.availability !== "available" ? (
        <section className="member-panel"><h2>This book is not available to borrow now</h2><p>Availability: <strong>{book.availability}</strong>. The reservation queue uses the library’s FIFO rules.</p><Link className="button-primary" href={`/member/reserve?bookId=${book.id}`}>View reservation options</Link></section>
      ) : null}

      {canBorrow && book.availability === "available" && !subscriptionIsActive && !subscription && !eligibilityLookupFailed ? (
        <section className="member-panel member-application-panel">
          <div className="member-panel-heading"><div><p className="eyebrow">First rental subscription</p><h2>Start your first 30-day cycle</h2></div></div>
          <p>Your membership is verified. Send the exact subscription fee using bKash or Nagad. Your 30-day subscription starts after the library verifies your 10-character TrxID.</p>
          <RentalRequestForm bookId={book.id} firstSubscriptionPrice={plan ? Number(plan.price_bdt) : null} />
        </section>
      ) : null}

      {canBorrow && subscriptionIsActive && book.availability === "available" ? (
        <section className="member-panel member-application-panel">
          <div className="member-panel-heading"><div><p className="eyebrow">Rental request</p><h2>Submit for administrator review</h2></div></div>
          {plan && subscription?.ends_at ? <p>Current subscription: <strong>{plan.name}</strong> · ৳{Number(plan.price_bdt).toLocaleString("en-BD")} for 30 days, covering multiple books with no additional per-book fee. Ends {new Date(subscription.ends_at).toLocaleDateString("en-BD", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dhaka" })}.</p> : null}
          <p className="member-field-note">A rental request does not require another payment. Approved books must be handed over before the subscription ends.</p>
          {eligibilityLookupFailed ? <p className="member-form-message member-form-message-error" role="alert">Your subscription eligibility could not be checked. Refresh before submitting.</p> : plan ? <RentalRequestForm bookId={book.id} firstSubscriptionPrice={null} /> : null}
        </section>
      ) : null}
      <p><Link className="text-link" href="/member/dashboard">Back to member dashboard <span aria-hidden="true">→</span></Link></p>
    </main>
  );
}