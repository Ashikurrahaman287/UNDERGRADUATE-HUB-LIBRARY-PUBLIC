import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/database.types";
import { encryptMemberPii, isEncryptedPii } from "../lib/security/pii";

const pageSize = 100;

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey || !process.env.PII_ENCRYPTION_KEY) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and PII_ENCRYPTION_KEY before running the PII backfill.");
  }

  const supabase = createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  let scanned = 0;
  let encrypted = 0;

  for (let offset = 0; ; offset += pageSize) {
    const { data: members, error } = await supabase.from("member_profiles")
      .select("id, address, id_number, dob, institution_name, updated_at")
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error("Could not read member records for the PII backfill.");
    if (!members?.length) break;

    for (const member of members) {
      scanned += 1;
      if ([member.address, member.id_number, member.dob, member.institution_name]
        .every((value) => value === null || value === "" || isEncryptedPii(value))) continue;
      const secured = encryptMemberPii(member);
      const { data, error: updateError } = await supabase.from("member_profiles").update({
        address: secured.address,
        id_number: secured.id_number,
        dob: secured.dob,
        institution_name: secured.institution_name,
      }).eq("id", member.id).eq("updated_at", member.updated_at).select("id").maybeSingle();
      if (updateError || !data) {
        throw new Error(`Could not safely encrypt member record ${member.id}; pause the rollout and rerun after reviewing concurrent profile changes.`);
      }
      encrypted += 1;
    }
  }

  console.info(`PII backfill complete: scanned ${scanned} member profiles and encrypted ${encrypted} profiles.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "The PII backfill failed.");
  process.exitCode = 1;
});