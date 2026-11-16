import "server-only";

import type { Database } from "@/lib/database.types";
import { decryptMemberPii } from "@/lib/security/pii";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

export type MemberExportRecord = Database["public"]["Tables"]["member_profiles"]["Row"];

const exportPageSize = 500;

export async function fetchAllMemberProfilesForExport(): Promise<MemberExportRecord[]> {
  const client = createAdminSupabaseClient();
  const members: MemberExportRecord[] = [];

  for (let from = 0; ; from += exportPageSize) {
    const { data, error } = await client.from("member_profiles")
      .select("*")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + exportPageSize - 1);
    if (error) throw new Error(`Member export query failed: ${error.message}`);

    const page = data ?? [];
    members.push(...page.map((member) => decryptMemberPii(member)));
    if (page.length < exportPageSize) return members;
  }
}