"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { isValidBangladeshPhone, normalizeBangladeshPhone } from "@/lib/member/phone";
import { getSafeMemberDestination } from "@/lib/member/redirect";
import { getMemberSession, isPhoneAuthUser } from "@/lib/member/session";
import { validateActionFormData } from "@/lib/security/guards";
import { parseMemberIdentity, removeMemberIdCard, uploadMemberIdCard } from "@/lib/member/id-verification";
import { decryptMemberPii, decryptPiiField, encryptMemberPii, encryptPiiField } from "@/lib/security/pii";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

export type MemberProfileFormState = {
  error?: string;
  success?: string;
  nextDestination?: string;
};

export type MemberIdVerificationFormState = { error?: string; success?: string };

type MemberProfileActionClient = {
  from(table: "member_profiles"): {
    select(columns: "id, full_name, email, address, id_card_url, is_id_verified, verification_status"): {
      eq(column: "user_id", value: string): {
        maybeSingle(): PromiseLike<{ data: { id: string; full_name: string; email: string | null; address: string | null; id_card_url: string | null; is_id_verified: boolean; verification_status: "PENDING" | "APPROVED" | "REJECTED" } | null; error: { code?: string } | null }>;
      };
    };
    update(values: { full_name: string; phone: string; email: string | null; address: string | null; avatar_url: string | null }): {
      eq(column: "user_id", value: string): PromiseLike<{ error: { code?: string } | null }>;
    };
    insert(values: { user_id: string; full_name: string; phone: string; email: string | null; address: string | null; avatar_url: string | null }): PromiseLike<{ error: { code?: string } | null }>;
  };
};
type MemberProfileWriteClient = {
  rpc(functionName: "link_member_referral", args: { p_member_id: string; p_referral_code: string }): PromiseLike<{ data: boolean | null; error: { code?: string } | null }>;
  from(table: "member_profiles"): {
    update(values: { full_name: string; phone: string; email: string | null; address: string | null; avatar_url: string | null }): {
      eq(column: "user_id", value: string): {
        eq(column: "is_id_verified", value: boolean): {
          eq(column: "verification_status", value: "PENDING" | "APPROVED" | "REJECTED"): {
            select(columns: "id"): { maybeSingle(): PromiseLike<{ data: { id: string } | null; error: { code?: string } | null }> };
          };
        };
      };
    };
    insert(values: { user_id: string; full_name: string; phone: string; email: string | null; address: string | null; avatar_url: string | null }): PromiseLike<{ error: { code?: string } | null }>;
  };
};

