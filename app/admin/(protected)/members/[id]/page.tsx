import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminSession } from "@/lib/admin/session";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { AdminSubmitButton } from "@/components/admin/admin-submit-button";
import { verifyMemberIdAction } from "@/app/admin/(protected)/members/actions";
import { decryptMemberPii } from "@/lib/security/pii";
import { AdminManualIdForm } from "@/components/admin/admin-manual-id-form";

type QueryResult<T> = { data: T | null; error: { message: string } | null };
type MemberProfile = { id: string; full_name: string; phone: string; email: string | null; address: string | null; id_type: "NID" | "Student ID" | null; id_number: string | null; dob: string | null; institution_name: string | null; id_card_url: string | null; is_id_verified: boolean; verification_status: "PENDING" | "APPROVED" | "REJECTED"; rejection_reason: string | null; membership_status: string; membership_expires_at: string | null; created_at: string; current_plan_id: string | null };
type Application = { id: string; status: string; amount_bdt: number; payment_method: string; transaction_id: string; submitted_at: string; reviewed_at: string | null };
type Payment = { id: string; payment_type: string; status: string; amount_bdt: number; payment_method: string; transaction_id: string; submitted_at: string; reviewed_at: string | null };
type Subscription = { id: string; plan_name_snapshot: string; plan_price_snapshot: number; status: string; started_at: string; ends_at: string | null };
type Rental = { id: string; status: string; started_at: string | null; subscription_ends_at: string | null; returned_at: string | null; book: { title: string } | null };
type Reservation = { id: string; status: string; requested_at: string; notified_at: string | null; fulfilled_at: string | null; book: { title: string } | null };
type Fine = { id: string; amount_bdt: number; fine_date: string; status: string; reason: string };

