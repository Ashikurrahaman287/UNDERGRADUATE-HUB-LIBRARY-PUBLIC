import "server-only";

import { createHmac, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

const cookieName = "uhl-admin-session";
const sessionLifetimeSeconds = 60 * 60 * 8;
type AdminSessionLookupClient = {
  from(table: "admin_sessions"): {
    select(columns: "id"): {
      eq(column: "token_hash", value: string): {
        gt(column: "expires_at", value: string): {
          maybeSingle(): Promise<{ data: { id: string } | null; error: { message: string } | null }>;
        };
      };
    };
    update(values: { last_seen_at: string }): {
      eq(column: "id", value: string): PromiseLike<unknown>;
    };
  };
};

function hashToken(token: string): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error("The admin session is not configured.");
  }
  return createHmac("sha256", secret).update(token).digest("hex");
}

export async function createAdminSession(): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + sessionLifetimeSeconds * 1000);
  const { error } = await createAdminSupabaseClient().from("admin_sessions").insert({
    token_hash: hashToken(token),
    expires_at: expiresAt.toISOString(),
    last_seen_at: now.toISOString(),
    is_super_admin: true,
  });
  if (error) throw new Error("Unable to create an admin session.");

  const cookieStore = await cookies();
  cookieStore.set(cookieName, token, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: sessionLifetimeSeconds,
  });
}

export async function hasAdminSession(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(cookieName)?.value;
    if (!token || token.length > 128) return false;

    const client = createAdminSupabaseClient();
    const now = new Date().toISOString();
    const { data, error } = await client
      .from("admin_sessions")
      .select("id")
      .eq("token_hash", hashToken(token))
      .gt("expires_at", now)
      .maybeSingle();
    if (error || !data) return false;

    await client.from("admin_sessions").update({ last_seen_at: now }).eq("id", data.id);
    return true;
  } catch {
    return false;
  }
}

export async function requireAdminSessionId(): Promise<string> {
  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value;
  if (!token || token.length > 128) notFound();

  const now = new Date().toISOString();
  const client = createAdminSupabaseClient() as unknown as AdminSessionLookupClient;
  let data: { id: string } | null = null;
  try {
    const result = await client
      .from("admin_sessions")
      .select("id")
      .eq("token_hash", hashToken(token))
      .gt("expires_at", now)
      .maybeSingle();
    if (!result.error) data = result.data;
  } catch {
    data = null;
  }

  if (!data) notFound();

  await client
    .from("admin_sessions")
    .update({ last_seen_at: now })
    .eq("id", data.id);

  return data.id;
}

export async function clearAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value;
  if (token && token.length <= 128) {
    try {
      await createAdminSupabaseClient().from("admin_sessions").delete().eq("token_hash", hashToken(token));
    } catch {
      // Clear the browser cookie even if the database is temporarily unavailable.
    }
  }
  cookieStore.set(cookieName, "", {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });
}

export async function requireAdminSession(): Promise<void> {
  if (!(await hasAdminSession())) notFound();
}

export async function requireSuperAdminSessionId(): Promise<string> {
  const adminSessionId = await requireAdminSessionId();
  const client = createAdminSupabaseClient();
  const { data, error } = await client
    .from("admin_sessions")
    .select("id")
    .eq("id", adminSessionId)
    .eq("is_super_admin", true)
    .maybeSingle();

  if (error || !data) notFound();
  return adminSessionId;
}

export async function requireSuperAdminSession(): Promise<void> {
  if (!(await hasAdminSession())) notFound();
  await requireSuperAdminSessionId();
}
