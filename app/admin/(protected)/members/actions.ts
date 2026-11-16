"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminSessionId } from "@/lib/admin/session";
import { validateActionFormData } from "@/lib/security/guards";
import { sendSwiftSmsBestEffort } from "@/lib/member/sms";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { decryptMemberPii, encryptMemberPii } from "@/lib/security/pii";
import { parseMemberIdentity, removeMemberIdCard, uploadMemberIdCard } from "@/lib/member/id-verification";

type MemberAdminRpcClient = {
  rpc(
    functionName: "admin_approve_pending_member",
    args: { p_member_id: string; p_plan_id: string; p_reviewer_session_id: string },
  ): Promise<{ data: string | null; error: { message: string } | null }>;
  rpc(
    functionName: "admin_extend_member_membership",
    args: { p_member_id: string; p_reviewer_session_id: string; p_months: number },
  ): Promise<{ data: string | null; error: { message: string } | null }>;
};
type MemberValidityRpcClient = {
  rpc(
    functionName: "admin_extend_member_validity",
    args: { p_member_id: string; p_reviewer_session_id: string; p_days_to_add: number | null; p_new_expiry_date: string | null },
  ): Promise<{ data: string | null; error: { code?: string; message: string } | null }>;
};
type MemberPhoneLookup = {
  from(table: "member_profiles"): {
    select(columns: string): {
      eq(column: "id", value: string): {
        maybeSingle(): PromiseLike<{ data: { phone: string | null } | null; error: { message: string } | null }>;
      };
    };
  };
};

function memberIdFrom(formData: FormData): string | null {
  const memberId = formData.get("memberId")?.toString();
  return memberId && /^[0-9a-f-]{36}$/i.test(memberId) ? memberId : null;
}

export async function saveMemberIdVerificationAction(formData: FormData): Promise<void> {
  validateActionFormData(formData);
  await requireAdminSessionId();
  const memberId = memberIdFrom(formData);
  const redirectForResult = (result: "saved" | "verified" | "error") =>
    `/ashik-loves-jannat/members/${memberId}?idVerification=manual-${result}`;
  if (!memberId) redirect("/ashik-loves-jannat/members?identity=error");

  const client = createAdminSupabaseClient();
  const { data: member, error: lookupError } = await client
    .from("member_profiles")
    .select("id, full_name, id_card_url")
    .eq("id", memberId)
    .maybeSingle();
  if (lookupError || !member) redirect(redirectForResult("error"));

  const identityForm = new FormData();
  identityForm.set("fullName", member.full_name);
  for (const field of ["idType", "idNumber", "dob", "institutionName", "address"]) {
    identityForm.set(field, formData.get(field)?.toString() ?? "");
  }
  const identity = parseMemberIdentity(identityForm);
  if (!identity.value) redirect(redirectForResult("error"));
  let identityToSave: ReturnType<typeof encryptMemberPii<typeof identity.value>>;
  try {
    identityToSave = encryptMemberPii(identity.value);
  } catch {
    redirect(redirectForResult("error"));
  }

  const photoValue = formData.get("idCardPhoto");
  if (!(photoValue instanceof File) || photoValue.size === 0) redirect(redirectForResult("error"));

  let photoPath: string;
  try {
    photoPath = await uploadMemberIdCard(photoValue, memberId, client);
  } catch {
    redirect(redirectForResult("error"));
  }

  const verifiedImmediately = formData.get("verifyImmediately") === "on";
  const { data: updated, error: updateError } = await client
    .from("member_profiles")
    .update({
      ...identityToSave,
      id_card_url: photoPath,
      id_verification_submitted_at: new Date().toISOString(),
      is_id_verified: verifiedImmediately,
      verification_status: verifiedImmediately ? "APPROVED" : "PENDING",
      rejection_reason: null,
    })
    .eq("id", memberId)
    .select("id")
    .maybeSingle();
  if (updateError || !updated) {
    await removeMemberIdCard(photoPath, memberId);
    redirect(redirectForResult("error"));
  }
  if (member.id_card_url && member.id_card_url !== photoPath) await removeMemberIdCard(member.id_card_url, memberId);

  revalidatePath("/admin/members");
  revalidatePath(`/admin/members/${memberId}`);
  revalidatePath("/admin/membership-requests");
  revalidatePath("/admin/id-verification-pending");
  revalidatePath("/member/dashboard");
  revalidatePath("/member/rent");
  revalidatePath("/member/reserve");
  redirect(redirectForResult(verifiedImmediately ? "verified" : "saved"));
}

const rejectionReasons: Record<string, string> = {
  unclear_photo: "Unclear ID photo",
  number_mismatch: "ID number mismatch",
  expired_id: "Expired ID",
};

