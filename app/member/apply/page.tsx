import type { Metadata } from "next";
import Link from "next/link";
import { MembershipApplicationForm } from "@/components/member/membership-application-form";
import { requireMemberSession } from "@/lib/member/session";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import type { MemberIdType } from "@/lib/member/id-verification";
import { decryptMemberPii } from "@/lib/security/pii";

type ApplicationStatus = { id: string; status: "pending" | "approved" | "rejected"; amount_bdt: number; submitted_at: string };
type PaymentStatus = { status: "pending" | "approved" | "rejected"; amount_bdt: number; submitted_at: string };
type QueryResult<T> = { data: T | null; error: { message: string } | null };
type MemberApplicationProfile = { id: string; full_name: string; address: string | null; membership_status: string; id_type: MemberIdType | null; id_number: string | null; dob: string | null; institution_name: string | null; id_card_url: string | null; is_id_verified: boolean; verification_status: "PENDING" | "APPROVED" | "REJECTED" };
type MemberApplicationQueryClient = {
  from(table: "member_profiles"): {
    select(columns: "id, full_name, address, membership_status, id_type, id_number, dob, institution_name, id_card_url, is_id_verified, verification_status"): {
      eq(column: "user_id", value: string): { maybeSingle(): PromiseLike<QueryResult<MemberApplicationProfile>> };
    };
  };
  from(table: "membership_applications"): {
    select(columns: "id, status, amount_bdt, submitted_at"): {
      eq(column: "member_id", value: string): {
        order(column: "submitted_at", options: { ascending: boolean }): { limit(count: number): PromiseLike<QueryResult<ApplicationStatus[]>> };
      };
    };
  };
  from(table: "payment_submissions"): {
    select(columns: "status, amount_bdt, submitted_at"): {
      eq(column: "member_id", value: string): {
        eq(column: "payment_type", value: "membership"): {
          order(column: "submitted_at", options: { ascending: boolean }): { limit(count: number): PromiseLike<QueryResult<PaymentStatus[]>> };
        };
      };
    };
  };
};
type MembershipFeeQueryClient = {
  from(table: "library_settings"): {
    select(columns: "value_number"): {
      eq(column: "key", value: "membership_fee_bdt"): { maybeSingle(): PromiseLike<QueryResult<{ value_number: number | null }>> };
    };
  };
};

export const metadata: Metadata = { title: "Membership Application", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-BD", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dhaka" });
}

function statusClass(status: string): string {
  if (status === "approved") return "member-status member-status-positive";
  if (status === "pending") return "member-status member-status-pending";
  return "member-status member-status-attention";
}

