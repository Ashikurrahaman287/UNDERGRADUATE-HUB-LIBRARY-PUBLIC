import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

const SWIFTSMS_DEFAULT_API_URL = "https://swiftsms.astgd.com/api/sms/send";
const DEFAULT_SMS_LABEL = "transactional";
const SWIFTSMS_TIMEOUT_MS = 2200;
const MAX_SWIFTSMS_RESPONSE_BYTES = 8192;
const MAX_HOOK_PAYLOAD_BYTES = 64 * 1024;

interface SendSmsEvent {
  user?: { phone?: string };
  sms?: { otp?: string };
}

class PayloadTooLargeError extends Error {}

function jsonError(message: string, status: number): Response {
  return Response.json({ error: { message } }, { status });
}

function parseHookSecrets(value: string): string[] {
  const secrets = value.split("|").map((secret) => secret.trim()).filter(Boolean);
  if (secrets.length === 0 || secrets.some((secret) => !secret.startsWith("v1,whsec_"))) return [];
  return secrets.map((secret) => secret.slice("v1,whsec_".length));
}

function getSwiftSmsEndpoint(): URL | null {
  try {
    const endpoint = new URL(Deno.env.get("SWIFTSMS_API_URL")?.trim() || SWIFTSMS_DEFAULT_API_URL);
    if (endpoint.protocol !== "https:" || endpoint.hostname !== "swiftsms.astgd.com"
      || endpoint.pathname !== "/api/sms/send" || endpoint.search || endpoint.hash) return null;
    return endpoint;
  } catch {
    return null;
  }
}

async function readLimitedBody(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_SWIFTSMS_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error("SwiftSMS response exceeded the size limit.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

async function readLimitedRequestBody(request: Request): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_HOOK_PAYLOAD_BYTES) {
        await reader.cancel();
        throw new PayloadTooLargeError("Auth Hook payload exceeded the size limit.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(body);
}

Deno.serve(async (request: Request): Promise<Response> => {
  console.info("send-sms: function started");
  if (request.method !== "POST") {
    console.warn("send-sms: rejected unsupported method");
    console.info("send-sms: final failure before payload processing");
    return jsonError("Method not allowed", 405);
  }
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_HOOK_PAYLOAD_BYTES) {
    console.warn("send-sms: rejected oversized Auth Hook payload");
    return jsonError("Payload too large", 413);
  }

  const configuredSecrets = Deno.env.get("SEND_SMS_HOOK_SECRETS")
    || Deno.env.get("SEND_SMS_HOOK_SECRET")
    || "";
  const signingSecrets = parseHookSecrets(configuredSecrets);
  const apiKey = Deno.env.get("SWIFTSMS_API_KEY")?.trim();
  const label = Deno.env.get("SWIFTSMS_SMS_LABEL")?.trim()
    || Deno.env.get("SWIFTSMS_LABEL")?.trim()
    || DEFAULT_SMS_LABEL;
  const endpoint = getSwiftSmsEndpoint();

  if (signingSecrets.length === 0 || !apiKey || !endpoint || !["transactional", "promotional"].includes(label)) {
    console.error("SMS hook is missing valid server configuration.");
    console.info("send-sms: final failure due to server configuration");
    return jsonError("SMS hook is not configured", 500);
  }

  let payload: string;
  try {
    payload = await readLimitedRequestBody(request);
  } catch (error) {
    const tooLarge = error instanceof PayloadTooLargeError;
    console.error("send-sms: Auth Hook payload could not be read within the size limit");
    console.info("send-sms: final failure before signature verification");
    return jsonError(tooLarge ? "Payload too large" : "Invalid webhook payload", tooLarge ? 413 : 400);
  }

  let event: SendSmsEvent | null = null;
  const headers = Object.fromEntries(request.headers.entries());
  for (const signingSecret of signingSecrets) {
    try {
      const webhook = new Webhook(signingSecret);
      event = webhook.verify(payload, headers) as SendSmsEvent;
      break;
    } catch {
      // Try the next configured rotation secret; no secret or payload is logged.
    }
  }
  if (!event) {
    console.warn("send-sms: Auth Hook signature rejected");
    console.info("send-sms: final failure before provider request");
    return jsonError("Invalid webhook signature", 400);
  }
  console.info("send-sms: Auth Hook signature verified");

  const phone = event.user?.phone;
  const otp = event.sms?.otp;
  if (!phone || !/^\+[1-9]\d{7,14}$/.test(phone) || !otp || !/^\d{6}$/.test(otp)) {
    console.warn("send-sms: invalid phone or OTP payload");
    console.info("send-sms: final failure before provider request");
    return jsonError("Invalid SMS hook payload", 400);
  }
  console.info("send-sms: phone and OTP payload validated");

  const smsUrl = new URL(endpoint);
  smsUrl.searchParams.set("apikey", apiKey);
  smsUrl.searchParams.set("phonenumber", phone.replace(/^\+/, ""));
  smsUrl.searchParams.set("message", `Your Undergraduate Hub verification code is ${otp}. Do not share this code. UNDERGRADUATE HUB`);
  smsUrl.searchParams.set("label", label);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SWIFTSMS_TIMEOUT_MS);
  console.info("send-sms: SwiftSMS request started");
  try {
    const response = await fetch(smsUrl, {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    const responseBody = await readLimitedBody(response);
    console.info("send-sms: SwiftSMS response received", {
      status: response.status,
      contentType,
      responseBytes: new TextEncoder().encode(responseBody).byteLength,
    });

    if (!response.ok) {
      console.error("send-sms: SwiftSMS rejected the OTP request", { status: response.status });
      console.info("send-sms: final failure from provider response");
      return jsonError("SMS delivery failed", 502);
    }

    if (contentType.includes("application/json")) {
      try {
        const providerResponse: unknown = JSON.parse(responseBody);
        if (providerResponse === null || typeof providerResponse !== "object"
          || ("error" in providerResponse && Boolean(providerResponse.error))) {
          console.error("send-sms: SwiftSMS returned an unsuccessful JSON response", { status: response.status });
          console.info("send-sms: final failure from provider response");
          return jsonError("SMS delivery failed", 502);
        }
      } catch {
        console.error("send-sms: SwiftSMS returned malformed JSON", { status: response.status });
        console.info("send-sms: final failure from malformed provider response");
        return jsonError("SMS delivery failed", 502);
      }
    }

    console.info("send-sms: SwiftSMS accepted the OTP request; handset delivery is not confirmed");
    console.info("send-sms: final success");
    return Response.json({}, { status: 200 });
  } catch {
    const timedOut = controller.signal.aborted;
    console.error(timedOut ? "send-sms: SwiftSMS request timed out" : "send-sms: SwiftSMS request failed");
    console.info("send-sms: final failure during provider request");
    return jsonError("SMS delivery failed", 502);
  } finally {
    clearTimeout(timeout);
  }
});
