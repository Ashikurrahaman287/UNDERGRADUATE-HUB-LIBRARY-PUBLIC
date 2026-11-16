"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminSessionId } from "@/lib/admin/session";
import { validateActionFormData } from "@/lib/security/guards";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { sendSwiftSmsBestEffort } from "@/lib/member/sms";

type PaymentReviewClient = {
  rpc(functionName: "review_member_payment_submission", args: {
    p_payment_id: string;
    p_reviewer_session_id: string;
    p_approve: boolean;
    p_admin_note: string | null;
  }): Promise<{ data: string | null; error: { code?: string } | null }>;
};
export async function reviewMemberPaymentAction(formData: FormData): Promise<void> {
  validateActionFormData(formData);
  const reviewerSessionId = await requireAdminSessionId();
  const paymentId = formData.get("paymentId")?.toString() ?? "";
  const decision = formData.get("decision")?.toString();
  const adminNote = (formData.get("adminNote")?.toString() ?? "").trim().slice(0, 1000) || null;
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(paymentId) || !["approve", "reject"].includes(decision ?? "")) {
    redirect("/ashik-loves-jannat/payments?review=error");
  }
  const client = createAdminSupabaseClient() as unknown as PaymentReviewClient;
  const { data: result, error } = await client.rpc("review_member_payment_submission", {
    p_payment_id: paymentId, p_reviewer_session_id: reviewerSessionId,
    p_approve: decision === "approve", p_admin_note: adminNote,
  });
  if (error || !["approved", "rejected", "already_approved", "already_rejected"].includes(result ?? "")) {
    redirect("/ashik-loves-jannat/payments?review=error");
  }
  revalidatePath("/admin/payments");
  revalidatePath("/admin/fines");
  revalidatePath("/admin/subscriptions");
  revalidatePath("/member/dashboard/payments");
  revalidatePath("/member/dashboard/my-books");
  revalidatePath("/member/dashboard/referrals");
  revalidatePath("/member/dashboard");
  redirect(`/ashik-loves-jannat/payments?review=${decision === "approve" ? "approved" : "rejected"}`);
}

export async function reviewWalletTransactionAction(): Promise<void> {
  await requireAdminSessionId();
  redirect("/ashik-loves-jannat/payments?review=error");
}

type UnifiedPaymentReviewClient = {
  rpc(functionName: string, args: Record<string, unknown>): Promise<{ data: string | null; error: { code?: string } | null }>;
};

type ReviewSmsLookupClient = {
  from(table: "membership_applications" | "rental_requests"): {
    select(columns: string): {
      eq(column: "id", value: string): {
        maybeSingle(): PromiseLike<{ data: { member: { phone: string | null } | null } | null; error: { message: string } | null }>;
      };
    };
  };
};

const uuidPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

export async function reviewUnifiedPaymentAction(formData: FormData): Promise<void> {
  validateActionFormData(formData);
  const reviewerSessionId = await requireAdminSessionId();
  const recordId = formData.get("recordId")?.toString() ?? "";
  const recordType = formData.get("recordType")?.toString() ?? "";
  const relatedId = formData.get("relatedId")?.toString() ?? "";
  const decision = formData.get("decision")?.toString() ?? "";
  const adminNote = (formData.get("adminNote")?.toString() ?? "").trim().slice(0, 1000);
  const planId = formData.get("planId")?.toString() ?? "";
  const returnToError = "/ashik-loves-jannat/payments?review=error";

  if (!uuidPattern.test(recordId) || !["approve", "reject"].includes(decision)
    || (decision === "reject" && !adminNote)) {
    redirect(returnToError);
  }

  const approve = decision === "approve";
  const client = createAdminSupabaseClient();
  const rpcClient = client as unknown as UnifiedPaymentReviewClient;
  let result: string | null = null;
  let rpcError: { code?: string } | null = null;
  let smsSource: "membership_applications" | "rental_requests" | null = null;
  let smsRecordId = "";

  if (recordType === "membership" && uuidPattern.test(relatedId)) {
    if (approve && !uuidPattern.test(planId)) redirect(returnToError);
    const response = await rpcClient.rpc("review_membership_application", {
      p_application_id: relatedId,
      p_plan_id: approve ? planId : null,
      p_reviewer_session_id: reviewerSessionId,
      p_approve: approve,
      p_admin_note: adminNote || null,
    });
    result = response.data;
    rpcError = response.error;
    smsSource = "membership_applications";
    smsRecordId = relatedId;
  } else if (recordType === "rental" && uuidPattern.test(relatedId)) {
    const response = await rpcClient.rpc(approve ? "approve_rental_request" : "reject_rental_request", {
      p_request_id: relatedId,
      p_reviewer_session_id: reviewerSessionId,
      p_admin_note: adminNote || null,
    });
    result = response.data;
    rpcError = response.error;
    smsSource = "rental_requests";
    smsRecordId = relatedId;
  } else if (recordType === "fine" || recordType === "renewal") {
    const response = await rpcClient.rpc("review_member_payment_submission", {
      p_payment_id: recordId,
      p_reviewer_session_id: reviewerSessionId,
      p_approve: approve,
      p_admin_note: adminNote || null,
    });
    result = response.data;
    rpcError = response.error;
  } else {
    redirect(returnToError);
  }

  const expectedResults = approve
    ? ["approved", "already_approved"]
    : ["rejected", "already_rejected", "already_failed"];
  if (rpcError || !expectedResults.includes(result ?? "")) redirect(returnToError);

  let smsFailed = false;
  if (approve && result === "approved" && smsSource) {
    try {
      const { data: record, error } = await (client as unknown as ReviewSmsLookupClient)
        .from(smsSource)
        .select("member:member_profiles(phone)")
        .eq("id", smsRecordId)
        .maybeSingle();
      if (error || !record?.member?.phone) {
        smsFailed = true;
      } else {
        const message = smsSource === "membership_applications"
          ? "Payment has been Received and Your Membership has been Approved."
          : "Your Rental Request Has been Approved.";
        smsFailed = !(await sendSwiftSmsBestEffort({ phone: record.member.phone, message }));
      }
    } catch {
      smsFailed = true;
    }
  }

  for (const path of [
    "/admin/payments",
    "/admin/membership-requests",
    "/admin/rental-requests",
    "/admin/fines",
    "/admin/subscriptions",
    "/admin/active-members",
    "/member/dashboard/payments",
    "/member/dashboard/my-books",
    "/member/dashboard/referrals",
    "/member/dashboard",
  ]) revalidatePath(path);

  redirect(`/ashik-loves-jannat/payments?review=${approve ? "approved" : "rejected"}${smsFailed ? "&sms=failed" : ""}`);
}