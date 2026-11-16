"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminSessionId } from "@/lib/admin/session";
import { validateActionFormData } from "@/lib/security/guards";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

type PlanAssignmentClient = {
  rpc(functionName: "admin_assign_member_rental_plan", args: {
    p_member_id: string;
    p_plan_id: string;
    p_reviewer_session_id: string;
  }): Promise<{ data: string | null; error: { message: string } | null }>;
};

export async function assignMemberRentalPlanAction(formData: FormData): Promise<void> {
  validateActionFormData(formData);
  const reviewerSessionId = await requireAdminSessionId();
  const memberId = formData.get("memberId")?.toString() ?? "";
  const planId = formData.get("planId")?.toString() ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(memberId) || !/^[0-9a-f-]{36}$/i.test(planId)) {
    redirect("/ashik-loves-jannat/manual-approved-members?assign=error");
  }

  const client = createAdminSupabaseClient() as unknown as PlanAssignmentClient;
  const { data: result, error } = await client.rpc("admin_assign_member_rental_plan", {
    p_member_id: memberId,
    p_plan_id: planId,
    p_reviewer_session_id: reviewerSessionId,
  });
  if (error || !["assigned", "already_assigned"].includes(result ?? "")) {
    redirect("/ashik-loves-jannat/manual-approved-members?assign=error");
  }

  revalidatePath("/admin/manual-approved-members");
  revalidatePath("/admin/members");
  revalidatePath("/member/dashboard");
  revalidatePath("/member/dashboard/payments");
  revalidatePath("/member/rent", "page");
  redirect(`/ashik-loves-jannat/manual-approved-members?assign=${result}`);
}