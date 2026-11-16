import type { Metadata } from "next";
import Link from "next/link";
import { MemberExportPrintButton } from "@/components/admin/member-export-print-button";
import { fetchAllMemberProfilesForExport } from "@/lib/admin/member-export";
import { requireAdminSession } from "@/lib/admin/session";

export const metadata: Metadata = { title: "Export members", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

function display(value: string | number | boolean | null): string {
  if (value === null || value === "") return "Not provided";
  return typeof value === "boolean" ? value ? "Yes" : "No" : String(value);
}

export default async function MemberExportPdfPage() {
  await requireAdminSession();

  let members;
  try {
    members = await fetchAllMemberProfilesForExport();
  } catch (error) {
    console.error("[member-export] PDF export data failed", error);
    return <main className="admin-page"><p className="admin-form-error" role="alert">Member export is temporarily unavailable.</p><Link className="admin-action-button" href="/ashik-loves-jannat/members">Back to members</Link></main>;
  }

  return <main className="admin-page member-export-print-page">
    <header className="member-export-toolbar"><div><p className="eyebrow">Admin export</p><h1 className="display-font">Members ({members.length})</h1></div><div><Link className="admin-action-button" href="/ashik-loves-jannat/members">Back to members</Link><MemberExportPrintButton /></div></header>
    <section className="member-export-record-list">{members.map((member) => <article className="member-export-record" key={member.id}>
      <h2 className="display-font">{member.full_name}</h2>
      <dl className="member-export-record-grid">
        <div><dt>Profile ID</dt><dd>{member.id}</dd></div>
        <div><dt>Auth user ID</dt><dd>{member.user_id}</dd></div>
        <div><dt>Phone</dt><dd>{member.phone}</dd></div>
        <div><dt>Email</dt><dd>{display(member.email)}</dd></div>
        <div><dt>Address</dt><dd>{display(member.address)}</dd></div>
        <div><dt>Avatar URL</dt><dd>{display(member.avatar_url)}</dd></div>
        <div><dt>ID type</dt><dd>{display(member.id_type)}</dd></div>
        <div><dt>ID number</dt><dd>{display(member.id_number)}</dd></div>
        <div><dt>Date of birth</dt><dd>{display(member.dob)}</dd></div>
        <div><dt>Institution</dt><dd>{display(member.institution_name)}</dd></div>
        <div><dt>ID submitted at</dt><dd>{display(member.id_verification_submitted_at)}</dd></div>
        <div><dt>ID verified</dt><dd>{display(member.is_id_verified)}</dd></div>
        <div><dt>Verification status</dt><dd>{member.verification_status}</dd></div>
        <div><dt>Rejection reason</dt><dd>{display(member.rejection_reason)}</dd></div>
        <div><dt>ID document on file</dt><dd>{display(Boolean(member.id_card_url))}</dd></div>
        <div><dt>Membership status</dt><dd>{member.membership_status}</dd></div>
        <div><dt>Membership expires at</dt><dd>{display(member.membership_expires_at)}</dd></div>
        <div><dt>Current plan ID</dt><dd>{display(member.current_plan_id)}</dd></div>
        <div><dt>Rental subscription start</dt><dd>{display(member.rental_subscription_start)}</dd></div>
        <div><dt>Rental subscription expires at</dt><dd>{display(member.rental_subscription_expires_at)}</dd></div>
        <div><dt>Referral code</dt><dd>{member.referral_code}</dd></div>
        <div><dt>Wallet balance</dt><dd>{member.wallet_balance}</dd></div>
        <div><dt>Created at</dt><dd>{member.created_at}</dd></div>
        <div><dt>Updated at</dt><dd>{member.updated_at}</dd></div>
      </dl>
    </article>)}</section>
  </main>;
}