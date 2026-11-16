import "server-only";

import { randomUUID } from "node:crypto";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { hasSupportedImageSignature, supportedImageExtension } from "@/lib/security/image-validation";

export type MemberIdType = "NID" | "Student ID";
export type MemberIdentityDetails = {
  full_name: string;
  id_type: MemberIdType;
  id_number: string;
  dob: string | null;
  institution_name: string | null;
  address: string | null;
};

type IdentityStorageClient = {
  storage: {
    from(bucket: "member-ids"): {
      upload(path: string, file: File, options: { upsert: boolean; contentType: string; cacheControl: string }): PromiseLike<{ error: { message: string } | null }>;
    };
  };
};

export function parseMemberIdentity(formData: FormData): { value?: MemberIdentityDetails; error?: string } {
  const fullName = formData.get("fullName")?.toString().trim() ?? "";
  const rawType = formData.get("idType")?.toString() ?? "";
  const idNumber = formData.get("idNumber")?.toString().trim() ?? "";
  const dob = formData.get("dob")?.toString() ?? "";
  const institutionName = formData.get("institutionName")?.toString().trim() ?? "";
  const address = formData.get("address")?.toString().trim() ?? "";

  if (fullName.length < 2 || fullName.length > 120) return { error: "Enter a full name between 2 and 120 characters." };
  if (rawType !== "NID" && rawType !== "Student ID") return { error: "Choose NID or Student ID." };
  const validIdNumber = rawType === "NID"
    ? /^\d{8,20}$/.test(idNumber)
    : /^[A-Za-z0-9][A-Za-z0-9 /-]{2,63}$/.test(idNumber);
  if (!validIdNumber) return { error: rawType === "NID" ? "Enter an NID number containing 8 to 20 digits." : "Enter a valid student ID number between 3 and 64 characters." };
  if (address.length > 500) return { error: "Keep the address under 500 characters." };

  if (rawType === "NID") {
    const parsedDob = /^\d{4}-\d{2}-\d{2}$/.test(dob) ? new Date(`${dob}T00:00:00.000Z`) : null;
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    if (!parsedDob || Number.isNaN(parsedDob.valueOf()) || parsedDob.toISOString().slice(0, 10) !== dob || dob > today) {
      return { error: "Enter a valid date of birth that is not in the future." };
    }
    if (!address) return { error: "Address is required for NID verification." };
  } else if (institutionName.length < 2 || institutionName.length > 200) {
    return { error: "Enter a university or college name between 2 and 200 characters." };
  }

  return {
    value: {
      full_name: fullName,
      id_type: rawType,
      id_number: idNumber,
      dob: rawType === "NID" ? dob : null,
      institution_name: rawType === "Student ID" ? institutionName : null,
      address: address || null,
    },
  };
}

export async function uploadMemberIdCard(file: File, memberId: string, client: IdentityStorageClient): Promise<string> {
  if (file.size === 0 || file.size > 5 * 1024 * 1024) throw new Error("Choose an ID photo smaller than 5MB.");
  if (file.type !== "image/jpeg" && file.type !== "image/png") throw new Error("Upload a JPG or PNG ID photo.");
  const extension = supportedImageExtension(file.type);
  if (!extension) throw new Error("Upload a JPG or PNG ID photo.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasSupportedImageSignature(bytes, file.type)) throw new Error("The selected ID photo is not a valid image of that type.");

  const path = `member-ids/${memberId}/${randomUUID()}.${extension}`;
  const { error } = await client.storage.from("member-ids").upload(path, file, {
    upsert: false,
    contentType: file.type,
    cacheControl: "0",
  });
  if (error) throw new Error("The ID photo could not be uploaded. Try again.");
  return path;
}

export async function removeMemberIdCard(path: string | null, memberId: string): Promise<void> {
  if (!path || !path.startsWith(`member-ids/${memberId}/`) || path.includes("..")) return;
  try {
    await createAdminSupabaseClient().storage.from("member-ids").remove([path]);
  } catch {
    return;
  }
}