export async function rejectMemberIdAction(formData: FormData): Promise<void> {
  validateActionFormData(formData);
  await requireAdminSessionId();
  const memberId = memberIdFrom(formData);
  if (!memberId) redirect("/ashik-loves-jannat/id-verification-pending?verification=error");
  const returnToPendingQueue = formData.get("returnTo") === "/ashik-loves-jannat/id-verification-pending";
  const redirectForResult = (result: "rejected" | "error") => returnToPendingQueue
    ? `/ashik-loves-jannat/id-verification-pending?verification=${result}`
    : `/ashik-loves-jannat/members/${memberId}?idVerification=${result}`;

  const selectedReason = formData.get("reason")?.toString() ?? "";
  const customReason = formData.get("customReason")?.toString().trim() ?? "";
  const reason = selectedReason === "other" ? customReason : rejectionReasons[selectedReason];
  if (!reason || reason.length > 500) redirect(redirectForResult("error"));

  const { data: updated, error } = await createAdminSupabaseClient()
    .from("member_profiles")
    .update({ verification_status: "REJECTED", is_id_verified: false, rejection_reason: reason })
    .eq("id", memberId)
    .eq("verification_status", "PENDING")
    .select("id")
    .maybeSingle();
  if (error || !updated) redirect(redirectForResult("error"));

  revalidatePath("/admin/members");
  revalidatePath(`/admin/members/${memberId}`);
  revalidatePath("/admin/id-verification-pending");
  revalidatePath("/member/dashboard");
  redirect(redirectForResult("rejected"));
}

export async function approvePendingMemberAction(formData: FormData): Promise<void> {
  validateActionFormData(formData);
  const reviewerSessionId = await requireAdminSessionId();
  const memberId = memberIdFrom(formData);
  const planId = formData.get("planId")?.toString() ?? "";
  if (!memberId || !/^[0-9a-f-]{36}$/i.test(planId)) redirect("/ashik-loves-jannat/members?approval=error");

  const client = createAdminSupabaseClient();
  const { data: result, error } = await (client as unknown as MemberAdminRpcClient).rpc("admin_approve_pending_member", {
    p_member_id: memberId,
    p_plan_id: planId,
    p_reviewer_session_id: reviewerSessionId,
  });
  if (error || result !== "approved") redirect("/ashik-loves-jannat/members?approval=error");

  let smsFailed = false;
  try {
    const { data: member, error: lookupError } = await (client as unknown as MemberPhoneLookup)
      .from("member_profiles")
      .select("phone")
      .eq("id", memberId)
      .maybeSingle();
    if (lookupError || !member?.phone) {
      console.error("Could not load the membership SMS recipient.", lookupError);
      smsFailed = true;
    } else {
      smsFailed = !(await sendSwiftSmsBestEffort({
        phone: member.phone,
        message: "Your Undergraduate Hub Library membership has been approved and is valid for one year.",
      }));
    }
  } catch (smsError) {
    console.error("Could not send the membership approval SMS.", smsError);
    smsFailed = true;
  }

  revalidatePath("/admin/members");
  revalidatePath("/admin/manual-approved-members");
  revalidatePath("/admin/members/[id]", "page");
  revalidatePath("/member/dashboard");
  revalidatePath("/member/dashboard/payments");
  redirect(`/ashik-loves-jannat/members?approval=success${smsFailed ? "&sms=failed" : ""}`);
}

export async function extendMemberMembershipAction(formData: FormData): Promise<void> {
  validateActionFormData(formData);
  const reviewerSessionId = await requireAdminSessionId();
  const memberId = memberIdFrom(formData);
  const months = Number(formData.get("months"));
  if (!memberId || ![1, 6, 12].includes(months)) redirect("/ashik-loves-jannat/members?extension=error");

  const client = createAdminSupabaseClient() as unknown as MemberAdminRpcClient;
  const { data: result, error } = await client.rpc("admin_extend_member_membership", {
    p_member_id: memberId,
    p_months: months,
    p_reviewer_session_id: reviewerSessionId,
  });
  if (error || result !== "extended") redirect("/ashik-loves-jannat/members?extension=error");

  revalidatePath("/admin/members");
  revalidatePath("/admin/members/[id]", "page");
  revalidatePath("/member/dashboard");
  redirect("/ashik-loves-jannat/members?extension=success");
}

export type MemberValidityExtensionState = { error?: string; success?: string };