export const metadata: Metadata = { title: "Member Record", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

function statusClass(status: string): string {
  if (["active", "approved", "returned", "paid", "fulfilled"].includes(status)) return "admin-status admin-status-available";
  if (["pending", "waiting", "notified"].includes(status)) return "admin-status admin-status-limited";
  return "admin-status admin-status-unavailable";
}

function date(value: string | null): string {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleDateString("en-BD", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dhaka" });
}

export default async function AdminMemberDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<{ idVerification?: string }> }) {
  await requireAdminSession();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) notFound();
  const client = createAdminSupabaseClient();
  const { data: storedMember, error: memberError } = await (client.from("member_profiles").select("id, full_name, phone, email, address, id_type, id_number, dob, institution_name, id_card_url, is_id_verified, verification_status, rejection_reason, membership_status, membership_expires_at, created_at, current_plan_id").eq("id", id).maybeSingle() as unknown as Promise<QueryResult<MemberProfile>>);
  if (!storedMember && !memberError) notFound();
  if (memberError || !storedMember) return <main className="admin-page"><p className="admin-form-error" role="alert">Member details could not be loaded. Refresh to try again.</p></main>;
  const member = decryptMemberPii(storedMember);

  const [applications, payments, subscriptions, rentals, reservations, fines] = await Promise.all([
    client.from("membership_applications").select("id, status, amount_bdt, payment_method, transaction_id, submitted_at, reviewed_at").eq("member_id", member.id).order("submitted_at", { ascending: false }).limit(10) as unknown as Promise<QueryResult<Application[]>>,
    client.from("payment_submissions").select("id, payment_type, status, amount_bdt, payment_method, transaction_id, submitted_at, reviewed_at").eq("member_id", member.id).order("submitted_at", { ascending: false }).limit(20) as unknown as Promise<QueryResult<Payment[]>>,
    client.from("member_subscriptions").select("id, plan_name_snapshot, plan_price_snapshot, status, started_at, ends_at").eq("member_id", member.id).order("started_at", { ascending: false }).limit(20) as unknown as Promise<QueryResult<Subscription[]>>,
    client.from("rentals").select("id, status, started_at, subscription_ends_at, returned_at, book:books(title)").eq("member_id", member.id).order("started_at", { ascending: false }).limit(20) as unknown as Promise<QueryResult<Rental[]>>,
    client.from("reservation_requests").select("id, status, requested_at, notified_at, fulfilled_at, book:books(title)").eq("member_id", member.id).order("requested_at", { ascending: false }).limit(20) as unknown as Promise<QueryResult<Reservation[]>>,
    client.from("fine_ledger").select("id, amount_bdt, fine_date, status, reason").eq("member_id", member.id).order("fine_date", { ascending: false }).limit(30) as unknown as Promise<QueryResult<Fine[]>>,
  ]);
  const failures = [applications, payments, subscriptions, rentals, reservations, fines].some((result) => result.error);
  let idPhotoUrl: string | null = null;
  if (member.id_card_url?.startsWith(`member-ids/${member.id}/`) && !member.id_card_url.includes("..")) {
    const { data: signedPhoto, error: photoError } = await client.storage.from("member-ids").createSignedUrl(member.id_card_url, 300);
    if (!photoError) idPhotoUrl = signedPhoto?.signedUrl ?? null;
  }

  return (
    <main className="admin-page">
      <header className="admin-page-header"><div><p className="eyebrow">Member record</p><h1 className="display-font">{member.full_name}</h1></div><Link className="button-outline" href="/ashik-loves-jannat/members">All members</Link></header>
      {query?.idVerification === "success" ? <p className="admin-flash-success" role="status">Member ID verified. Book requests are enabled.</p> : null}
      {query?.idVerification === "error" ? <p className="admin-form-error" role="alert">ID verification could not be approved. Check that all required details and a private photo are present.</p> : null}
      {query?.idVerification === "manual-saved" ? <p className="admin-flash-success" role="status">ID details saved for review. Book requests remain locked until approval.</p> : null}
      {query?.idVerification === "manual-verified" ? <p className="admin-flash-success" role="status">ID details saved and verified. Book requests are enabled.</p> : null}
      {query?.idVerification === "manual-error" ? <p className="admin-form-error" role="alert">Manual ID submission failed. Check the details and photo, then try again.</p> : null}
      {failures ? <p className="admin-form-error" role="alert">Some member history could not be loaded. Each section reports its own missing data.</p> : null}
      <section className="admin-recent-panel"><div className="admin-section-heading"><div><p className="eyebrow">Account</p><h2 className="display-font">Profile</h2></div><span className={statusClass(member.membership_status)}>{member.membership_status}</span></div><dl className="admin-member-profile"><div><dt>Phone</dt><dd>{member.phone}</dd></div><div><dt>Email</dt><dd>{member.email ?? "Not provided"}</dd></div><div><dt>Address</dt><dd>{member.address ?? "Not provided"}</dd></div><div><dt>Joined</dt><dd>{date(member.created_at)}</dd></div><div><dt>Membership expires</dt><dd>{date(member.membership_expires_at)}</dd></div></dl></section>

      <section className="admin-recent-panel">
        <div className="admin-section-heading"><div><p className="eyebrow">Identity review</p><h2 className="display-font">ID verification</h2></div><span className={statusClass(member.verification_status.toLowerCase())}>{member.verification_status.toLowerCase()}</span></div>
        <dl className="admin-member-profile"><div><dt>ID type</dt><dd>{member.id_type ?? "Not submitted"}</dd></div><div><dt>ID number</dt><dd>{member.id_number ?? "Not submitted"}</dd></div><div><dt>Date of birth</dt><dd>{member.dob ? date(member.dob) : "Not applicable / not submitted"}</dd></div><div><dt>Institution</dt><dd>{member.institution_name ?? "Not applicable / not submitted"}</dd></div><div><dt>Address</dt><dd>{member.address ?? "Not submitted"}</dd></div></dl>
        {member.verification_status === "REJECTED" && member.rejection_reason ? <p className="admin-form-error" role="status">Rejected: {member.rejection_reason}</p> : null}
        {idPhotoUrl ? <a href={idPhotoUrl} rel="noreferrer" target="_blank">Open private ID photo</a> : <p className="admin-form-error">ID photo is unavailable.</p>}
        {member.verification_status === "PENDING" && !member.is_id_verified && idPhotoUrl ? <form action={verifyMemberIdAction}><input name="memberId" type="hidden" value={member.id} /><AdminSubmitButton pendingLabel="Verifying ID…">Approve ID verification</AdminSubmitButton></form> : null}
        <AdminManualIdForm member={member} />
      </section>

      <section className="admin-recent-panel"><div className="admin-section-heading"><div><p className="eyebrow">Activation</p><h2 className="display-font">Membership applications</h2></div><Link className="text-link" href="/ashik-loves-jannat/membership-requests">Review queue <span aria-hidden="true">→</span></Link></div>{applications.error ? <p className="admin-form-error">Applications unavailable.</p> : applications.data?.length ? <ul className="admin-recent-list">{applications.data.map((application) => <li key={application.id}><div><strong>৳{Number(application.amount_bdt).toLocaleString("en-BD")} · {application.payment_method} · TXID {application.transaction_id}</strong><span>Submitted {date(application.submitted_at)}{application.reviewed_at ? ` · Reviewed ${date(application.reviewed_at)}` : ""}</span></div><span className={statusClass(application.status)}>{application.status}</span></li>)}</ul> : <p className="admin-empty-note">No applications.</p>}</section>

      <section className="admin-recent-panel"><div className="admin-section-heading"><div><p className="eyebrow">Transactions</p><h2 className="display-font">Payment submissions</h2></div><Link className="text-link" href="/ashik-loves-jannat/payments">Payment review <span aria-hidden="true">→</span></Link></div>{payments.error ? <p className="admin-form-error">Payment records unavailable.</p> : payments.data?.length ? <ul className="admin-recent-list">{payments.data.map((payment) => <li key={payment.id}><div><strong>{payment.payment_type} · ৳{Number(payment.amount_bdt).toLocaleString("en-BD")}</strong><span>{payment.payment_method} · TXID {payment.transaction_id} · Submitted {date(payment.submitted_at)}</span></div><span className={statusClass(payment.status)}>{payment.status}</span></li>)}</ul> : <p className="admin-empty-note">No payment submissions.</p>}</section>

      <section className="admin-recent-panel"><div className="admin-section-heading"><div><p className="eyebrow">Access</p><h2 className="display-font">Subscription history</h2></div><Link className="text-link" href="/ashik-loves-jannat/subscriptions">All subscriptions <span aria-hidden="true">→</span></Link></div>{subscriptions.error ? <p className="admin-form-error">Subscription records unavailable.</p> : subscriptions.data?.length ? <ul className="admin-recent-list">{subscriptions.data.map((subscription) => <li key={subscription.id}><div><strong>{subscription.plan_name_snapshot} · ৳{Number(subscription.plan_price_snapshot).toLocaleString("en-BD")}</strong><span>Started {date(subscription.started_at)} · Ends {date(subscription.ends_at)}</span></div><span className={statusClass(subscription.status)}>{subscription.status}</span></li>)}</ul> : <p className="admin-empty-note">No subscription records.</p>}</section>

      <section className="admin-recent-panel"><div className="admin-section-heading"><div><p className="eyebrow">Books</p><h2 className="display-font">Rental history</h2></div><Link className="text-link" href="/ashik-loves-jannat/rentals">All rentals <span aria-hidden="true">→</span></Link></div>{rentals.error ? <p className="admin-form-error">Rental records unavailable.</p> : rentals.data?.length ? <ul className="admin-recent-list">{rentals.data.map((rental) => <li key={rental.id}><div><strong>{rental.book?.title ?? "Book record unavailable"}</strong><span>{rental.started_at ? `Handed over ${date(rental.started_at)} · Due ${date(rental.subscription_ends_at)}` : "Approved · awaiting book handover"}{rental.returned_at ? ` · Returned ${date(rental.returned_at)}` : ""}</span></div><span className={statusClass(rental.status)}>{rental.status}</span></li>)}</ul> : <p className="admin-empty-note">No rental records.</p>}</section>

      <section className="admin-recent-panel"><div className="admin-section-heading"><div><p className="eyebrow">Queue</p><h2 className="display-font">Reservations</h2></div><Link className="text-link" href="/ashik-loves-jannat/reservations">Reservation queues <span aria-hidden="true">→</span></Link></div>{reservations.error ? <p className="admin-form-error">Reservation records unavailable.</p> : reservations.data?.length ? <ul className="admin-recent-list">{reservations.data.map((reservation) => <li key={reservation.id}><div><strong>{reservation.book?.title ?? "Book record unavailable"}</strong><span>Requested {date(reservation.requested_at)}{reservation.fulfilled_at ? ` · Fulfilled ${date(reservation.fulfilled_at)}` : ""}</span></div><span className={statusClass(reservation.status)}>{reservation.status}</span></li>)}</ul> : <p className="admin-empty-note">No reservation records.</p>}</section>

      <section className="admin-recent-panel"><div className="admin-section-heading"><div><p className="eyebrow">Ledger</p><h2 className="display-font">Fine records</h2></div><Link className="text-link" href="/ashik-loves-jannat/fines">Fine ledger <span aria-hidden="true">→</span></Link></div>{fines.error ? <p className="admin-form-error">Fine records unavailable.</p> : fines.data?.length ? <ul className="admin-recent-list">{fines.data.map((fine) => <li key={fine.id}><div><strong>৳{Number(fine.amount_bdt).toLocaleString("en-BD")} · {date(fine.fine_date)}</strong><span>{fine.reason}</span></div><span className={statusClass(fine.status)}>{fine.status}</span></li>)}</ul> : <p className="admin-empty-note">No fine records.</p>}</section>
    </main>
  );
}