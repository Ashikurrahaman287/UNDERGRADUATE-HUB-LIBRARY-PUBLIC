import type { Metadata } from "next";
import Link from "next/link";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { createMemberSupabaseServerClient, requireMemberSession } from "@/lib/member/session";
import { decryptMemberPii } from "@/lib/security/pii";
import { MemberIdVerificationForm } from "@/components/member/member-id-verification-form";
import { MemberIdPhotoDialog } from "@/components/member/member-id-photo-dialog";
import type { MemberIdType } from "@/lib/member/id-verification";

type MemberProfile = {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  address: string | null;
  id_type: MemberIdType | null;
  id_number: string | null;
  dob: string | null;
  institution_name: string | null;
  id_card_url: string | null;
  id_verification_submitted_at: string | null;
  is_id_verified: boolean;
  verification_status: "PENDING" | "APPROVED" | "REJECTED";
  rejection_reason: string | null;
  membership_status: "pending" | "active" | "rejected" | "suspended";
  current_plan_id: string | null;
};

type MemberSubscription = {
  id: string;
  plan_id: string;
  plan_name_snapshot: string;
  plan_price_snapshot: number;
  status: "pending" | "active" | "expired" | "cancelled";
  started_at: string;
  ends_at: string | null;
};

type MembershipApplication = {
  id: string;
  status: "pending" | "approved" | "rejected";
  amount_bdt: number;
  submitted_at: string;
};

type PaymentSubmission = {
  id: string;
  payment_type: "membership" | "rental" | "renewal" | "fine";
  status: "pending" | "approved" | "rejected";
  amount_bdt: number;
  payment_method: "bkash" | "nagad";
  submitted_at: string;
};

type RentalRequest = {
  id: string;
  book_id: string;
  status: "pending" | "approved" | "rejected";
  requested_at: string;
  amount_bdt: number;
};

type Rental = {
  id: string;
  book_id: string;
  status: "pending" | "active" | "overdue" | "returned" | "cancelled";
  started_at: string | null;
  subscription_ends_at: string | null;
  returned_at: string | null;
};

type Fine = {
  id: string;
  amount_bdt: number;
  fine_date: string;
  status: "outstanding" | "paid" | "waived";
};

type Notification = {
  id: string;
  type: string;
  title: string;
  message: string;
  read_at: string | null;
  created_at: string;
};

type MemberQueryResult<T> = { data: T | null; error: { message: string } | null };
type OwnReservationsResult = {
  data: { reservation_id: string; book_id: string; book_title: string; status: string; requested_at: string; queue_position: number | null }[] | null;
  error: { message: string } | null;
};

