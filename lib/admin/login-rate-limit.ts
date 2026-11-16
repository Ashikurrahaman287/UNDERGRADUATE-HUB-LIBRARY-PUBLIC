import "server-only";

import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { headers } from "next/headers";

export async function getAdminLoginIdentifierHash(): Promise<string> {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error("The admin session is not configured.");
  }

  const requestHeaders = await headers();
  const clientAddress = requestHeaders.get("x-real-ip")?.trim();
  if (clientAddress && isIP(clientAddress)) {
    return createHmac("sha256", secret).update(clientAddress).digest("hex");
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("A trusted client IP is required for admin login rate limiting.");
  }

  const developmentIdentifier = "development";
  return createHmac("sha256", secret).update(developmentIdentifier).digest("hex");
}