export async function createMemberProfileAction(_previousState: MemberProfileFormState, formData: FormData): Promise<MemberProfileFormState> {
  validateActionFormData(formData);
  const session = await getMemberSession();
  if (!session) return { error: "Your session expired. Sign in again to save your profile." };

  const fullName = (formData.get("fullName") ?? "").toString().trim();
  const email = (formData.get("email") ?? "").toString().trim();
  const address = (formData.get("address") ?? "").toString().trim();
  const phoneAuthRequired = isPhoneAuthUser(session.user);
  const submittedPhone = (formData.get("phone") ?? "").toString().trim();
  const phone = normalizeBangladeshPhone(phoneAuthRequired ? session.user.phone ?? "" : submittedPhone);
  const avatarUrl = (formData.get("avatarUrl") ?? "").toString().trim();

  if (fullName.length < 2 || fullName.length > 120) return { error: "Enter a name between 2 and 120 characters." };
  if (!isValidBangladeshPhone(phone)) return { error: phoneAuthRequired
    ? "Your verified account phone is unavailable. Sign in with a Bangladesh mobile number."
    : "Enter a valid Bangladesh mobile number, such as 01XXXXXXXXX." };
  if (phoneAuthRequired && !session.user.phone_confirmed_at) return { error: "Sign in again and verify your phone number before saving your profile." };
  if (email.length > 254 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return { error: "Enter a valid email address or leave it blank." };
  if (address.length > 500) return { error: "Keep the address under 500 characters." };
  if (avatarUrl.length > 2048) return { error: "Keep the avatar URL under 2048 characters." };
  if (avatarUrl) {
    try {
      const parsedAvatarUrl = new URL(avatarUrl);
      if (parsedAvatarUrl.protocol !== "https:" && parsedAvatarUrl.protocol !== "http:") return { error: "Enter a valid avatar URL." };
    } catch {
      return { error: "Enter a valid avatar URL." };
    }
  }

  const client = session.supabase as unknown as MemberProfileActionClient;
  const normalizedEmail = email.toLowerCase();
  const authEmail = session.user.email?.trim().toLowerCase() ?? null;
  const emailConfirmed = Boolean(session.user.email_confirmed_at && authEmail);

  const { data: existingProfile, error: readError } = await client
    .from("member_profiles")
    .select("id, full_name, email, address, id_card_url, is_id_verified, verification_status")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (readError) {
    console.error("[member-profile] Profile lookup failed", { operation: "read", code: readError.code ?? "unknown" });
    return { error: "Your profile could not be checked. Refresh and try again." };
  }
  const existingAddress = decryptPiiField(existingProfile?.address ?? null, "address");
  const identityProfileLocked = Boolean(existingProfile && (existingProfile.is_id_verified
    || existingProfile.verification_status === "APPROVED"
    || (existingProfile.verification_status === "PENDING" && existingProfile.id_card_url)));
  if (existingProfile && identityProfileLocked
    && (fullName !== existingProfile.full_name || (address || null) !== existingAddress)) {
    return { error: existingProfile.is_id_verified || existingProfile.verification_status === "APPROVED"
      ? "Your verified name and address are locked. Contact the library if they need correction."
      : "Your name and address are locked while your ID verification is under review." };
  }

  const candidateEmail = normalizedEmail || existingProfile?.email?.trim().toLowerCase() || (emailConfirmed ? authEmail : null);
  if (candidateEmail) {
    const { data: emailOwner, error: emailOwnerError } = await createAdminSupabaseClient()
      .from("member_profiles")
      .select("user_id")
      .eq("email", candidateEmail)
      .neq("user_id", session.user.id)
      .maybeSingle();
    if (emailOwnerError) return { error: "We couldn't check that email address. Refresh and try again." };
    if (emailOwner) return { error: "That email is already linked to another member account." };
  }
  const profileData = {
    full_name: fullName,
    phone,
    email: candidateEmail,
    address: address || null,
    avatar_url: avatarUrl || null,
  };

  const writeClient = createAdminSupabaseClient() as unknown as MemberProfileWriteClient;
  let saveError: { code?: string } | null;
  if (existingProfile) {
    const { data, error } = await writeClient.from("member_profiles")
      .update({ ...profileData, address: encryptPiiField(profileData.address, "address") })
      .eq("user_id", session.user.id)
      .eq("is_id_verified", existingProfile.is_id_verified)
      .eq("verification_status", existingProfile.verification_status)
      .select("id")
      .maybeSingle();
    saveError = error ?? (data ? null : { code: "PROFILE_CHANGED" });
  } else {
    const { error } = await writeClient.from("member_profiles").insert({
      user_id: session.user.id,
      ...profileData,
      address: encryptPiiField(profileData.address, "address"),
    });
    saveError = error;
  }

  if (saveError) {
    console.error("[member-profile] Profile save failed", {
      operation: existingProfile ? "update" : "insert",
      code: saveError.code ?? "unknown",
    });
    return { error: saveError.code === "23505"
      ? "This phone number or email is already associated with another member profile. Contact the library for help."
      : "Your profile could not be saved. Refresh and try again." };
  }

  if (!existingProfile) {
    const cookieStore = await cookies();
    const referralCode = cookieStore.get("ref_code")?.value;
    if (referralCode && /^ref_[a-z0-9]{5,32}$/.test(referralCode)) {
      const { data: newProfile } = await session.supabase
        .from("member_profiles")
        .select("id")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (newProfile) {
        const { error: referralError } = await writeClient.rpc("link_member_referral", {
          p_member_id: newProfile.id,
          p_referral_code: referralCode,
        });
        if (referralError) {
          console.error("[member-profile] Referral attribution failed", { code: referralError.code ?? "unknown" });
        } else {
          cookieStore.delete("ref_code");
        }
      }
    }
  }

  revalidatePath("/member/dashboard");
  revalidatePath("/member/register");
  const nextDestination = getSafeMemberDestination(formData.get("next")?.toString());
  return {
    success: "Your profile was saved.",
    ...(nextDestination ? { nextDestination } : {}),
  };
}

export async function updateMemberIdVerificationAction(_previousState: MemberIdVerificationFormState, formData: FormData): Promise<MemberIdVerificationFormState> {
  validateActionFormData(formData);
  const session = await getMemberSession();
  if (!session) return { error: "Your session expired. Sign in again to update ID verification." };

  const { data: storedProfile, error: profileError } = await session.supabase
    .from("member_profiles")
    .select("id, full_name, address, id_type, id_number, dob, institution_name, id_card_url, is_id_verified, verification_status")
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (profileError || !storedProfile) return { error: "Your member profile could not be loaded. Refresh and try again." };
  const profile = decryptMemberPii(storedProfile);
  if (profile.is_id_verified || profile.verification_status === "APPROVED"
    || (profile.verification_status === "PENDING" && profile.id_card_url)) {
    return { error: "Your ID verification is locked and cannot be modified." };
  }

  const identity = parseMemberIdentity(formData);
  if (!identity.value) return { error: identity.error ?? "Complete your ID details before saving." };

  const idCardValue = formData.get("idCardPhoto");
  const idCardFile = idCardValue instanceof File && idCardValue.size > 0 ? idCardValue : null;
  if (profile.verification_status === "REJECTED" && !idCardFile) return { error: "Upload a new ID photo before resubmitting your rejected verification." };
  const identityChanged = profile.full_name !== identity.value.full_name
    || profile.address !== identity.value.address
    || profile.id_type !== identity.value.id_type
    || profile.id_number !== identity.value.id_number
    || profile.dob !== identity.value.dob
    || profile.institution_name !== identity.value.institution_name
    || idCardFile !== null;
  if (!idCardFile && (!profile.id_card_url || identityChanged)) return { error: "Upload a fresh photo of your selected ID card whenever you change your identity details." };

  let idCardPath = profile.id_card_url;
  if (idCardFile) {
    try {
      idCardPath = await uploadMemberIdCard(idCardFile, profile.id, session.supabase);
    } catch (error) {
      return { error: error instanceof Error ? error.message : "The ID photo could not be uploaded." };
    }
  }

  const profileUpdate = createAdminSupabaseClient()
    .from("member_profiles")
    .update({
      ...encryptMemberPii(identity.value),
      id_card_url: idCardPath,
      id_verification_submitted_at: new Date().toISOString(),
      is_id_verified: false,
      verification_status: "PENDING",
      rejection_reason: null,
    })
    .eq("user_id", session.user.id)
    .eq("is_id_verified", false)
    .eq("verification_status", profile.verification_status);
  const guardedProfileUpdate = profile.id_card_url
    ? profileUpdate.eq("id_card_url", profile.id_card_url)
    : profileUpdate.is("id_card_url", null);
  const { data: updatedProfile, error: updateError } = await guardedProfileUpdate.select("id").maybeSingle();
  if (updateError || !updatedProfile) {
    if (idCardFile && idCardPath) await removeMemberIdCard(idCardPath, profile.id);
    return { error: "Your ID details could not be saved. Refresh and try again." };
  }
  if (idCardFile && profile.id_card_url && profile.id_card_url !== idCardPath) {
    await removeMemberIdCard(profile.id_card_url, profile.id);
  }

  revalidatePath("/member/dashboard");
  revalidatePath("/member/rent");
  revalidatePath("/member/reserve");
  return {
    success: profile.is_id_verified && !identityChanged
      ? "Your ID details are saved and remain verified."
      : "Your ID details were submitted for administrator review. Book requests remain locked until approval.",
  };
}
