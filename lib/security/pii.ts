import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const prefix = "pii:v1:";
type MemberPiiField = "address" | "id_number" | "dob" | "institution_name";
type PiiField = MemberPiiField | "payer_phone";

export type MemberPiiFields = {
  address: string | null;
  id_number: string | null;
  dob: string | null;
  institution_name: string | null;
};

function encryptionKey(): Buffer {
  const value = process.env.PII_ENCRYPTION_KEY ?? "";
  if (!/^[0-9a-f]{64}$/i.test(value)) {
    throw new Error("PII_ENCRYPTION_KEY must be a 32-byte hexadecimal key.");
  }
  return Buffer.from(value, "hex");
}

function additionalData(field: PiiField): Buffer {
  const table = field === "payer_phone" ? "payment_submissions" : "member_profiles";
  return Buffer.from(`undergraduate-hub:${table}:${field}:v1`);
}

export function encryptPiiField(value: string | null, field: PiiField): string | null {
  if (value === null || value === "") return value;
  if (value.startsWith(prefix)) {
    decryptPiiField(value, field);
    return value;
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(additionalData(field));
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const payload = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
  return `${prefix}${payload.toString("base64url")}`;
}

export function decryptPiiField(value: string | null, field: PiiField): string | null {
  if (value === null || value === "" || !value.startsWith(prefix)) return value;
  const payload = Buffer.from(value.slice(prefix.length), "base64url");
  if (payload.length < 29) throw new Error(`Encrypted member ${field} data is malformed.`);

  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const ciphertext = payload.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAAD(additionalData(field));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function encryptMemberPii<T extends MemberPiiFields>(member: T): T {
  return {
    ...member,
    address: encryptPiiField(member.address, "address"),
    id_number: encryptPiiField(member.id_number, "id_number"),
    dob: encryptPiiField(member.dob, "dob"),
    institution_name: encryptPiiField(member.institution_name, "institution_name"),
  };
}

export function decryptMemberPii<T extends MemberPiiFields>(member: T): T {
  return {
    ...member,
    address: decryptPiiField(member.address, "address"),
    id_number: decryptPiiField(member.id_number, "id_number"),
    dob: decryptPiiField(member.dob, "dob"),
    institution_name: decryptPiiField(member.institution_name, "institution_name"),
  };
}

export function isEncryptedPii(value: string | null): boolean {
  return value?.startsWith(prefix) ?? false;
}