"use server";

import { createAdminSupabaseClient, createServerSupabaseClient } from "@/lib/supabase/server";
import { z } from "zod";
import { isValidBangladeshPhone, normalizeBangladeshPhone } from "@/lib/member/phone";
import { getSafeMemberDestination } from "@/lib/member/redirect";
import { checkAndLockOtpRequest, consumeMemberAuthRateLimit, getClientIpAddress, incrementOtpAddressChanges } from "@/lib/member/auth-rate-limit";
import { validatePayload } from "@/lib/security/guards";

export type MemberOtpResult = { error?: string; redirectTo?: string };

const memberOtpRequestSchema = z.object({
  method: z.enum(["phone", "email"]),
  value: z.string().trim().min(1).max(254),
});

const memberOtpVerificationSchema = memberOtpRequestSchema.extend({
  code: z.string().regex(/^\d{6}$/),
  nextDestination: z.string().max(2048).optional(),
});

function validEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function recordMemberOtpAddressChangeAction(): Promise<{ error?: string; addressChanges?: number }> {
  const clientIp = await getClientIpAddress();
  if (!clientIp) {
    return { error: "Maximum address changes reached. Please wait or refresh." };
  }

  try {
    const result = await incrementOtpAddressChanges(clientIp);
    if (!result.allowed) {
      return { error: result.message ?? "Maximum address changes reached. Please wait or refresh.", addressChanges: result.addressChanges };
    }

    return { addressChanges: result.addressChanges };
  } catch {
    return { error: "Maximum address changes reached. Please wait or refresh." };
  }
}

export async function requestMemberOtpAction(method: "phone" | "email", value: string): Promise<MemberOtpResult> {
  const input = validatePayload(memberOtpRequestSchema, { method, value });
  const normalizedIdentifier = input.method === "phone"
    ? normalizeBangladeshPhone(input.value)
    : input.value.toLowerCase();
  if (input.method === "phone" ? !isValidBangladeshPhone(normalizedIdentifier) : !validEmail(normalizedIdentifier)) {
    return { error: input.method === "phone" ? "Enter a valid Bangladesh mobile number." : "Enter a valid email address." };
  }

  const clientIp = await getClientIpAddress();
  if (!clientIp) {
    return { error: "We could not send a verification code. Try again later." };
  }

  try {
    const rateLimitResult = await checkAndLockOtpRequest(clientIp);
    if (!rateLimitResult.allowed) {
      return { error: rateLimitResult.message ?? "We could not send a verification code. Try again later." };
    }
  } catch {
    return { error: "We could not send a verification code. Try again later." };
  }

  if (!await consumeMemberAuthRateLimit(normalizedIdentifier, "otp_request")) {
    return { error: "We could not send a verification code. Try again later." };
  }
  const client = await createServerSupabaseClient();
  if (input.method === "phone") {
    const phone = normalizedIdentifier;
    const adminClient = createAdminSupabaseClient();
    const { data: memberProfile, error: profileError } = await adminClient
      .from("member_profiles")
      .select("user_id")
      .eq("phone", phone)
      .maybeSingle();
    if (profileError) return { error: "We could not check that sign-in number. Try again later." };

    let shouldCreateUser = !memberProfile;
    if (memberProfile) {
      const { data: authResult, error: authLookupError } = await adminClient.auth.admin.getUserById(memberProfile.user_id);
      if (authLookupError || !authResult.user) return { error: "We could not prepare this member account for phone sign-in. Contact the library for help." };
      if (authResult.user.phone && normalizeBangladeshPhone(authResult.user.phone) !== phone) {
        return { error: "We could not prepare this phone sign-in. Check the number or contact the library for help." };
      }
      if (!authResult.user.phone) {
        const { error: linkError } = await adminClient.auth.admin.updateUserById(memberProfile.user_id, { phone });
        if (linkError) return { error: "We could not prepare this phone sign-in. Check the number or contact the library for help." };
      }
      shouldCreateUser = false;
    }

    const { error } = await client.auth.signInWithOtp({ phone, options: { shouldCreateUser } });
      if (error) console.error("Member phone OTP request failed.", { code: error.code });
    return error ? { error: "We could not send a verification code. Try again later." } : {};
  }

  const email = normalizedIdentifier;
  const { data: memberProfile, error: profileError } = await createAdminSupabaseClient()
    .from("member_profiles")
    .select("user_id")
    .eq("email", email)
    .maybeSingle();
  if (profileError) return { error: "We could not check that sign-in address. Try again later." };

  let shouldCreateUser = !memberProfile;
  if (memberProfile) {
    const { data: authResult, error: authLookupError } = await createAdminSupabaseClient().auth.admin.getUserById(memberProfile.user_id);
    if (authLookupError || !authResult.user) return { error: "We could not check that sign-in address. Try again later." };
    if (authResult.user.email?.trim().toLowerCase() !== email) {
      return { error: "That address is saved as contact information, not as this account's sign-in email. Use the identifier you signed up with." };
    }
    shouldCreateUser = false;
  }

  const { error } = await client.auth.signInWithOtp({ email, options: { shouldCreateUser } });
  if (error) console.error("Member email OTP request failed.", { code: error.code });
  return error ? { error: "We could not send a verification code. Try again later." } : {};
}

export async function verifyMemberOtpAction(
  method: "phone" | "email",
  value: string,
  code: string,
  nextDestination?: string,
): Promise<MemberOtpResult> {
  const input = validatePayload(memberOtpVerificationSchema, { method, value, code, nextDestination });
  const client = await createServerSupabaseClient();
  const identifier = input.method === "phone" ? normalizeBangladeshPhone(input.value) : input.value.toLowerCase();
  if (input.method === "phone" ? !isValidBangladeshPhone(identifier) : !validEmail(identifier)) {
    return { error: "Check your sign-in details and request a new code." };
  }
  if (!await consumeMemberAuthRateLimit(identifier, "otp_verify")) {
    return { error: "That code is invalid, expired, or already used. Request a new code and try again." };
  }

  const verification = input.method === "phone"
    ? await client.auth.verifyOtp({ phone: identifier, token: input.code, type: "sms" })
    : await client.auth.verifyOtp({ email: identifier, token: input.code, type: "email" });
  const { data, error } = verification;
  if (error || !data.user) return { error: "That code is invalid, expired, or already used. Request a new code and try again." };

  if (input.method === "email") {
    const { data: emailProfile, error: emailProfileError } = await createAdminSupabaseClient()
      .from("member_profiles")
      .select("user_id")
      .eq("email", identifier)
      .maybeSingle();
    if (emailProfileError) return { error: "Sign-in succeeded, but your member account could not be checked. Refresh to try again." };
    if (emailProfile && emailProfile.user_id !== data.user.id) {
      await client.auth.signOut();
      return { error: "This email is linked to a different member account. Sign in with your phone or contact the library." };
    }
  }

  const { data: profile, error: profileError } = await client
    .from("member_profiles")
    .select("id")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (profileError) return { error: "Sign-in succeeded, but your member profile could not be checked. Refresh to try again." };

  const destination = getSafeMemberDestination(input.nextDestination);
  return {
    redirectTo: profile
      ? destination ?? "/member/dashboard"
      : destination ? `/member/register?next=${encodeURIComponent(destination)}` : "/member/register",
  };
}