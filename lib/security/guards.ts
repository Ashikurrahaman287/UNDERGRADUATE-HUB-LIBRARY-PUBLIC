import "server-only";

import { z } from "zod";
import { requireAdminSessionId } from "@/lib/admin/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type AuthorizedRole = "admin" | "member";

export async function assertAuthorized(requiredRole?: AuthorizedRole) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (requiredRole === "admin") {
    const adminSessionId = await requireAdminSessionId();
    return { role: "admin" as const, adminSessionId, user: error ? null : user };
  }

  if (error || !user) throw new Error("Authentication required.");

  if (requiredRole === "member") {
    const { data: profile, error: profileError } = await supabase
      .from("member_profiles")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profileError || !profile) throw new Error("Member authorization required.");
  }

  return { role: requiredRole ?? "authenticated", user, supabase };
}

export function validatePayload<Output>(schema: z.ZodType<Output>, data: unknown): Output {
  const result = schema.safeParse(data);
  if (!result.success) throw new Error("Invalid request payload.");
  return result.data;
}

const serverActionFormDataSchema = z.instanceof(FormData).superRefine((formData, context) => {
  let fieldCount = 0;
  let totalFileBytes = 0;
  for (const [key, value] of formData.entries()) {
    fieldCount += 1;
    if (fieldCount > 128 || key.length > 128) {
      context.addIssue({ code: "custom", message: "Invalid request payload." });
      return;
    }
    if (typeof value === "string" && value.length > 10_000) {
      context.addIssue({ code: "custom", message: "Invalid request payload." });
      return;
    }
    if (value instanceof File) {
      totalFileBytes += value.size;
      if (value.size > 5 * 1024 * 1024 || totalFileBytes > 10 * 1024 * 1024) {
        context.addIssue({ code: "custom", message: "Invalid request payload." });
        return;
      }
    }
  }
});

export function validateActionFormData(formData: FormData): FormData {
  return validatePayload(serverActionFormDataSchema, formData);
}