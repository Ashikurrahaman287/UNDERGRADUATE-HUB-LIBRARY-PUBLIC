"use server";

import { redirect } from "next/navigation";
import { createMemberSupabaseServerClient } from "@/lib/member/session";

export async function logoutMember() {
  const supabase = await createMemberSupabaseServerClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error("Sign out could not be completed. Refresh and try again.");
  redirect("/member/login");
}
