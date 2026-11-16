"use server";

import { revalidatePath } from "next/cache";
import { createMemberSupabaseServerClient, requireMemberSession } from "@/lib/member/session";
import { validateActionFormData } from "@/lib/security/guards";

type MarkNotificationReadClient = {
  rpc(functionName: "mark_member_notification_read", args: { p_notification_id: string }): Promise<{
    data: boolean | null;
    error: { message: string } | null;
  }>;
};

export async function markMemberNotificationReadAction(formData: FormData): Promise<void> {
  validateActionFormData(formData);
  await requireMemberSession();
  const notificationId = formData.get("notificationId")?.toString();
  if (!notificationId || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(notificationId)) {
    throw new Error("Notification not found.");
  }

  const client = await createMemberSupabaseServerClient() as unknown as MarkNotificationReadClient;
  const { data, error } = await client.rpc("mark_member_notification_read", { p_notification_id: notificationId });
  if (error || data !== true) throw new Error("This notification could not be marked as read.");

  revalidatePath("/member/notifications");
  revalidatePath("/member/dashboard");
}
