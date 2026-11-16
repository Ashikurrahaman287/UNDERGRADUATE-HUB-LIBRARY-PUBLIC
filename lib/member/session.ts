import "server-only";

import { redirect } from "next/navigation";
import { getSafeMemberDestination } from "@/lib/member/redirect";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { assertAuthorized } from "@/lib/security/guards";

export async function createMemberSupabaseServerClient() {
  return createServerSupabaseClient();
}

export async function getMemberSession() {
  const supabase = await createMemberSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return { user, supabase };
}

export function isPhoneAuthUser(user: { app_metadata: { provider?: unknown }; phone?: string | null; phone_confirmed_at?: string | null }): boolean {
  return user.app_metadata.provider === "phone" || Boolean(user.phone && user.phone_confirmed_at);
}

export async function requireMemberSession(returnTo?: string) {
  let session;
  try {
    const authorized = await assertAuthorized("member");
    if (!authorized.user || !authorized.supabase) {
      throw new Error("Member authorization required.");
    }
    session = { user: authorized.user, supabase: authorized.supabase };
  } catch {
    session = null;
  }

  if (!session) {
    const destination = getSafeMemberDestination(returnTo);
    redirect(destination ? `/member/login?next=${encodeURIComponent(destination)}` : "/member/login");
  }

  return session;
}
