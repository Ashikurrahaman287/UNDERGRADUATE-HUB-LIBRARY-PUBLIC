"use server";

import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { redirect } from "next/navigation";
import { createAdminSession } from "@/lib/admin/session";
import { getAdminLoginIdentifierHash } from "@/lib/admin/login-rate-limit";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { validateActionFormData } from "@/lib/security/guards";
import {
  isAuthorizedAdminEmail,
  isAuthorizedAdminPhone,
  maskAuthorizedAdminEmail,
  maskAuthorizedAdminPhone,
} from "@/lib/admin/authorized-phones";
import {
  clearPendingOtpToken,
  getPendingOtpToken,
  hashAdminOtp,
  hashPendingOtpToken,
  pendingOtpLifetimeSeconds,
  setPendingOtpToken,
} from "@/lib/admin/otp-challenge";
import { sendSwiftSms } from "@/lib/member/sms";
import { sendAdminEmailOtp, verifyAdminEmailOtp } from "@/lib/admin/email-otp";

export type AdminLoginState = {
  step?: "passphrase" | "method" | "otp";
  error?: string;
  otpMethod?: "phone" | "email";
  destinationHint?: string;
};

const minimumAccessKeyBytes = 24;
const maximumAccessKeyBytes = 1024;

function matchesAccessKey(submitted: string, configured: string): boolean {
  const submittedBytes = Buffer.from(submitted);
  const configuredBytes = Buffer.from(configured);
  return submittedBytes.length > 0
    && submittedBytes.length <= maximumAccessKeyBytes
    && submittedBytes.length === configuredBytes.length
    && timingSafeEqual(submittedBytes, configuredBytes);
}

export async function loginAdmin(_previousState: AdminLoginState, formData: FormData): Promise<AdminLoginState> {
  validateActionFormData(formData);
  const expectedKey = process.env.ADMIN_ACCESS_KEY;
  const expectedKeyBytes = expectedKey ? Buffer.byteLength(expectedKey) : 0;
  if (!expectedKey || expectedKeyBytes < minimumAccessKeyBytes || expectedKeyBytes > maximumAccessKeyBytes) {
    return { step: "passphrase", error: "Unable to complete admin sign-in." };
  }

  let identifierHash: string;
  let client: ReturnType<typeof createAdminSupabaseClient>;
  try {
    client = createAdminSupabaseClient();
    identifierHash = await getAdminLoginIdentifierHash();
    const { data: rateAllowed, error: rateError } = await client.rpc("consume_admin_login_rate_limit", {
      p_ip_hash: identifierHash,
    });
    if (rateError || rateAllowed !== true) return { step: "passphrase", error: "Unable to complete admin sign-in." };
    const { data: isLimited, error } = await client.rpc("is_admin_login_limited", { p_identifier_hash: identifierHash });
    if (error || isLimited) return { step: "passphrase", error: "Unable to complete admin sign-in." };
  } catch {
    return { step: "passphrase", error: "Unable to complete admin sign-in." };
  }

  const submitted = formData.get("accessKey");
  if (typeof submitted !== "string" || !matchesAccessKey(submitted, expectedKey)) {
    try {
      const { error } = await client.rpc("record_admin_login_failure", { p_identifier_hash: identifierHash });
      if (error) return { step: "passphrase", error: "Unable to complete admin sign-in." };
    } catch {
      return { step: "passphrase", error: "Unable to complete admin sign-in." };
    }
    return { step: "passphrase", error: "Unable to complete admin sign-in." };
  }

  try {
    const previousToken = await getPendingOtpToken();
    if (previousToken) {
      await client.from("admin_login_challenges").delete().eq("token_hash", hashPendingOtpToken(previousToken));
    }
    const token = randomBytes(32).toString("base64url");
    const tokenHash = hashPendingOtpToken(token);
    const { error } = await client.from("admin_login_challenges").insert({
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + pendingOtpLifetimeSeconds * 1000).toISOString(),
    });
    if (error) return { step: "passphrase", error: "Unable to complete admin sign-in." };
    await setPendingOtpToken(token);
  } catch {
    return { step: "passphrase", error: "Unable to complete admin sign-in." };
  }

  return { step: "method" };
}

async function validChallenge(token: string) {
  const tokenHash = hashPendingOtpToken(token);
  const { data, error } = await createAdminSupabaseClient()
    .from("admin_login_challenges")
    .select("token_hash, expires_at")
    .eq("token_hash", tokenHash)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  return error || !data ? null : { tokenHash, data };
}

