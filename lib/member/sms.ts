import "server-only";

import { normalizeBangladeshPhone } from "@/lib/member/phone";

export const SWIFTSMS_BASE_URL = "https://swiftsms.astgd.com/api/sms/send";
export const SWIFTSMS_DEFAULT_LABEL = "transactional";
const SMS_SIGNATURE = "UNDERGRADUATE HUB";
const MAX_SMS_LENGTH = 480;

export function withSwiftSmsSignature(message: string): string {
  const trimmedMessage = message.trim();
  const messageBody = trimmedMessage.endsWith(SMS_SIGNATURE)
    ? trimmedMessage.slice(0, -SMS_SIGNATURE.length).trimEnd()
    : trimmedMessage;
  const limitedBody = messageBody.slice(0, MAX_SMS_LENGTH - SMS_SIGNATURE.length - 1).trimEnd();

  return limitedBody ? `${limitedBody} ${SMS_SIGNATURE}` : SMS_SIGNATURE;
}

export function getSwiftSmsApiKey(): string {
  const apiKey = process.env.SWIFTSMS_API_KEY;

  if (!apiKey) {
    throw new Error("SWIFTSMS_API_KEY is not configured.");
  }

  return apiKey.trim();
}

export function buildSwiftSmsUrl(phone: string, message: string, label = SWIFTSMS_DEFAULT_LABEL): string {
  const normalizedPhone = normalizeBangladeshPhone(phone);

  if (!normalizedPhone) {
    throw new Error("A valid Bangladesh mobile number is required for SMS delivery.");
  }

  const url = new URL(SWIFTSMS_BASE_URL);
  url.searchParams.set("apikey", getSwiftSmsApiKey());
  url.searchParams.set("phonenumber", normalizedPhone.replace(/^\+/, ""));
  url.searchParams.set("message", withSwiftSmsSignature(message));
  url.searchParams.set("label", label);

  return url.toString();
}

export async function sendSwiftSms({
  phone,
  message,
  label = SWIFTSMS_DEFAULT_LABEL,
}: {
  phone: string;
  message: string;
  label?: "transactional" | "promotional";
}): Promise<string> {
  const url = buildSwiftSmsUrl(phone, message, label);

  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(`SwiftSMS request failed (${response.status}).`);
  }

  return responseText;
}

export async function sendSwiftSmsBestEffort({ phone, message }: { phone: string; message: string }): Promise<boolean> {
  try {
    await sendSwiftSms({ phone, message });
    return true;
  } catch (error) {
    console.error("SwiftSMS notification delivery failed.", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return false;
  }
}
