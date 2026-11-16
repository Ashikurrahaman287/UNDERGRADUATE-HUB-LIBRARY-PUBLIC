import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

function createOtpAuthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase Auth is not configured.");

  return createClient<Database>(url, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

export async function sendAdminEmailOtp(email: string): Promise<void> {
  const { error } = await createOtpAuthClient().auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });
  if (error) throw new Error("Admin email OTP delivery failed.");
}

export async function verifyAdminEmailOtp(email: string, otp: string): Promise<boolean> {
  const { data, error } = await createOtpAuthClient().auth.verifyOtp({
    email,
    token: otp,
    type: "email",
  });
  return !error && Boolean(data.user);
}