export async function sendAdminOtpAction(_previousState: AdminLoginState, formData: FormData): Promise<AdminLoginState> {
  validateActionFormData(formData);
  const methodValue = formData.get("method");
  if (methodValue !== "phone" && methodValue !== "email") {
    return { step: "method", error: "Unable to complete admin sign-in." };
  }
  const destinationValue = formData.get("destination");
  const destination = typeof destinationValue === "string"
    ? methodValue === "phone" ? destinationValue.trim() : destinationValue.trim().toLowerCase()
    : "";
  const authorized = methodValue === "phone"
    ? isAuthorizedAdminPhone(destination)
    : isAuthorizedAdminEmail(destination);
  const token = await getPendingOtpToken();
  if (!token || !authorized) {
    return { step: "method", error: "Unable to complete admin sign-in." };
  }

  try {
    const challenge = await validChallenge(token);
    if (!challenge) {
      await clearPendingOtpToken();
      return { step: "passphrase", error: "Unable to complete admin sign-in." };
    }
    const ipHash = await getAdminLoginIdentifierHash();
    const client = createAdminSupabaseClient();
    const { data: allowed, error: limitError } = await client.rpc("consume_admin_otp_send_limit", {
      p_ip_hash: ipHash,
      p_challenge_hash: challenge.tokenHash,
    });
    if (limitError || allowed !== true) {
      return { step: "method", error: "Unable to complete admin sign-in." };
    }

    const phoneOtp = methodValue === "phone" ? randomInt(0, 1_000_000).toString().padStart(6, "0") : null;
    const otpHash = methodValue === "phone"
      ? hashAdminOtp(challenge.tokenHash, destination, phoneOtp ?? "")
      : hashAdminOtp(challenge.tokenHash, destination, "supabase-auth-verified");
    const { data: updated, error: updateError } = await client.from("admin_login_challenges")
      .update({
        otp_hash: otpHash,
        otp_method: methodValue,
        otp_destination: destination,
        otp_phone: methodValue === "phone" ? destination : null,
        otp_expires_at: new Date(Date.now() + 3 * 60 * 1000).toISOString(),
      })
      .eq("token_hash", challenge.tokenHash)
      .gt("expires_at", new Date().toISOString())
      .select("token_hash")
      .maybeSingle();
    if (updateError || !updated) return { step: "method", error: "Unable to complete admin sign-in." };

    try {
      if (methodValue === "phone") {
        await sendSwiftSms({ phone: destination, message: `Your admin verification code is ${phoneOtp}. It expires in 3 minutes. Do not share this code.` });
      } else {
        await sendAdminEmailOtp(destination);
      }
    } catch {
      return { step: "method", error: "Unable to complete admin sign-in." };
    }
    return {
      step: "otp",
      otpMethod: methodValue,
      destinationHint: methodValue === "phone" ? maskAuthorizedAdminPhone(destination) : maskAuthorizedAdminEmail(destination),
    };
  } catch {
    return { step: "method", error: "Unable to complete admin sign-in." };
  }
}

export async function verifyAdminOtpAction(_previousState: AdminLoginState, formData: FormData): Promise<AdminLoginState> {
  validateActionFormData(formData);
  const codeValue = formData.get("otp");
  const otp = typeof codeValue === "string" ? codeValue : "";
  const token = await getPendingOtpToken();
  if (!token || !/^\d{6}$/.test(otp)) {
    return { step: "otp", error: "Unable to complete admin sign-in." };
  }

  try {
    const tokenHash = hashPendingOtpToken(token);
    const client = createAdminSupabaseClient();
    const { data: challenge, error: lookupError } = await client.from("admin_login_challenges")
      .select("otp_method, otp_destination, otp_expires_at")
      .eq("token_hash", tokenHash)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (lookupError || !challenge?.otp_method || !challenge.otp_destination || !challenge.otp_expires_at
      || new Date(challenge.otp_expires_at).getTime() <= Date.now()
      || (challenge.otp_method === "phone" && !isAuthorizedAdminPhone(challenge.otp_destination))
      || (challenge.otp_method === "email" && !isAuthorizedAdminEmail(challenge.otp_destination))) {
      await clearPendingOtpToken();
      return { step: "passphrase", error: "Unable to complete admin sign-in." };
    }

    let otpHash = hashAdminOtp(tokenHash, challenge.otp_destination, otp);
    if (challenge.otp_method === "email") {
      const verifiedBySupabaseAuth = await verifyAdminEmailOtp(challenge.otp_destination, otp);
      if (verifiedBySupabaseAuth) {
        otpHash = hashAdminOtp(tokenHash, challenge.otp_destination, "supabase-auth-verified");
      }
    }

    const { data: result, error } = await client.rpc("consume_admin_login_otp", {
      p_token_hash: tokenHash,
      p_otp_hash: otpHash,
    });
    if (error || !result || result !== "verified") {
      if (result === "missing" || result === "expired" || result === "locked") {
        await clearPendingOtpToken();
        return { step: "passphrase", error: "Unable to complete admin sign-in." };
      }
      return {
        step: "otp",
        otpMethod: challenge.otp_method,
        destinationHint: challenge.otp_method === "phone"
          ? maskAuthorizedAdminPhone(challenge.otp_destination)
          : maskAuthorizedAdminEmail(challenge.otp_destination),
        error: "Unable to complete admin sign-in.",
      };
    }

    await clearPendingOtpToken();
    const identifierHash = await getAdminLoginIdentifierHash();
    await client.from("admin_login_attempts").delete().eq("identifier_hash", identifierHash);
    await createAdminSession();
  } catch {
    return { step: "otp", error: "Unable to complete admin sign-in." };
  }

  redirect("/ashik-loves-jannat");
}

export async function adminLoginStepAction(previousState: AdminLoginState, formData: FormData): Promise<AdminLoginState> {
  validateActionFormData(formData);
  switch (formData.get("step")) {
    case "passphrase":
      return loginAdmin(previousState, formData);
    case "method":
      return sendAdminOtpAction(previousState, formData);
    case "otp":
      return verifyAdminOtpAction(previousState, formData);
    default:
      return { step: previousState.step ?? "passphrase", error: "Unable to complete admin sign-in." };
  }
}
