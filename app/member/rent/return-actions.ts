"use server";

import { revalidatePath } from "next/cache";
import { createMemberSupabaseServerClient, requireMemberSession } from "@/lib/member/session";

export type ReturnRequestState = { error?: string; success?: string };
export type RenewalPaymentState = { error?: string; success?: string };

type MemberRentalBillingClient = {
  rpc(functionName: "request_rental_return", args: {
    p_rental_id: string;
    p_review_text: string;
    p_reading_experience_rating: number;
    p_service_experience_rating: number;
    p_book_quality_rating: number;
    p_book_details_rating: number;
    p_payment_method: string | null;
    p_transaction_id: string | null;
  }): Promise<{ data: string | null; error: { code?: string } | null }>;
  rpc(functionName: "submit_subscription_renewal", args: {
    p_payment_method: string;
    p_transaction_id: string;
  }): Promise<{ data: string | null; error: { code?: string } | null }>;
};
type MemberIdentityClient = {
  from(table: "member_profiles"): {
    select(columns: string): {
      eq(column: "user_id", value: string): {
        maybeSingle(): PromiseLike<{ data: { is_id_verified: boolean; verification_status: "PENDING" | "APPROVED" | "REJECTED"; id_card_url: string | null } | null; error: { message: string } | null }>;
      };
    };
  };
};

function validRentalId(value: string): boolean {
  return /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
}

function normalizeTransactionId(value: string): string {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

function readRating(formData: FormData, field: string): number | null {
  const rating = Number(formData.get(field));
  return Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null;
}

function revalidateMemberPages(): void {
  revalidatePath("/member/dashboard");
  revalidatePath("/member/dashboard/my-books");
  revalidatePath("/member/dashboard/payments");
}

export async function requestRentalReturnAction(_previousState: ReturnRequestState, formData: FormData): Promise<ReturnRequestState> {
  await requireMemberSession();
  const rentalId = (formData.get("rentalId") ?? "").toString();
  const reviewText = (formData.get("reviewText") ?? "").toString().trim();
  const readingExperienceRating = readRating(formData, "readingExperienceRating");
  const serviceExperienceRating = readRating(formData, "serviceExperienceRating");
  const bookQualityRating = readRating(formData, "bookQualityRating");
  const bookDetailsRating = readRating(formData, "bookDetailsRating");
  const paymentMethod = (formData.get("paymentMethod") ?? "").toString().trim();
  const transactionId = normalizeTransactionId((formData.get("transactionId") ?? "").toString());

  if (!validRentalId(rentalId)) return { error: "Choose a valid rental before requesting a return." };
  if (!reviewText || reviewText.length > 4000) return { error: "Write a review of up to 4,000 characters before requesting a return." };
  if (readingExperienceRating === null || serviceExperienceRating === null || bookQualityRating === null || bookDetailsRating === null) {
    return { error: "Choose a one-to-five-star rating for each category." };
  }
  if ((paymentMethod || transactionId) && (!['bkash', 'nagad'].includes(paymentMethod) || !/^[A-Z0-9]{10}$/.test(transactionId))) {
    return { error: "Enter a valid bKash or Nagad TXID to submit your fine payment." };
  }

  const client = await createMemberSupabaseServerClient() as unknown as MemberRentalBillingClient;
  const { data: result, error } = await client.rpc("request_rental_return", {
    p_rental_id: rentalId,
    p_review_text: reviewText,
    p_reading_experience_rating: readingExperienceRating,
    p_service_experience_rating: serviceExperienceRating,
    p_book_quality_rating: bookQualityRating,
    p_book_details_rating: bookDetailsRating,
    p_payment_method: paymentMethod || null,
    p_transaction_id: transactionId || null,
  });
  if (error || !["return_requested", "payment_pending_return_requested", "already_requested"].includes(result ?? "")) {
    console.error("[member-return] Return request failed", { code: error?.code ?? "unknown" });
    return { error: error?.code === "23505"
      ? "A fine payment is already pending or this TXID was submitted. Check Payments before retrying."
      : "The return request could not be submitted. Refresh and try again." };
  }

  revalidateMemberPages();
  revalidatePath("/books/[slug]", "page");
  return { success: result === "payment_pending_return_requested"
    ? "Return requested. Your fine TXID is pending library verification."
    : result === "already_requested"
      ? "This return is already awaiting the library."
      : "Return requested. The library will confirm the handover." };
}

export async function submitSubscriptionRenewalAction(_previousState: RenewalPaymentState, formData: FormData): Promise<RenewalPaymentState> {
  const session = await requireMemberSession();
  const { data: identity, error: identityError } = await (session.supabase as unknown as MemberIdentityClient)
    .from("member_profiles")
    .select("is_id_verified, verification_status, id_card_url")
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (identityError || !identity?.is_id_verified || identity.verification_status !== "APPROVED" || !identity.id_card_url) {
    throw new Error("User ID not verified.");
  }

  const paymentMethod = (formData.get("paymentMethod") ?? "").toString().trim();
  const transactionId = normalizeTransactionId((formData.get("transactionId") ?? "").toString());
  if (!['bkash', 'nagad'].includes(paymentMethod)) return { error: "Choose bKash or Nagad." };
  if (!/^[A-Z0-9]{10}$/.test(transactionId)) return { error: "Enter the 10-character transaction ID shown in your payment receipt." };

  const client = await createMemberSupabaseServerClient() as unknown as MemberRentalBillingClient;
  const { error } = await client.rpc("submit_subscription_renewal", {
    p_payment_method: paymentMethod,
    p_transaction_id: transactionId,
  });
  if (error) {
    console.error("[member-renewal] Renewal payment submission failed", { code: error.code ?? "unknown" });
    return { error: error.code === "23505"
      ? "This TXID or a subscription payment is already awaiting review."
      : "Subscription payment could not be submitted. Check your plan and try again." };
  }

  revalidateMemberPages();
  return { success: "Renewal payment submitted for library review. If approved early, your next 30-day cycle begins when the current one ends; locked referral days are added automatically." };
}