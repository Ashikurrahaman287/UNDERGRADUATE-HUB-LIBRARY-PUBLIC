"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminSessionId } from "@/lib/admin/session";
import { validateActionFormData } from "@/lib/security/guards";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

type FineAdminClient = {
  rpc(functionName: "admin_review_fine", args: {
    p_fine_id: string;
    p_admin_session_id: string;
    p_action: string;
    p_amount_bdt: number | null;
    p_note: string;
  }): Promise<{ data: string | null; error: { code?: string } | null }>;
  rpc(functionName: "admin_send_fine_reminder", args: {
    p_fine_id: string;
    p_admin_session_id: string;
  }): Promise<{ data: boolean | null; error: { code?: string } | null }>;
};

function formFineId(formData: FormData): string | null {
  const id = formData.get("fineId")?.toString() ?? "";
  return /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id) ? id : null;
}

export async function reviewFineAction(formData: FormData): Promise<void> {
  validateActionFormData(formData);
  const sessionId = await requireAdminSessionId();
  const fineId = formFineId(formData);
  const action = formData.get("action")?.toString() ?? "";
  const rawAmount = formData.get("amount")?.toString().trim() ?? "";
  const amount = rawAmount ? Number(rawAmount) : null;
  const note = (formData.get("note")?.toString() ?? "").trim().slice(0, 1000);
  if (!fineId || !["override", "waive"].includes(action) || !note || (action === "override" && (amount === null || !Number.isFinite(amount) || amount < 0))) {
    redirect("/ashik-loves-jannat/fines?review=error");
  }
  const client = createAdminSupabaseClient() as unknown as FineAdminClient;
  const { error } = await client.rpc("admin_review_fine", {
    p_fine_id: fineId, p_admin_session_id: sessionId, p_action: action,
    p_amount_bdt: action === "override" ? amount : null, p_note: note,
  });
  if (error) redirect("/ashik-loves-jannat/fines?review=error");
  revalidatePath("/admin/fines");
  revalidatePath("/admin/payments");
  revalidatePath("/member/dashboard/payments");
  redirect(`/ashik-loves-jannat/fines?review=${action}`);
}

export async function sendFineReminderAction(formData: FormData): Promise<void> {
  validateActionFormData(formData);
  const sessionId = await requireAdminSessionId();
  const fineId = formFineId(formData);
  if (!fineId) redirect("/ashik-loves-jannat/fines?reminder=error");
  const client = createAdminSupabaseClient() as unknown as FineAdminClient;
  const { error } = await client.rpc("admin_send_fine_reminder", { p_fine_id: fineId, p_admin_session_id: sessionId });
  if (error) redirect("/ashik-loves-jannat/fines?reminder=error");
  revalidatePath("/admin/fines");
  revalidatePath("/member/notifications");
  redirect("/ashik-loves-jannat/fines?reminder=sent");
}