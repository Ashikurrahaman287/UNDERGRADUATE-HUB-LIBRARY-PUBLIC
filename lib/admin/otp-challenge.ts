import "server-only";

import { createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import {
  isAuthorizedAdminEmail,
  isAuthorizedAdminPhone,
  maskAuthorizedAdminEmail,
  maskAuthorizedAdminPhone,
} from "@/lib/admin/authorized-phones";

const pendingOtpCookieName = "uhl-admin-pending-otp";
export const pendingOtpLifetimeSeconds = 10 * 60;

function hmac(value: string): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error("The admin session is not configured.");
  }
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function hashPendingOtpToken(token: string): string {
  return hmac(`admin-pending-otp:v1:${token}`);
}

export function hashAdminOtp(tokenHash: string, destination: string, otp: string): string {
  return hmac(`admin-otp:v1:${tokenHash}:${destination}:${otp}`);
}

function maskDestination(method: "phone" | "email", destination: string): string {
  return method === "phone" ? maskAuthorizedAdminPhone(destination) : maskAuthorizedAdminEmail(destination);
}

export async function getPendingOtpToken(): Promise<string | null> {
  const token = (await cookies()).get(pendingOtpCookieName)?.value;
  return token && token.length <= 128 ? token : null;
}

export async function setPendingOtpToken(token: string): Promise<void> {
  (await cookies()).set(pendingOtpCookieName, token, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: pendingOtpLifetimeSeconds,
  });
}

export async function clearPendingOtpToken(): Promise<void> {
  (await cookies()).set(pendingOtpCookieName, "", {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });
}

export async function getPendingAdminLoginState(): Promise<{
  step: "passphrase" | "method" | "otp";
  otpMethod?: "phone" | "email";
  destinationHint?: string;
}> {
  const token = await getPendingOtpToken();
  if (!token) return { step: "passphrase" };

  try {
    const { data, error } = await createAdminSupabaseClient()
      .from("admin_login_challenges")
      .select("otp_hash, otp_method, otp_destination, expires_at")
      .eq("token_hash", hashPendingOtpToken(token))
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (error || !data) {
      await clearPendingOtpToken();
      return { step: "passphrase" };
    }
    if (data.otp_hash && data.otp_method && data.otp_destination) {
      if (data.otp_method === "phone" && !isAuthorizedAdminPhone(data.otp_destination)) {
        await clearPendingOtpToken();
        return { step: "passphrase" };
      }
      if (data.otp_method === "email" && !isAuthorizedAdminEmail(data.otp_destination)) {
        await clearPendingOtpToken();
        return { step: "passphrase" };
      }
      return {
        step: "otp",
        otpMethod: data.otp_method,
        destinationHint: maskDestination(data.otp_method, data.otp_destination),
      };
    }
    return { step: "method" };
  } catch {
    await clearPendingOtpToken();
    return { step: "passphrase" };
  }
}