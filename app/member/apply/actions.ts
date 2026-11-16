"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { createMemberSupabaseServerClient, requireMemberSession } from "@/lib/member/session";
import { termsAcceptanceToken, termsPolicyVersion } from "@/lib/terms";
import { decryptMemberPii, encryptPiiField } from "@/lib/security/pii";
import { hasSupportedImageSignature, supportedImageExtension } from "@/lib/security/image-validation";
import { validateActionFormData } from "@/lib/security/guards";

export type MembershipApplicationState = {
  error?: string;
  success?: string;
  fieldErrors?: Partial<Record<"paymentMethod" | "payerPhone" | "transactionId" | "termsAccepted", string>>;
};

const maximumProofBytes = 5 * 1024 * 1024;

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
  if (error) throw new Error(error.message || "The payment proof could not be uploaded.");

  return path;
}

export async function submitMembershipApplicationAction(_previousState: MembershipApplicationState, formData: FormData): Promise<MembershipApplicationState> {
  validateActionFormData(formData);
  const session = await requireMemberSession();
  const client = await createMemberSupabaseServerClient();

  const { data: storedProfile, error: profileError } = await client
    .from("member_profiles")
    .select("id, full_name, address, membership_status, id_type, id_number, dob, institution_name, id_card_url, is_id_verified, verification_status")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (profileError) {
    console.error("[membership-application] Profile lookup failed", { code: profileError.code ?? "unknown" });
    return { error: "Your profile could not be checked. Refresh and try again." };
  }
  if (!storedProfile) {
    return { error: "Create your profile before submitting a membership payment." };
  }
  const profile = decryptMemberPii(storedProfile);

  if (!profile.is_id_verified || profile.verification_status !== "APPROVED" || !profile.id_card_url) {
    return { error: "Complete ID verification and wait for approval before submitting a membership payment." };
  }
  if (profile.membership_status === "active") {
    return { error: "This account is already active as a library member." };
  }

  if (formData.get("termsAccepted") !== termsAcceptanceToken) {
    return { fieldErrors: { termsAccepted: "Accept the Terms & Conditions before submitting your application." } };
  }

  const paymentMethod = (formData.get("paymentMethod") ?? "").toString().trim();
  const transactionId = normalizeTransactionId((formData.get("transactionId") ?? "").toString());
  const payerPhone = (formData.get("payerPhone") ?? "").toString().replace(/\D/g, "");
  const proof = formData.get("paymentProof");
  const file = proof instanceof File ? proof : null;

  const fieldErrors: MembershipApplicationState["fieldErrors"] = {};
  if (!["bkash", "nagad"].includes(paymentMethod)) fieldErrors.paymentMethod = "Choose bKash or Nagad.";
  if (!/^01\d{9}$/.test(payerPhone)) fieldErrors.payerPhone = "Enter an 11-digit Bangladesh mobile number beginning with 01.";
  if (!/^[A-Z0-9]{10}$/.test(transactionId)) fieldErrors.transactionId = "Enter the 10-character transaction ID shown in your payment receipt.";
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const duplicateCheck = await client
    .from("payment_submissions")
    .select("id")
    .eq("transaction_id", transactionId)
    .in("status", ["pending", "approved"])
    .maybeSingle();

  if (duplicateCheck.error) {
    return { error: "The payment check is temporarily unavailable." };
  }

  if (duplicateCheck.data) {
    return { error: "This transaction ID has already been submitted for review." };
  }

  const { data: existingApplication, error: existingApplicationError } = await client
    .from("membership_applications")
    .select("id")
    .eq("member_id", profile.id)
    .in("status", ["pending", "approved"])
    .maybeSingle();

  if (existingApplicationError) {
    return { error: "Your existing membership application could not be checked. Refresh and try again." };
  }

  if (existingApplication) {
    return { error: "A membership application is already pending or approved for this account." };
  }

  let screenshotPath: string | null = null;
  try {
    screenshotPath = await uploadProof(file, profile.id);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The payment proof could not be uploaded." };
  }

  const adminClient = createAdminSupabaseClient();
  const { error: submissionError } = await adminClient.rpc("submit_membership_application", {
    p_member_id: profile.id,
    p_payment_method: paymentMethod,
    p_transaction_id: transactionId,
    p_payer_phone: encryptPiiField(payerPhone, "payer_phone") ?? "",
    p_screenshot_path: screenshotPath,
    p_terms_version: termsPolicyVersion,
  });

  if (submissionError) {
    if (screenshotPath) await adminClient.storage.from("payment-proofs").remove([screenshotPath]);
    if (submissionError.code === "23505") return { error: "This transaction ID has already been submitted for review." };
    if (submissionError.code === "55000") return { error: "A membership application is already pending or approved for this account." };
    return { error: "Your membership payment could not be submitted. Try again shortly." };
  }

  revalidatePath("/member/dashboard");
  revalidatePath("/member/apply");
  return { success: "pending" };
}
