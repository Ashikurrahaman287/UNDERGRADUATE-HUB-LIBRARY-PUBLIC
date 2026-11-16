"use client";

import { useState } from "react";
import { saveMemberIdVerificationAction } from "@/app/admin/(protected)/members/actions";
import { AdminSubmitButton } from "@/components/admin/admin-submit-button";

type ManualIdMember = {
  id: string;
  id_type: "NID" | "Student ID" | null;
  id_number: string | null;
  dob: string | null;
  institution_name: string | null;
  address: string | null;
};

export function AdminManualIdForm({ member }: { member: ManualIdMember }) {
  const [idType, setIdType] = useState<"NID" | "Student ID">(member.id_type ?? "NID");

  return (
    <form action={saveMemberIdVerificationAction} className="admin-id-manual-form">
      <h3>Add/Edit ID Verification</h3>
      <input name="memberId" type="hidden" value={member.id} />
      <label className="admin-form-field">
        ID type
        <select name="idType" onChange={(event) => setIdType(event.currentTarget.value as "NID" | "Student ID")} value={idType}>
          <option value="NID">NID</option>
          <option value="Student ID">Student ID</option>
        </select>
      </label>
      <label className="admin-form-field">
        ID number
        <input autoComplete="off" defaultValue={member.id_number ?? ""} maxLength={64} name="idNumber" required />
      </label>
      {idType === "NID" ? (
        <label className="admin-form-field">
          Date of birth
          <input defaultValue={member.dob ?? ""} name="dob" required type="date" />
        </label>
      ) : (
        <label className="admin-form-field">
          Institution name
          <input defaultValue={member.institution_name ?? ""} maxLength={200} name="institutionName" required />
        </label>
      )}
      <label className="admin-form-field">
        Address
        <textarea defaultValue={member.address ?? ""} maxLength={500} name="address" rows={3} />
      </label>
      <label className="admin-form-field">
        ID card photo
        <input accept="image/jpeg,image/png" name="idCardPhoto" required type="file" />
        <small>JPG, PNG, or WEBP. Maximum 5 MB.</small>
      </label>
      <label className="admin-featured-control">
        <input name="verifyImmediately" type="checkbox" />
        Mark verified immediately
      </label>
      <AdminSubmitButton pendingLabel="Saving ID details…">Save ID details</AdminSubmitButton>
    </form>
  );
}