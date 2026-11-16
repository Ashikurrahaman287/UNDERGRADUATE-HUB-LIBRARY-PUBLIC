import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminSession } from "@/lib/admin/session";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { decryptMemberPii } from "@/lib/security/pii";

type MemberIdType = "NID" | "Student ID";
type PendingMember = {
  id: string;
  full_name: string;
  phone: string;
  id_type: MemberIdType | null;
  id_number: string | null;
  dob: string | null;
  institution_name: string | null;
  address: string | null;
  id_card_url: string | null;
  is_id_verified: boolean;
  verification_status: "PENDING" | "APPROVED" | "REJECTED";
  updated_at: string;
};
type QueryResult<T> = { data: T | null; error: { message: string } | null; count?: number | null };
type PendingMemberQuery = {
  eq(column: "is_id_verified", value: false): PendingMemberQuery;
  eq(column: "verification_status", value: "PENDING"): PendingMemberQuery;
  not(column: "id_type" | "id_number" | "id_card_url", operator: "is", value: null): PendingMemberQuery;
  order(column: "updated_at", options: { ascending: boolean }): {
    range(from: number, to: number): PromiseLike<QueryResult<PendingMember[]>>;
  };
};
type PendingMemberClient = {
  from(table: "member_profiles"): {
    select(columns: string, options: { count: "exact" }): PendingMemberQuery;
  };
};

export const metadata: Metadata = { title: "ID Verification Pending", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const pageSize = 30;

function pageHref(page: number): string {
  return `/ashik-loves-jannat/id-verification-pending?page=${page}`;
}

function formatDate(value: string | null): string {
  if (!value) return "Not submitted";
  return new Date(value).toLocaleDateString("en-BD", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dhaka" });
}

export default async function IdVerificationPendingPage({ searchParams }: { searchParams?: Promise<{ page?: string; verification?: string }> }) {
  await requireAdminSession();
  const params = await searchParams;
  const parsedPage = Number(params?.page ?? "1");
  const currentPage = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const client = createAdminSupabaseClient();
  const queryClient = client as unknown as PendingMemberClient;
  const start = (currentPage - 1) * pageSize;
  const { data, error, count } = await queryClient.from("member_profiles").select(
    "id, full_name, phone, id_type, id_number, dob, institution_name, address, id_card_url, is_id_verified, verification_status, updated_at",
    { count: "exact" },
  )
    .eq("is_id_verified", false)
    .eq("verification_status", "PENDING")
    .not("id_type", "is", null)
    .not("id_number", "is", null)
    .not("id_card_url", "is", null)
    .order("updated_at", { ascending: false })
    .range(start, start + pageSize - 1);
  const members = (data ?? []).map(decryptMemberPii);
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / pageSize));
  return (
    <main className="admin-page">
      <header className="admin-page-header"><div><p className="eyebrow">Member security</p><h1 className="display-font">ID Verification Pending</h1></div></header>
      {params?.verification === "success" ? <p className="admin-flash-success" role="status">ID approved. The member can now request books.</p> : null}
      {params?.verification === "rejected" ? <p className="admin-flash-success" role="status">ID submission rejected. The member can update their details and submit a new photo.</p> : null}
      {params?.verification === "error" ? <p className="admin-form-error" role="alert">ID verification action failed. Refresh the member details and try again.</p> : null}
      {error ? <p className="admin-form-error" role="alert">Pending ID submissions could not be loaded. Refresh to try again.</p> : null}
      {!error && members.length === 0 ? <section className="admin-recent-panel"><p className="admin-empty-note">No pending ID verifications found.</p></section> : null}
      {!error && members.length > 0 ? <div className="admin-data-table-wrap"><table className="admin-data-table"><thead><tr><th>Member</th><th>ID type</th><th>ID number</th><th>Last updated</th><th>Status</th></tr></thead><tbody>{members.map((member) => <tr key={member.id}>
        <td><Link className="admin-id-member-link" href={`/ashik-loves-jannat/members/${member.id}`}>{member.full_name}</Link><small>{member.phone}</small></td>
        <td>{member.id_type ?? "Not submitted"}</td>
        <td>{member.id_number ?? "Not submitted"}</td>
        <td>{formatDate(member.updated_at)}</td>
        <td><span className="admin-status admin-status-limited">Pending review</span></td>
      </tr>)}</tbody></table></div> : null}
      {count && count > 0 ? <nav aria-label="ID verification pages" className="admin-pagination"><span>Page {currentPage} of {totalPages} · {count} pending</span>{currentPage > 1 ? <Link className="admin-action-button" href={pageHref(currentPage - 1)}>Previous</Link> : null}{currentPage < totalPages ? <Link className="admin-action-button" href={pageHref(currentPage + 1)}>Next</Link> : null}</nav> : null}
    </main>
  );
}