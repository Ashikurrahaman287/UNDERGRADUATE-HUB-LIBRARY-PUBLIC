import "server-only";

import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { headers } from "next/headers";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

type MemberAuthRateLimitOperation = "otp_request" | "otp_verify";

type OtpRateLimitRow = {
  ip_address: string;
  request_count: number;
  address_changes: number;
  locked_until: string | null;
};

function hashValue(secret: string, value: string): string {
  return createHmac("sha256", secret).update(`member-auth-rate-limit:${value}`).digest("hex");
}

export async function getClientIpAddress(): Promise<string | null> {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = requestHeaders.get("x-real-ip")?.trim();
  const candidateIp = forwardedFor || realIp;

  if (!candidateIp || !isIP(candidateIp)) {
    return candidateIp && isIP(candidateIp) ? candidateIp : null;
  }

  return candidateIp;
}

export async function checkAndLockOtpRequest(ipAddress: string): Promise<{
  allowed: boolean;
  message?: string;
}> {
  if (!ipAddress) {
    return { allowed: false, message: "Too many OTP attempts from this connection. Please wait 15 minutes before trying again." };
  }

  const client = createAdminSupabaseClient();
  const { data, error } = await client.rpc("consume_member_otp_ip_attempt", {
    p_ip_address: ipAddress,
  });

  if (error) {
    console.error("Member OTP IP rate-limit RPC failed.", { code: error.code });
    throw new Error("Could not validate OTP attempt limits. Try again later.");
  }

  return data === true
    ? { allowed: true }
    : { allowed: false, message: "Too many OTP attempts from this connection. Please wait 15 minutes before trying again." };
}

export async function incrementOtpAddressChanges(ipAddress: string): Promise<{
  allowed: boolean;
  addressChanges: number;
  message?: string;
}> {
  if (!ipAddress) {
    return {
      allowed: false,
      addressChanges: 0,
      message: "Maximum address changes reached. Please wait or refresh.",
    };
  }

  const client = createAdminSupabaseClient();
  const { data, error } = await client
    .from("otp_rate_limits")
    .select("ip_address, request_count, address_changes, locked_until")
    .eq("ip_address", ipAddress)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    throw new Error("Could not update the address change limit. Try again later.");
  }

  const current = (data ?? {
    ip_address: ipAddress,
    request_count: 0,
    address_changes: 0,
    locked_until: null,
  }) as OtpRateLimitRow;

  const now = new Date();
  if (current.locked_until && new Date(current.locked_until) > now) {
    return {
      allowed: false,
      addressChanges: Number(current.address_changes ?? 0),
      message: "Maximum address changes reached. Please wait or refresh.",
    };
  }

  const nextAddressChanges = Number(current.address_changes ?? 0) + 1;
  const shouldLock = nextAddressChanges >= 3;
  const lockedUntil = shouldLock ? new Date(now.getTime() + 15 * 60 * 1000).toISOString() : current.locked_until;

  const { error: upsertError } = await client
    .from("otp_rate_limits")
    .upsert({
      ip_address: ipAddress,
      request_count: Number(current.request_count ?? 0),
      address_changes: nextAddressChanges,
      locked_until: lockedUntil,
    }, { onConflict: "ip_address" });

  if (upsertError) {
    throw new Error("Could not update the address change limit. Try again later.");
  }

  if (shouldLock) {
    return {
      allowed: false,
      addressChanges: nextAddressChanges,
      message: "Maximum address changes reached. Please wait or refresh.",
    };
  }

  return {
    allowed: true,
    addressChanges: nextAddressChanges,
  };
}

export async function consumeMemberAuthRateLimit(
  identifier: string,
  operation: MemberAuthRateLimitOperation,
): Promise<boolean> {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    console.error("Member auth rate limiting is not configured.");
    return false;
  }

  const clientAddress = await getClientIpAddress();
  if (process.env.NODE_ENV === "production" && !clientAddress) return false;

  const ip = clientAddress ?? "development";
  const client = createAdminSupabaseClient();
  const { data, error } = await client.rpc("consume_member_auth_rate_limit", {
    p_ip_hash: hashValue(secret, ip),
    p_identifier_hash: hashValue(secret, identifier.trim().toLowerCase()),
    p_operation: operation,
  });

  if (error) {
    console.error("Member auth rate-limit RPC failed.", { code: error.code });
    return false;
  }

  return data === true;
}