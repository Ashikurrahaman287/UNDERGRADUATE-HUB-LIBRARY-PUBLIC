import { requireAdminSession } from "@/lib/admin/session";
import { fetchAllMemberProfilesForExport, type MemberExportRecord } from "@/lib/admin/member-export";

export const dynamic = "force-dynamic";

const columns: { label: string; value: (member: MemberExportRecord) => string | number | boolean | null }[] = [
  { label: "Profile ID", value: (member) => member.id },
  { label: "Auth User ID", value: (member) => member.user_id },
  { label: "Full name", value: (member) => member.full_name },
  { label: "Phone", value: (member) => member.phone },
  { label: "Email", value: (member) => member.email },
  { label: "Address", value: (member) => member.address },
  { label: "Avatar URL", value: (member) => member.avatar_url },
  { label: "ID type", value: (member) => member.id_type },
  { label: "ID number", value: (member) => member.id_number },
  { label: "Date of birth", value: (member) => member.dob },
  { label: "Institution", value: (member) => member.institution_name },
  { label: "ID submitted at", value: (member) => member.id_verification_submitted_at },
  { label: "ID verified", value: (member) => member.is_id_verified },
  { label: "Verification status", value: (member) => member.verification_status },
  { label: "Verification rejection reason", value: (member) => member.rejection_reason },
  { label: "Membership status", value: (member) => member.membership_status },
  { label: "Membership expires at", value: (member) => member.membership_expires_at },
  { label: "Current plan ID", value: (member) => member.current_plan_id },
  { label: "Rental subscription start", value: (member) => member.rental_subscription_start },
  { label: "Rental subscription expires at", value: (member) => member.rental_subscription_expires_at },
  { label: "Referral code", value: (member) => member.referral_code },
  { label: "Wallet balance", value: (member) => member.wallet_balance },
  { label: "Created at", value: (member) => member.created_at },
  { label: "Updated at", value: (member) => member.updated_at },
  { label: "ID document on file", value: (member) => Boolean(member.id_card_url) },
];

function csvCell(value: string | number | boolean | null): string {
  let text = value === null ? "" : String(value);
  if (/^[\t\r\n ]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(): Promise<Response> {
  await requireAdminSession();

  try {
    const members = await fetchAllMemberProfilesForExport();
    const csv = [
      columns.map(({ label }) => csvCell(label)).join(","),
      ...members.map((member) => columns.map(({ value }) => csvCell(value(member))).join(",")),
    ].join("\r\n");
    const date = new Date().toISOString().slice(0, 10);

    return new Response(`\uFEFF${csv}`, {
      headers: {
        "Cache-Control": "no-store, private",
        "Content-Disposition": `attachment; filename="members-${date}.csv"`,
        "Content-Type": "text/csv; charset=utf-8",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[member-export] CSV export failed", error);
    return new Response("Member export is temporarily unavailable.", {
      status: 500,
      headers: {
        "Cache-Control": "no-store, private",
        "Content-Type": "text/plain; charset=utf-8",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
      },
    });
  }
}