export async function extendMemberValidityAction(_previousState: MemberValidityExtensionState, formData: FormData): Promise<MemberValidityExtensionState> {
  validateActionFormData(formData);
  const reviewerSessionId = await requireAdminSessionId();
  const memberId = memberIdFrom(formData);
  const mode = formData.get("extensionMode")?.toString() ?? "";
  if (!memberId || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(memberId)) {
    return { error: "The member record could not be found." };
  }

  let daysToAdd: number | null = null;
  let newExpiryDate: string | null = null;
  if (mode === "days") {
    const rawDays = formData.get("daysToAdd")?.toString().trim() ?? "";
    daysToAdd = rawDays ? Number(rawDays) : NaN;
    if (!Number.isInteger(daysToAdd) || daysToAdd < 1 || daysToAdd > 3650) {
      return { error: "Enter a whole number of days from 1 to 3,650." };
    }
  } else if (mode === "date") {
    const rawDate = formData.get("newExpiryDate")?.toString().trim() ?? "";
    const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? new Date(`${rawDate}T00:00:00.000Z`) : null;
    if (!parsedDate || Number.isNaN(parsedDate.valueOf()) || parsedDate.toISOString().slice(0, 10) !== rawDate) {
      return { error: "Choose a valid new expiration date." };
    }
    newExpiryDate = rawDate;
  } else {
    return { error: "Choose days to add or a custom expiration date." };
  }

  const client = createAdminSupabaseClient() as unknown as MemberValidityRpcClient;
  const { data: result, error } = await client.rpc("admin_extend_member_validity", {
    p_member_id: memberId,
    p_reviewer_session_id: reviewerSessionId,
    p_days_to_add: daysToAdd,
    p_new_expiry_date: newExpiryDate,
  });
  if (error || result !== "extended") {
    console.error("[member-validity] Extension failed", { memberId, code: error?.code ?? "unknown", message: error?.message ?? result });
    return { error: error?.message === "Only active memberships can be extended."
      ? "Only active memberships can be extended."
      : error?.message === "The new expiry must be later than the current expiry."
        ? "Choose an expiration date later than the current expiry."
        : "The membership validity could not be updated. Refresh and try again." };
  }

  revalidatePath("/admin/members");
  revalidatePath("/ashik-loves-jannat/members");
  revalidatePath("/admin/members/[id]", "page");
  revalidatePath("/member/dashboard");
  return { success: "Successfully extended subscription validity!" };
}

export async function verifyMemberIdAction(formData: FormData): Promise<void> {
  validateActionFormData(formData);
  await requireAdminSessionId();
  const memberId = memberIdFrom(formData);
  if (!memberId) redirect("/ashik-loves-jannat/members?identity=error");
  const returnToPendingQueue = formData.get("returnTo") === "/ashik-loves-jannat/id-verification-pending";
  const redirectForResult = (result: "success" | "error") => returnToPendingQueue
    ? `/ashik-loves-jannat/id-verification-pending?verification=${result}`
    : `/ashik-loves-jannat/members/${memberId}?idVerification=${result}`;

  const client = createAdminSupabaseClient();
  const { data: storedMember, error: lookupError } = await client
    .from("member_profiles")
    .select("id, full_name, id_type, id_number, dob, institution_name, address, id_card_url")
    .eq("id", memberId)
    .maybeSingle();
  if (lookupError || !storedMember) redirect(redirectForResult("error"));
  let member: typeof storedMember;
  try {
    member = decryptMemberPii(storedMember);
  } catch {
    redirect(redirectForResult("error"));
  }
  const storedIdNumber = storedMember.id_number;
  if (!storedIdNumber) redirect(redirectForResult("error"));

  const rawIdType = member.id_type;
  const idNumber = member.id_number ?? "";
  const idCardPath = member.id_card_url ?? "";
  if ((rawIdType !== "NID" && rawIdType !== "Student ID") || !idNumber || !idCardPath || !member.full_name.trim()) {
    redirect(redirectForResult("error"));
  }
  const idType: "NID" | "Student ID" = rawIdType;

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const validIdentityDetails = idType === "NID"
    ? /^\d{8,20}$/.test(idNumber) && Boolean(member.dob && member.dob <= today && member.address?.trim())
    : idType === "Student ID"
      ? /^[A-Za-z0-9][A-Za-z0-9 /-]{2,63}$/.test(idNumber) && Boolean(member.institution_name?.trim())
      : false;
  const hasValidPhotoPath = idCardPath.startsWith(`member-ids/${memberId}/`) && !idCardPath.includes("..");
  if (!validIdentityDetails || !hasValidPhotoPath) redirect(redirectForResult("error"));

  const { data: photo, error: photoError } = await client.storage.from("member-ids").createSignedUrl(idCardPath, 300);
  if (photoError || !photo?.signedUrl) redirect(redirectForResult("error"));

  let verificationUpdate = client
    .from("member_profiles")
    .update({ is_id_verified: true, verification_status: "APPROVED", rejection_reason: null })
    .eq("id", memberId)
    .eq("verification_status", "PENDING")
    .eq("id_type", idType)
    .eq("id_number", storedIdNumber)
    .eq("full_name", member.full_name)
    .eq("id_card_url", idCardPath);
  verificationUpdate = storedMember.address ? verificationUpdate.eq("address", storedMember.address) : verificationUpdate.is("address", null);
  verificationUpdate = storedMember.dob ? verificationUpdate.eq("dob", storedMember.dob) : verificationUpdate.is("dob", null);
  verificationUpdate = storedMember.institution_name
    ? verificationUpdate.eq("institution_name", storedMember.institution_name)
    : verificationUpdate.is("institution_name", null);
  const { data: updated, error: updateError } = await verificationUpdate.select("id").maybeSingle();
  if (updateError || !updated) redirect(redirectForResult("error"));

  revalidatePath("/admin/members");
  revalidatePath(`/admin/members/${memberId}`);
  revalidatePath("/admin/membership-requests");
  revalidatePath("/admin/id-verification-pending");
  revalidatePath("/member/dashboard");
  redirect(redirectForResult("success"));
}