export default async function MemberApplyPage() {
  const session = await requireMemberSession("/member/apply");
  const memberClient = session.supabase as unknown as MemberApplicationQueryClient;
  const settingsClient = createAdminSupabaseClient() as unknown as MembershipFeeQueryClient;
  const [profileResult, feeResult] = await Promise.all([
    memberClient.from("member_profiles").select("id, full_name, address, membership_status, id_type, id_number, dob, institution_name, id_card_url, is_id_verified, verification_status").eq("user_id", session.user.id).maybeSingle(),
    settingsClient.from("library_settings").select("value_number").eq("key", "membership_fee_bdt").maybeSingle(),
  ]);

  if (profileResult.error) {
    return <main className="container member-page" id="main-content"><p className="member-form-message member-form-message-error" role="alert">Your membership profile could not be loaded. Refresh to try again.</p></main>;
  }

  if (!profileResult.data) {
    return <main className="container member-page" id="main-content"><header className="member-page-heading"><p className="eyebrow">Member profile</p><h1 className="display-font">Complete your profile first</h1></header><p>A member profile is required before applying.</p><Link className="button-primary" href="/member/register">Complete profile</Link></main>;
  }

  const profile = decryptMemberPii(profileResult.data);
  const [{ data: applications, error: applicationError }, { data: payments, error: paymentError }] = await Promise.all([
    memberClient.from("membership_applications").select("id, status, amount_bdt, submitted_at").eq("member_id", profile.id).order("submitted_at", { ascending: false }).limit(1),
    memberClient.from("payment_submissions").select("status, amount_bdt, submitted_at").eq("member_id", profile.id).eq("payment_type", "membership").order("submitted_at", { ascending: false }).limit(1),
  ]);

  const application = applications?.[0] ?? null;
  const payment = payments?.[0] ?? null;
  const fee = feeResult.data?.value_number ?? null;
  const identityVerified = profile.is_id_verified && profile.verification_status === "APPROVED" && Boolean(profile.id_card_url);
  const canSubmit = !applicationError && !paymentError && !feeResult.error && fee !== null
    && profile.membership_status !== "active"
    && application?.status !== "pending"
    && application?.status !== "approved";

  return (
    <main className="container member-page" id="main-content">
      <header className="member-page-heading">
        <p className="eyebrow">Membership application</p>
        <h1 className="display-font">Library membership</h1>
        <p className="member-muted">Initial activation fee: <strong>{fee === null ? "Unavailable" : `৳${Number(fee).toLocaleString("en-BD")}`} one time</strong>. This fee is separate from a subscription plan.</p>
      </header>

      {profile.membership_status === "active" ? <section className="member-panel"><h2>Your membership is active</h2><p>Your member dashboard shows your current subscription and borrowing eligibility.</p><Link className="text-link" href="/member/dashboard">View dashboard <span aria-hidden="true">→</span></Link></section> : null}

      {applicationError || paymentError || feeResult.error ? <p className="member-form-message member-form-message-error" role="alert">Membership or payment information could not be loaded. Refresh to try again.</p> : null}

      {application && (application.status === "pending" || application.status === "approved") ? (
        <section className="member-panel" id="membership-status">
          <div className="member-panel-heading"><div><p className="eyebrow">Application</p><h2>Review status</h2></div><span className={statusClass(application.status)}>{application.status === "pending" ? "Pending Verification" : application.status}</span></div>
          <p>Submitted {formatDate(application.submitted_at)} · Fee recorded: ৳{Number(application.amount_bdt).toLocaleString("en-BD")}.</p>
          {payment ? <p>Payment review: <span className={statusClass(payment.status)}>{payment.status === "pending" ? "Pending Verification" : payment.status}</span> · Submitted {formatDate(payment.submitted_at)}.</p> : null}
          {application.status === "pending" ? <p className="member-field-note">Your payment is confirmed. Your application is awaiting administrator approval and plan assignment.</p> : <p className="member-field-note">Your membership application has been approved. The selected 30-day plan is active.</p>}
          <Link className="text-link" href="/member/dashboard">Return to dashboard <span aria-hidden="true">→</span></Link>
        </section>
      ) : null}

      {canSubmit && !identityVerified ? <section aria-labelledby="membership-id-required" className="member-panel member-verification-required" role="alert">
        <p className="eyebrow">Verification pending</p><h2 id="membership-id-required">Verification Pending</h2>
        <p>Your ID must be verified by an admin before you can activate your membership.</p>
        <Link className="button-primary" href="/member/dashboard#identity-verification">Verify ID Now</Link>
      </section> : null}

      {canSubmit && identityVerified ? (
        <section className="member-panel member-application-panel">
          <div className="member-panel-heading"><div><p className="eyebrow">Secure checkout</p><h2>Submit your membership payment</h2></div></div>
          <p className="member-field-note">Send the exact fee shown using bKash or Nagad, then submit your 10-character TrxID for verification.</p>
          <MembershipApplicationForm address={profile.address} amount={Number(fee)} dob={profile.dob} fullName={profile.full_name} idCardPath={profile.id_card_url} idNumber={profile.id_number} idType={profile.id_type} identityVerified institutionName={profile.institution_name} requireNewPhoto={profile.verification_status === "REJECTED"} />
        </section>
      ) : null}

      {application?.status === "rejected" ? <section className="member-panel"><p>Previous application status: <span className={statusClass("rejected")}>rejected</span>. You may submit a new application after reviewing the library’s payment instructions.</p><Link className="text-link" href="/contact">Contact the library <span aria-hidden="true">→</span></Link></section> : null}
    </main>
  );
}