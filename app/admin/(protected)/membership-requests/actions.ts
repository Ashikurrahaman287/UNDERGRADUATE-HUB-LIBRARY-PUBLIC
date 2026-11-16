"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminSessionId } from "@/lib/admin/session";
import { validateActionFormData } from "@/lib/security/guards";
import { sendSwiftSmsBestEffort } from "@/lib/member/sms";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

type MembershipSmsLookup = {
  from(table: "membership_applications"): {
    select(columns: string): {
      eq(column: "id", value: string): {
        maybeSingle(): PromiseLike<{ data: { member: { phone: string | null } | null } | null; error: { message: string } | null }>;
      };
    };
  };
};

async function reviewMembership(formData: FormData, approve: boolean): Promise<void> {
  const reviewerSessionId = await requireAdminSessionId();
  const applicationId = formData.get("applicationId")?.toString() ?? "";
  const rawPlanId = formData.get("planId")?.toString() ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(applicationId)) throw new Error("Membership application not found.");
  if (approve && !/^[0-9a-f-]{36}$/i.test(rawPlanId)) throw new Error("Choose a valid subscription plan.");

  const client = createAdminSupabaseClient();
  let data: string | null = null;
  let error: { message: string; code?: string } | null = null;
  try {
    const response = await client.rpc("review_membership_application", {
      p_application_id: applicationId,
      p_plan_id: approve ? rawPlanId : null,
      p_reviewer_session_id: reviewerSessionId,
      p_approve: approve,
      p_admin_note: formData.get("adminNote")?.toString().trim().slice(0, 1000) || null,
    });
    data = response.data;
    error = response.error;
  } catch (reviewError) {
    console.error("Membership approval failed:", reviewError);
    console.error("[admin-membership-review] RPC request threw", {
      applicationId,
      approve,
      code: "unknown",
      message: reviewError instanceof Error ? reviewError.message : String(reviewError),
    });
    redirect("/ashik-loves-jannat/membership-requests?review=error");
  }
  const expectedResults = approve ? ["approved", "already_approved"] : ["rejected", "already_rejected"];
  if (error) {
    console.error("Membership approval failed:", error);
    console.error("[admin-membership-review] Database RPC failed", {
      applicationId,
      approve,
      code: error.code ?? "unknown",
      message: error.message,
    });
    redirect("/ashik-loves-jannat/membership-requests?review=error");
  }
  if (!expectedResults.includes(data ?? "")) {
    console.error("[admin-membership-review] Unexpected RPC result", { applicationId, approve, result: data });
    redirect("/ashik-loves-jannat/membership-requests?review=error");
  }

  let smsFailed = false;
  if (approve && data === "approved") {
    try {
      const { data: application, error: lookupError } = await (client as unknown as MembershipSmsLookup)
        .from("membership_applications")
        .select("member:member_profiles(phone)")
        .eq("id", applicationId)
        .maybeSingle();
      if (lookupError || !application?.member?.phone) {
        console.error("Could not load the membership SMS recipient.", lookupError);
        smsFailed = true;
      } else {
        smsFailed = !(await sendSwiftSmsBestEffort({
          phone: application.member.phone,
          message: "Payment has been Received and Your Membership has been Approved.",
        }));
      }
    } catch (smsError) {
      console.error("Could not send the membership approval SMS.", smsError);
      smsFailed = true;
    }
  }

  revalidatePath("/admin");
  revalidatePath("/admin/membership-requests");
  revalidatePath("/admin/payments");
  revalidatePath("/member/dashboard");
  redirect(`/ashik-loves-jannat/membership-requests?review=success${smsFailed ? "&sms=failed" : ""}`);
}

export async function approveMembershipAction(formData: FormData): Promise<void> {
  validateActionFormData(formData);
  await reviewMembership(formData, true);
}

export async function rejectMembershipAction(formData: FormData): Promise<void> {
  validateActionFormData(formData);
  await reviewMembership(formData, false);
}
