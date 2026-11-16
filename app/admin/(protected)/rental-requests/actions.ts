"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminSessionId } from "@/lib/admin/session";
import { validateActionFormData } from "@/lib/security/guards";
import { sendSwiftSmsBestEffort } from "@/lib/member/sms";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

type RentalRequestSmsLookup = {
  from(table: "rental_requests"): {
    select(columns: string): {
      eq(column: "id", value: string): {
        maybeSingle(): PromiseLike<{ data: { member: { phone: string | null } | null } | null; error: { message: string } | null }>;
      };
    };
  };
};

type RentalReviewRpcClient = {
  rpc(
    functionName: "approve_rental_request" | "reject_rental_request",
    args: { p_request_id: string; p_reviewer_session_id: string; p_admin_note: string | null },
  ): Promise<{ data: string | null; error: { message: string } | null }>;
};

export async function approveRentalAction(formData: FormData): Promise<void> {
  validateActionFormData(formData);
  const reviewerSessionId = await requireAdminSessionId();
  const client = createAdminSupabaseClient() as unknown as RentalReviewRpcClient;
  const requestId = formData.get("requestId")?.toString();
  if (!requestId || !/^[0-9a-f-]{36}$/i.test(requestId)) throw new Error("Rental request not found.");

  const { data: result, error } = await client.rpc("approve_rental_request", {
    p_request_id: requestId,
    p_reviewer_session_id: reviewerSessionId,
    p_admin_note: formData.get("adminNote")?.toString().trim().slice(0, 1000) || null,
  });

  if (error || (result !== "approved" && result !== "already_approved")) redirect("/ashik-loves-jannat/rental-requests?review=error");

  let smsFailed = false;
  if (result === "approved") {
    try {
      const { data: request, error: lookupError } = await (client as unknown as RentalRequestSmsLookup)
        .from("rental_requests")
        .select("member:member_profiles(phone)")
        .eq("id", requestId)
        .maybeSingle();
      if (lookupError || !request?.member?.phone) {
        console.error("Could not load the rental approval SMS recipient.", lookupError);
        smsFailed = true;
      } else {
        smsFailed = !(await sendSwiftSmsBestEffort({
          phone: request.member.phone,
          message: "Your Rental Request Has been Approved.",
        }));
      }
    } catch (smsError) {
      console.error("Could not send the rental approval SMS.", smsError);
      smsFailed = true;
    }
  }

  revalidatePath("/admin");
  revalidatePath("/admin/rental-requests");
  revalidatePath("/admin/rentals");
  revalidatePath("/member/dashboard");
  revalidatePath("/member/dashboard/payments");
  revalidatePath("/member/dashboard/my-books");
  redirect(`/ashik-loves-jannat/rental-requests?review=success${smsFailed ? "&sms=failed" : ""}`);
}

export async function rejectRentalAction(formData: FormData): Promise<void> {
  validateActionFormData(formData);
  const reviewerSessionId = await requireAdminSessionId();
  const client = createAdminSupabaseClient() as unknown as RentalReviewRpcClient;
  const requestId = formData.get("requestId")?.toString();
  const note = formData.get("adminNote")?.toString().trim().slice(0, 1000) || null;

  if (!requestId || !/^[0-9a-f-]{36}$/i.test(requestId)) throw new Error("Rental request not found.");

  const { data: result, error } = await client.rpc("reject_rental_request", {
    p_request_id: requestId,
    p_reviewer_session_id: reviewerSessionId,
    p_admin_note: note,
  });

  if (error || (result !== "rejected" && result !== "already_rejected")) redirect("/ashik-loves-jannat/rental-requests?review=error");

  revalidatePath("/admin");
  revalidatePath("/admin/rental-requests");
  revalidatePath("/admin/rentals");
  revalidatePath("/member/dashboard");
  revalidatePath("/member/dashboard/my-books");
  redirect("/ashik-loves-jannat/rental-requests?review=success");
}
