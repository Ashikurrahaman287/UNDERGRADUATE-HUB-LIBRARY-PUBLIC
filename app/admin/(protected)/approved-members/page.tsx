import type { Metadata } from "next";
import ApprovedMembersPage from "../active-members/page";

export const metadata: Metadata = { title: "Approved Members", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default ApprovedMembersPage;