import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/database.types";

function requiredEnvironmentValue(primaryName: string, fallbackName?: string): string {
  const value = process.env[primaryName] ?? (fallbackName ? process.env[fallbackName] : undefined);
  if (!value) {
    throw new Error("The library database is not configured. Set the required Supabase environment variables.");
  }
  return value;
}

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    requiredEnvironmentValue("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"),
    requiredEnvironmentValue("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, {
                ...options,
                httpOnly: true,
                secure: true,
                sameSite: options?.sameSite ?? "lax",
                path: options?.path ?? "/",
              });
            });
          } catch {
            // Ignore if the request is not a standard cookie context.
          }
        },
      },
    },
  );
}

export async function createPublicSupabaseClient() {
  return createServerSupabaseClient();
}

export function createAdminSupabaseClient() {
  return createServerClient<Database>(
    requiredEnvironmentValue("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"),
    requiredEnvironmentValue("SUPABASE_SERVICE_ROLE_KEY"),
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {
          return;
        },
      },
    },
  );
}
