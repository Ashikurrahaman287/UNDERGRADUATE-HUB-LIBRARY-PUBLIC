"use client";

import { useState } from "react";
import type { MemberIdType } from "@/lib/member/id-verification";

type MemberIdFieldsProps = {
  fullName?: string | null;
  address?: string | null;
  idType?: MemberIdType | null;
  idNumber?: string | null;
  dob?: string | null;
  institutionName?: string | null;
  idCardPath?: string | null;
  requireNewPhoto?: boolean;
};

export function MemberIdFields({
  fullName = "",
  address = "",
  idType: initialIdType = null,
  idNumber = "",
  dob = "",
  institutionName = "",
  idCardPath = null,
  requireNewPhoto = false,
}: MemberIdFieldsProps) {
  const [idType, setIdType] = useState<MemberIdType | "">(initialIdType ?? "");
  const [identityEdited, setIdentityEdited] = useState(false);
  const needsNewPhoto = requireNewPhoto || !idCardPath || idType !== initialIdType || identityEdited;

  return (
    <fieldset className="member-id-fields">
      <legend>Identity verification</legend>
      <label htmlFor="identity-full-name">Full name</label>
      <input autoComplete="name" defaultValue={fullName ?? ""} id="identity-full-name" maxLength={120} minLength={2} name="fullName" onChange={() => setIdentityEdited(true)} required />

      <label htmlFor="identity-id-type">ID type</label>
      <select id="identity-id-type" name="idType" onChange={(event) => setIdType(event.target.value as MemberIdType | "")} required value={idType}>
        <option value="">Select ID type</option>
        <option value="NID">NID</option>
        <option value="Student ID">Student ID</option>
      </select>

      <label htmlFor="identity-id-number">{idType === "Student ID" ? "Student ID number" : "NID number"}</label>
      <input autoComplete="off" defaultValue={idNumber ?? ""} id="identity-id-number" maxLength={64} minLength={3} name="idNumber" onChange={() => setIdentityEdited(true)} required />

      {idType === "NID" ? <>
        <label htmlFor="identity-dob">Date of birth</label>
        <input autoComplete="bday" defaultValue={dob ?? ""} id="identity-dob" name="dob" onChange={() => setIdentityEdited(true)} required type="date" />
      </> : null}

      {idType === "Student ID" ? <>
        <label htmlFor="identity-institution">University or college name</label>
        <input autoComplete="organization" defaultValue={institutionName ?? ""} id="identity-institution" maxLength={200} minLength={2} name="institutionName" onChange={() => setIdentityEdited(true)} required />
      </> : null}

      <label htmlFor="identity-address">Address{ idType === "NID" ? "" : " (optional)"}</label>
      <textarea autoComplete="street-address" defaultValue={address ?? ""} id="identity-address" maxLength={500} name="address" onChange={() => setIdentityEdited(true)} required={idType === "NID"} rows={3} />

      <label htmlFor="identity-card-photo">ID card photo</label>
      <input accept="image/jpeg,image/png" id="identity-card-photo" name="idCardPhoto" required={needsNewPhoto} type="file" />
      <p className="member-field-note">Upload a clear image of the selected ID. JPG, PNG, or WEBP; maximum 5MB. ID photos are private and visible only to you and library administrators.</p>
      {idCardPath && needsNewPhoto ? <p className="member-field-note">A new photo is required when you change your ID details.</p> : idCardPath ? <p className="member-field-note">An ID photo is already on file. Upload another image to replace it.</p> : null}
    </fieldset>
  );
}