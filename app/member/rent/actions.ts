"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { createMemberSupabaseServerClient, requireMemberSession } from "@/lib/member/session";
import { termsAcceptanceToken, termsPolicyVersion } from "@/lib/terms";
import { encryptPiiField } from "@/lib/security/pii";
import { hasSupportedImageSignature, supportedImageExtension } from "@/lib/security/image-validation";
import { validateActionFormData } from "@/lib/security/guards";

export type RentalRequestState = {
  error?: string;
  success?: string;
  fieldErrors?: Partial<Record<"termsAccepted" | "paymentMethod" | "payerPhone" | "transactionId", string>>;
};

const maximumProofBytes = 5 * 1024 * 1024;

type MemberReservationQueueClient = {
  rpc(
    functionName: "get_my_book_reservations",
    args: Record<never, never>,
  ): Promise<{
    data: { reservation_id: string; book_id: string; status: string; queue_position: number | null }[] | null;
    error: { message: string } | null;
  }>;
};

function normalizeTransactionId(value: string): string {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

async function uploadProof(file: File | null, memberId: string): Promise<string | null> {
  if (!file || file.size === 0) return null;
  if (file.size > maximumProofBytes) throw new Error("The proof image must be smaller than 5MB.");
  if (file.type !== "image/jpeg" && file.type !== "image/png") throw new Error("Upload a JPG or PNG payment proof.");
  const extension = supportedImageExtension(file.type);
  if (!extension) throw new Error("Upload a JPG or PNG payment proof.");
  if (!hasSupportedImageSignature(new Uint8Array(await file.arrayBuffer()), file.type)) {
    throw new Error("The selected payment proof is not a valid image of that type.");
  }

  const path = `payment-proofs/${memberId}/${randomUUID()}.${extension}`;
  const client = await createMemberSupabaseServerClient();
  const { error } = await client.storage.from("payment-proofs").upload(path, file, { upsert: false, contentType: file.type, cacheControl: "0" });
  if (error) throw new Error(error.message || "The proof image could not be uploaded.");
  return path;
}

export async function submitRentalRequestAction(_previousState: RentalRequestState, formData: FormData): Promise<RentalRequestState> {
  validateActionFormData(formData);
  const session = await requireMemberSession();
  const client = await createMemberSupabaseServerClient();

  const { data: member } = await client
    .from("member_profiles")
    .select("id, membership_status, current_plan_id, is_id_verified, verification_status, id_card_url")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (!member || member.membership_status !== "active") throw new Error("Active membership required to rent books.");
  if (!member.is_id_verified || member.verification_status !== "APPROVED" || !member.id_card_url) {
    throw new Error("Active membership required to rent books.");
  }
  if (formData.get("termsAccepted") !== termsAcceptanceToken) {
    return { fieldErrors: { termsAccepted: "Accept the Terms & Conditions before submitting your rental request." } };
  }

  const { data: outstandingFine, error: fineLookupError } = await client.from("fine_ledger")
    .select("id")
    .eq("member_id", member.id)
    .eq("status", "outstanding")
    .limit(1)
    .maybeSingle();
  if (fineLookupError) return { error: "Your overdue fee balance could not be checked. Refresh and try again." };
  if (outstandingFine) return { error: "Pay your outstanding overdue fees with bKash or Nagad when submitting your return request before requesting another rental." };

  const bookId = (formData.get("bookId") ?? "").toString();
  if (!bookId) return { error: "Select a book to rent." };

  const now = new Date().toISOString();
  let latestSubscriptionQuery = client
    .from("member_subscriptions")
    .select("id, plan_id, status, ends_at")
    .eq("member_id", member.id);
  if (member.current_plan_id) latestSubscriptionQuery = latestSubscriptionQuery.eq("plan_id", member.current_plan_id);
  const { data: latestSubscription, error: subscriptionError } = await latestSubscriptionQuery
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subscriptionError) return { error: "Your subscription status could not be checked. Refresh and try again." };
  const subscriptionIsActive = Boolean(latestSubscription?.status === "active" && latestSubscription.ends_at && latestSubscription.ends_at > now);
  if (latestSubscription && !subscriptionIsActive) throw new Error("Active membership required to rent books.");
  if (subscriptionIsActive && member.current_plan_id && member.current_plan_id !== latestSubscription?.plan_id) {
    return { error: "Your active subscription does not match your assigned plan. Contact the library." };
  }
  const planId = member.current_plan_id ?? latestSubscription?.plan_id;
  if (!planId) return { error: "Your rental plan is unavailable. Contact the library before requesting a book." };

  const isFirstRentalSubscription = !latestSubscription;
  const paymentMethod = (formData.get("paymentMethod") ?? "").toString().trim();
  const transactionId = normalizeTransactionId((formData.get("transactionId") ?? "").toString());
  const payerPhone = (formData.get("payerPhone") ?? "").toString().replace(/\D/g, "");
  const proofValue = formData.get("paymentProof");
  const proof = proofValue instanceof File ? proofValue : null;
  const fieldErrors: RentalRequestState["fieldErrors"] = {};
  if (isFirstRentalSubscription && !["bkash", "nagad"].includes(paymentMethod)) fieldErrors.paymentMethod = "Choose bKash or Nagad.";
  if (isFirstRentalSubscription && !/^01\d{9}$/.test(payerPhone)) fieldErrors.payerPhone = "Enter an 11-digit Bangladesh mobile number beginning with 01.";
  if (isFirstRentalSubscription && !/^[A-Z0-9]{10}$/.test(transactionId)) fieldErrors.transactionId = "Enter the 10-character transaction ID shown in your payment receipt.";
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const adminClient = createAdminSupabaseClient();
  const { data: book } = await adminClient
    .from("books")
    .select("id, title, availability, is_active")
    .eq("id", bookId)
    .maybeSingle();

  if (!book || book.is_active === false) {
    return { error: "This book could not be found." };
  }

  if (book.availability !== "available") {
    return { error: "This book is no longer available for a rental request. Refresh its page to check reservation options." };
  }

  const { data: existingRequest } = await client
    .from("rental_requests")
    .select("id, status, amount_bdt, subscription_plan_id, rental_day_credit_id")
    .eq("member_id", member.id)
    .eq("book_id", book.id)
    .in("status", ["pending", "approved"])
    .maybeSingle();

  if (existingRequest) {
    return { error: "You already have a pending or approved rental request for this book." };
  }

  const { data: activeRental } = await client
    .from("rentals")
    .select("id")
    .eq("member_id", member.id)
    .eq("book_id", book.id)
    .in("status", ["pending", "active", "overdue"])
    .maybeSingle();

  if (activeRental) {
    return { error: "You already have an active rental for this book." };
  }

  const { data: memberReservations, error: reservationsError } = await (client as unknown as MemberReservationQueueClient)
    .rpc("get_my_book_reservations", {});
  if (reservationsError || !memberReservations) {
    return { error: "Your reservation priority could not be checked. Try again shortly." };
  }
  const frontReservation = memberReservations.find((reservation) =>
    reservation.book_id === book.id
    && ["waiting", "notified"].includes(reservation.status)
    && reservation.queue_position === 1,
  );

  const { data: plan } = await adminClient
    .from("subscription_plans")
    .select("id, name, price_bdt, duration_days")
    .eq("id", planId)
    .eq("is_active", true)
    .maybeSingle();

  if (!plan) {
    return { error: "Your active subscription plan is not available right now." };
  }
  if (plan.duration_days !== 30) {
    return { error: "The selected rental plan must be configured for 30 days. Contact the library." };
  }
  const requestAmount = isFirstRentalSubscription ? Number(plan.price_bdt) : 0;
  if (isFirstRentalSubscription && (!Number.isFinite(requestAmount) || requestAmount <= 0)) {
    return { error: "The 30-day subscription price is not configured correctly. Contact the library." };
  }

  let screenshotPath: string | null = null;
  if (isFirstRentalSubscription) {
    const duplicateCheck = await client
      .from("payment_submissions")
      .select("id")
      .eq("transaction_id", transactionId)
      .in("status", ["pending", "approved"])
      .maybeSingle();
    if (duplicateCheck.error) return { error: "The payment transaction check is temporarily unavailable." };
    if (duplicateCheck.data) return { error: "This transaction ID has already been submitted for review." };

    try {
      screenshotPath = await uploadProof(proof, member.id);
    } catch (error) {
      return { error: error instanceof Error ? error.message : "The payment proof could not be uploaded." };
    }
  }

  if (isFirstRentalSubscription) {
    const { error: submissionError } = await adminClient.rpc("submit_first_rental_request", {
      p_member_id: member.id,
      p_book_id: book.id,
      p_reservation_request_id: frontReservation?.reservation_id ?? null,
      p_plan_id: plan.id,
      p_amount_bdt: requestAmount,
      p_payment_method: paymentMethod,
      p_transaction_id: transactionId,
      p_payer_phone: encryptPiiField(payerPhone, "payer_phone") ?? "",
      p_screenshot_path: screenshotPath,
      p_terms_version: termsPolicyVersion,
    });

    if (submissionError) {
      if (screenshotPath) await adminClient.storage.from("payment-proofs").remove([screenshotPath]);
      console.error("[rental-request] Atomic first subscription submission failed", { code: submissionError.code ?? "unknown" });
      if (submissionError.code === "23505") return { error: "This transaction ID or rental request has already been submitted." };
      if (submissionError.message.includes("earlier eligible reservation")) return { error: "An earlier member has reservation priority for this book." };
      return { error: "Your first rental request and payment could not be submitted. Refresh and try again." };
    }
  } else {
    const { data: rentalRequest, error: requestError } = await client
      .from("rental_requests")
      .insert({
        member_id: member.id,
        book_id: book.id,
        reservation_request_id: frontReservation?.reservation_id ?? null,
        subscription_plan_id: plan.id,
        rental_day_credit_id: null,
        amount_bdt: requestAmount,
        terms_accepted_at: new Date().toISOString(),
        terms_version: termsPolicyVersion,
        status: "pending",
      })
      .select("id")
      .single();

    if (requestError || !rentalRequest) {
      console.error("[rental-request] Rental request insert failed", { code: requestError?.code ?? "unknown" });
      if (requestError?.message.includes("earlier eligible reservation")) {
        return { error: "An earlier member has reservation priority for this book." };
      }
      if (requestError?.message.includes("paid rental request must have a positive amount")) {
        return { error: "Rental setup needs a database update. Ask the library administrator to apply the latest Supabase migration, then try again." };
      }
      return { error: "Your rental request could not be submitted. Confirm your subscription is still active and try again." };
    }
  }

  revalidatePath("/member/dashboard");
  revalidatePath("/member/dashboard/payments");
  revalidatePath("/member/dashboard/my-books");
  revalidatePath("/member/rent");
  if (isFirstRentalSubscription) return { success: "pending" };
  redirect("/member/dashboard?rent=pending");
}