export const metadata: Metadata = { title: "Member Dashboard", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

function formatDate(value: string | null): string {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleDateString("en-BD", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dhaka" });
}

function formatMoney(value: number): string {
  return `৳${Number(value).toLocaleString("en-BD", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function statusClass(status: string): string {
  if (["active", "approved", "returned", "paid", "fulfilled", "verified"].includes(status)) return "member-status member-status-positive";
  if (["pending", "waiting", "notified"].includes(status)) return "member-status member-status-pending";
  if (["rejected", "expired", "overdue", "outstanding", "suspended", "cancelled"].includes(status)) return "member-status member-status-attention";
  return "member-status";
}

function Status({ value }: { value: string }) {
  return <span className={statusClass(value)}>{value.replaceAll("_", " ")}</span>;
}

export default async function MemberDashboardPage() {
  const session = await requireMemberSession("/member/dashboard");
  const client = await createMemberSupabaseServerClient();
  const profileResult = await (client
    .from("member_profiles")
    .select("id, full_name, phone, email, address, id_type, id_number, dob, institution_name, id_card_url, id_verification_submitted_at, is_id_verified, verification_status, rejection_reason, membership_status, current_plan_id")
    .eq("user_id", session.user.id)
    .maybeSingle() as unknown as PromiseLike<MemberQueryResult<MemberProfile>>);
  const profile = profileResult.data ? decryptMemberPii(profileResult.data) : null;

  if (profileResult.error) {
    return <main className="container member-page" id="main-content"><p className="member-form-message member-form-message-error" role="alert">Your member account could not be loaded. Refresh to try again.</p></main>;
  }

  if (!profile) {
    return (
      <main className="container member-page" id="main-content">
        <header className="member-page-heading"><p className="eyebrow">Member area</p><h1 className="display-font">Complete your library profile</h1></header>
        <p>Sign-in is active, but there is no member profile associated with this account yet.</p>
        <Link className="button-primary" href="/member/register">Complete profile</Link>
      </main>
    );
  }

  const identityApproved = profile.is_id_verified || profile.verification_status === "APPROVED";
  const hasSubmittedIdentity = profile.verification_status === "PENDING" && !identityApproved && Boolean(profile.id_card_url);
  const identityRejected = profile.verification_status === "REJECTED" && !profile.is_id_verified;
  const identityPhotoPath = profile.id_card_url;
  const identityPhotoRequest = identityPhotoPath
    && identityPhotoPath.startsWith(`member-ids/${profile.id}/`)
    && !identityPhotoPath.includes("..")
    ? client.storage.from("member-ids").createSignedUrl(identityPhotoPath, 300)
    : Promise.resolve({ data: null, error: null });

  const reservationRpcClient = client as unknown as {
    rpc(functionName: "get_my_book_reservations", args: Record<never, never>): Promise<OwnReservationsResult>;
  };

  const [subscriptionResult, applicationResult, paymentResult, requestResult, rentalResult, fineResult, notificationResult, reservationResult, settingsResult, fineRateResult, identityPhotoResult] = await Promise.all([
    client.from("member_subscriptions").select("id, plan_id, plan_name_snapshot, plan_price_snapshot, status, started_at, ends_at").eq("member_id", profile.id).order("started_at", { ascending: false }).limit(10) as unknown as PromiseLike<MemberQueryResult<MemberSubscription[]>>,
    client.from("membership_applications").select("id, status, amount_bdt, submitted_at").eq("member_id", profile.id).order("submitted_at", { ascending: false }).limit(1) as unknown as PromiseLike<MemberQueryResult<MembershipApplication[]>>,
    client.from("payment_submissions").select("id, payment_type, status, amount_bdt, payment_method, submitted_at").eq("member_id", profile.id).order("submitted_at", { ascending: false }).limit(6) as unknown as PromiseLike<MemberQueryResult<PaymentSubmission[]>>,
    client.from("rental_requests").select("id, book_id, status, requested_at, amount_bdt").eq("member_id", profile.id).order("requested_at", { ascending: false }).limit(6) as unknown as PromiseLike<MemberQueryResult<RentalRequest[]>>,
    client.from("rentals").select("id, book_id, status, started_at, subscription_ends_at, returned_at").eq("member_id", profile.id).order("started_at", { ascending: false }).limit(10) as unknown as PromiseLike<MemberQueryResult<Rental[]>>,
    client.from("fine_ledger").select("id, amount_bdt, fine_date, status").eq("member_id", profile.id).order("fine_date", { ascending: false }).limit(10) as unknown as PromiseLike<MemberQueryResult<Fine[]>>,
    client.from("notifications").select("id, type, title, message, read_at, created_at").order("created_at", { ascending: false }).limit(3) as unknown as PromiseLike<MemberQueryResult<Notification[]>>,
    reservationRpcClient.rpc("get_my_book_reservations", {}),
    createAdminSupabaseClient().from("library_settings").select("value_number").eq("key", "membership_fee_bdt").maybeSingle() as unknown as PromiseLike<MemberQueryResult<{ value_number: number | null }>>,
    createAdminSupabaseClient().from("library_settings").select("value_number").eq("key", "fine_per_day_bdt").maybeSingle() as unknown as PromiseLike<MemberQueryResult<{ value_number: number | null }>>,
    identityPhotoRequest,
  ]);
  const identityPhotoUrl = identityPhotoResult.error ? null : identityPhotoResult.data?.signedUrl ?? null;
  const subscriptions = subscriptionResult.data ?? [];
  const currentTime = new Date().toISOString();
  const subscription = subscriptions.find((item) => item.status === "active" && item.ends_at !== null && item.ends_at > currentTime && (!profile.current_plan_id || item.plan_id === profile.current_plan_id))
    ?? subscriptions.find((item) => !profile.current_plan_id || item.plan_id === profile.current_plan_id)
    ?? subscriptions[0]
    ?? null;
  const subscriptionIsCurrent = Boolean(subscription?.status === "active" && subscription.ends_at && subscription.ends_at > currentTime);
  const application = applicationResult.data?.[0] ?? null;
  const payments = paymentResult.data ?? [];
  const rentalRequests = requestResult.data ?? [];
  const rentals = rentalResult.data ?? [];
  const fines = fineResult.data ?? [];
  const notifications = notificationResult.data ?? [];
  const reservations = reservationResult.data ?? [];
  const latestMembershipPayment = payments.find((payment) => payment.payment_type === "membership");
  const membershipFee = settingsResult.data?.value_number ?? null;
  const dailyFineRate = fineRateResult.data?.value_number ?? null;

  const bookIds = [...new Set([...rentals.map((rental) => rental.book_id), ...rentalRequests.map((request) => request.book_id)])];
  const bookTitles = new Map<string, string>();
  if (bookIds.length > 0) {
    const { data: books } = await (client.from("books").select("id, title").in("id", bookIds) as unknown as PromiseLike<MemberQueryResult<{ id: string; title: string }[]>>);
    for (const book of books ?? []) bookTitles.set(book.id, book.title);
  }

  return (
    <main className="container member-page" id="main-content">
      <header className="member-dashboard-heading">
        <div><p className="eyebrow">Undergraduate Hub Library · Member area</p><h1 className="display-font">Welcome, {profile.full_name.split(/\s+/)[0]}</h1><p>Stories to escape into. Ideas to live by.</p></div>
        <Link className="button-outline" href="/books">Browse books <span aria-hidden="true">→</span></Link>
      </header>
      <nav aria-label="Member dashboard pages" className="member-dashboard-tabs">
        <Link href="/member/dashboard/my-books">My Rented Books</Link>
        <Link href="/member/dashboard/payments">Payments &amp; Subscription</Link>
        <Link href="/member/dashboard/referrals">Refer &amp; Earn</Link>
      </nav>
      {!identityApproved || !profile.id_card_url ? <p className="member-form-message member-form-message-error" role="alert">ID verification is required before you can request a book. <Link href="/member/dashboard#identity-verification">Complete verification in My Profile</Link>.</p> : null}

      <div className="member-dashboard-grid">
        <section className="member-panel" id="account" aria-labelledby="account-heading">
          <div className="member-panel-heading"><div><p className="eyebrow">Account</p><h2 id="account-heading">Your profile</h2></div><Status value={profile.membership_status} /></div>
          <dl className="member-data-list"><div><dt>Name</dt><dd>{profile.full_name}</dd></div><div><dt>Phone</dt><dd>{profile.phone}</dd></div><div><dt>Email</dt><dd>{profile.email || "Not provided"}</dd></div><div><dt>Address</dt><dd>{profile.address || "Not provided"}</dd></div></dl>
          <Link className="text-link" href="/member/register">Edit personal information <span aria-hidden="true">→</span></Link>
        </section>

        <section className="member-panel member-panel-wide" id="identity-verification" aria-labelledby="identity-verification-heading">
          <div className="member-panel-heading"><div><p className="eyebrow">My Profile</p><h2 id="identity-verification-heading">ID verification</h2></div><Status value={identityApproved && profile.id_card_url ? "verified" : hasSubmittedIdentity ? "pending review" : identityRejected ? "rejected" : "required"} /></div>
          {identityApproved ? <>
            <div className="member-form-message member-form-message-success" role="status"><span className="member-status member-status-positive"><span aria-hidden="true">✓</span> Verified</span><p>Your identity has been verified. To request updates to your verified credentials, please <Link href="/contact">contact support</Link>.</p></div>
            <div className="member-id-verified-summary">
              <dl className="member-data-list">
                <div><dt>ID type</dt><dd>{profile.id_type ?? "Not recorded"}</dd></div>
                <div><dt>ID number</dt><dd>{profile.id_number ?? "Not recorded"}</dd></div>
                {profile.id_type === "Student ID" ? <div><dt>Institution</dt><dd>{profile.institution_name ?? "Not recorded"}</dd></div> : null}
                {profile.id_type === "NID" ? <>
                  <div><dt>Date of birth</dt><dd>{formatDate(profile.dob)}</dd></div>
                  <div><dt>Address</dt><dd>{profile.address ?? "Not recorded"}</dd></div>
                </> : null}
                <div><dt>Submitted</dt><dd>{formatDate(profile.id_verification_submitted_at)}</dd></div>
              </dl>
              {identityPhotoUrl ? <MemberIdPhotoDialog photoUrl={identityPhotoUrl} triggerLabel="View verified ID photo" /> : <p className="member-field-note">The private ID photo is currently unavailable.</p>}
            </div>
          </> : hasSubmittedIdentity ? <>
            <div className="member-form-message member-form-message-pending" role="status">
              <span className="member-status member-status-pending">Verification Pending</span>
              <p>Your ID documents have been submitted and are currently being reviewed by our admin team. You cannot edit or re-upload documents while a review is pending.</p>
            </div>
            <div className="member-id-verified-summary">
              <dl className="member-data-list">
                <div><dt>ID type</dt><dd>{profile.id_type ?? "Not recorded"}</dd></div>
                <div><dt>ID number</dt><dd>{profile.id_number ?? "Not recorded"}</dd></div>
                {profile.id_type === "Student ID" ? <div><dt>Institution</dt><dd>{profile.institution_name ?? "Not recorded"}</dd></div> : null}
                {profile.id_type === "NID" ? <>
                  <div><dt>Date of birth</dt><dd>{formatDate(profile.dob)}</dd></div>
                  <div><dt>Address</dt><dd>{profile.address ?? "Not recorded"}</dd></div>
                </> : null}
                <div><dt>Submitted</dt><dd>{formatDate(profile.id_verification_submitted_at)}</dd></div>
              </dl>
              {identityPhotoUrl ? <MemberIdPhotoDialog photoUrl={identityPhotoUrl} triggerLabel="View submitted ID photo" /> : <p className="member-field-note">The private ID photo is currently unavailable.</p>}
            </div>
          </> : <>
            {identityRejected ? <div className="member-form-message member-form-message-error" role="alert"><span className="member-status member-status-attention">Verification Failed</span><p>{profile.rejection_reason ?? "Please review your details and submit a new photo."}</p></div> : <p className="member-field-note">Submit a clear photo of your Student ID or NID. Your information will remain private and read-only while it is under review.</p>}
            <MemberIdVerificationForm address={profile.address} dob={profile.dob} fullName={profile.full_name} idCardPath={profile.id_card_url} idNumber={profile.id_number} idType={profile.id_type} institutionName={profile.institution_name} key={[profile.full_name, profile.address, profile.id_type, profile.id_number, profile.dob, profile.institution_name, profile.id_card_url, profile.verification_status].join("|")} requireNewPhoto={identityRejected} submitLabel={identityRejected ? "Re-submit Verification Documents" : "Submit ID documents for verification"} />
          </>}
        </section>

        <section className="member-panel" id="membership" aria-labelledby="membership-heading">
          <div className="member-panel-heading"><div><p className="eyebrow">Membership</p><h2 id="membership-heading">Application and subscription</h2></div></div>
          <p className="member-inline-status">Application: {applicationResult.error ? <span>Status unavailable</span> : application ? application.status === "pending" ? <span className="member-status member-status-pending">Pending Verification</span> : <Status value={application.status} /> : <span>Not submitted</span>}</p>
          {application ? <p className="member-muted">Submitted {formatDate(application.submitted_at)} · {formatMoney(application.amount_bdt)} one-time activation fee</p> : <p className="member-muted">Initial membership activation is a one-time {membershipFee === null ? "configured fee not available" : formatMoney(membershipFee)}. It is separate from a subscription plan.</p>}
          {latestMembershipPayment ? <p className="member-inline-status">Payment review: {latestMembershipPayment.status === "pending" ? <span className="member-status member-status-pending">Pending Verification</span> : <Status value={latestMembershipPayment.status} />} · {latestMembershipPayment.payment_method}</p> : null}
          {subscription ? <div className="member-subscription-detail"><strong>{subscription.plan_name_snapshot}</strong><p>Plan price: {formatMoney(subscription.plan_price_snapshot)}</p><p>Status: <Status value={subscription.status === "active" && !subscriptionIsCurrent ? "expired" : subscription.status} /></p><p>Started {formatDate(subscription.started_at)} · Ends {formatDate(subscription.ends_at)}</p></div> : <p className="member-muted">No 30-day rental cycle has started.</p>}
          <p className="member-field-note">The one-time activation fee is separate. Your first book request includes one 30-day subscription payment, then additional books are covered until it expires.</p>
          {profile.membership_status === "active" && subscription && !subscriptionIsCurrent ? <Link className="text-link" href="/member/dashboard/payments">Renew subscription <span aria-hidden="true">→</span></Link> : null}
          {!applicationResult.error && profile.membership_status !== "active" && application?.status !== "pending" && application?.status !== "approved" ? <Link className="button-primary" href="/member/apply">Continue membership application</Link> : null}
          {subscriptionResult.error || applicationResult.error || paymentResult.error || settingsResult.error ? <p className="member-form-message member-form-message-error" role="alert">Some membership or payment details could not be loaded.</p> : null}
        </section>

        <section className="member-panel member-panel-wide" id="rentals" aria-labelledby="rentals-heading">
          <div className="member-panel-heading"><div><p className="eyebrow">Books</p><h2 id="rentals-heading">Rentals and requests</h2></div><Link className="text-link" href="/member/reservations">Reservations <span aria-hidden="true">→</span></Link></div>
          {requestResult.error || rentalResult.error ? <p className="member-form-message member-form-message-error" role="alert">Your rental records could not be loaded.</p> : null}
          <div className="member-record-columns">
            <div><h3>Rental requests</h3>{rentalRequests.length ? <ul className="member-record-list">{rentalRequests.map((request) => <li key={request.id}><div><strong>{bookTitles.get(request.book_id) ?? "Library book"}</strong><span>Requested {formatDate(request.requested_at)} · {Number(request.amount_bdt) > 0 ? `${formatMoney(request.amount_bdt)} first subscription payment` : "covered by subscription"}</span></div>{Number(request.amount_bdt) > 0 && request.status === "pending" ? <span className="member-status member-status-pending">Pending Verification</span> : <Status value={request.status} />}</li>)}</ul> : <p className="member-muted">No rental requests yet.</p>}</div>
            <div><h3>Issued books</h3>{rentals.length ? <ul className="member-record-list">{rentals.map((rental) => <li key={rental.id}><div><strong>{bookTitles.get(rental.book_id) ?? "Library book"}</strong><span>{rental.started_at ? `Handed over ${formatDate(rental.started_at)} · Due ${formatDate(rental.subscription_ends_at)}` : "Approved · awaiting book handover"}{rental.returned_at ? ` · Returned ${formatDate(rental.returned_at)}` : ""}</span></div><Status value={rental.status} /></li>)}</ul> : <p className="member-muted">No issued books recorded.</p>}</div>
          </div>
          {subscriptionIsCurrent ? <p className="member-field-note">Your active 30-day subscription covers all checked-out books through {formatDate(subscription?.ends_at ?? null)}. Renew before it expires to continue holding them.</p> : subscription && profile.membership_status === "active" ? <p className="member-field-note">Your subscription has expired. Renew it to request books or continue holding rented books. <Link href="/member/dashboard/payments">Renew subscription</Link></p> : profile.membership_status === "active" ? <p className="member-field-note">Request your first book to submit the 30-day subscription payment. The cycle begins after administrator approval.</p> : <p className="member-field-note">An active library membership is required before you can request a rental.</p>}
        </section>

        <section className="member-panel" id="reservations" aria-labelledby="reservations-heading">
          <div className="member-panel-heading"><div><p className="eyebrow">Queue</p><h2 id="reservations-heading">Your reservations</h2></div></div>
          {reservationResult.error ? <p className="member-form-message member-form-message-error" role="alert">Reservation status could not be loaded.</p> : reservations.length ? <ul className="member-record-list">{reservations.slice(0, 5).map((reservation) => <li key={reservation.reservation_id}><div><strong>{reservation.book_title}</strong><span>Requested {formatDate(reservation.requested_at)}{reservation.queue_position ? ` · Queue position ${reservation.queue_position}` : ""}</span></div><Status value={reservation.status} /></li>)}</ul> : <p className="member-muted">No reservations in your queue.</p>}
          <Link className="text-link" href="/member/reservations">View reservations <span aria-hidden="true">→</span></Link>
        </section>

        <section className="member-panel" id="payments" aria-labelledby="payments-heading">
          <div className="member-panel-heading"><div><p className="eyebrow">Payments and fines</p><h2 id="payments-heading">Account records</h2></div></div>
          {paymentResult.error || fineResult.error ? <p className="member-form-message member-form-message-error" role="alert">Payment or fine records could not be loaded.</p> : null}
          <h3>Payment submissions</h3>{payments.length ? <ul className="member-record-list">{payments.map((payment) => <li key={payment.id}><div><strong>{payment.payment_type.replaceAll("_", " ")} · {formatMoney(payment.amount_bdt)}</strong><span>{payment.payment_method} · Submitted {formatDate(payment.submitted_at)}</span></div><Status value={payment.status} /></li>)}</ul> : <p className="member-muted">No payment submissions recorded.</p>}
          <h3>Fine records</h3>{fines.length ? <ul className="member-record-list">{fines.map((fine) => <li key={fine.id}><div><strong>{formatMoney(fine.amount_bdt)}</strong><span>Recorded {formatDate(fine.fine_date)}</span></div><Status value={fine.status} /></li>)}</ul> : <p className="member-muted">No fine records found.</p>}
          <p className="member-field-note">Configured fine rate: {dailyFineRate === null ? "unavailable" : `${formatMoney(dailyFineRate)} per eligible overdue rental day`}. Amounts above are recorded ledger entries; the portal does not recalculate balances or accept fine payments.</p>
          {fineRateResult.error ? <p className="member-form-message member-form-message-error" role="alert">The fine-rate setting could not be loaded.</p> : null}
        </section>

        <section className="member-panel member-panel-wide" id="notifications" aria-labelledby="notifications-heading">
          <div className="member-panel-heading"><div><p className="eyebrow">Updates</p><h2 id="notifications-heading">Recent notifications</h2></div><Link className="text-link" href="/member/notifications">All notifications <span aria-hidden="true">→</span></Link></div>
          {notificationResult.error ? <p className="member-form-message member-form-message-error" role="alert">Notifications could not be loaded.</p> : notifications.length ? <ul className="member-record-list">{notifications.map((notification) => <li className={notification.read_at ? "" : "member-record-unread"} key={notification.id}><div><strong>{notification.title}</strong><span>{notification.message}</span><time dateTime={notification.created_at}>{formatDate(notification.created_at)}</time></div><span className={notification.read_at ? "member-read-state" : "member-unread-state"}>{notification.read_at ? "Read" : "Unread"}</span></li>)}</ul> : <p className="member-muted">You have no notifications yet.</p>}
        </section>
      </div>
    </main>
  );
}