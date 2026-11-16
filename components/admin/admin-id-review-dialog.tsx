"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { rejectMemberIdAction, verifyMemberIdAction } from "@/app/admin/(protected)/members/actions";
import { AdminSubmitButton } from "@/components/admin/admin-submit-button";

type PendingMemberDetails = {
  id: string;
  full_name: string;
  id_type: "NID" | "Student ID" | null;
  id_number: string | null;
  dob: string | null;
  institution_name: string | null;
  address: string | null;
};

type AdminIdReviewDialogProps = {
  member: PendingMemberDetails;
  photoUrl: string | null;
  closeHref: string;
};

export function AdminIdReviewDialog({ member, photoUrl, closeHref }: AdminIdReviewDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [reason, setReason] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      aria-labelledby="admin-id-dialog-title"
      className="admin-id-dialog"
      onCancel={(event) => {
        event.preventDefault();
        router.replace(closeHref);
      }}
      ref={dialogRef}
    >
      <header className="admin-id-dialog-header">
        <div><p className="eyebrow">Member identity review</p><h2 className="display-font" id="admin-id-dialog-title">{member.full_name}</h2></div>
        <Link aria-label="Close ID details" className="admin-id-dialog-close" href={closeHref}>×</Link>
      </header>
      <dl className="admin-member-profile">
        <div><dt>ID type</dt><dd>{member.id_type ?? "Not submitted"}</dd></div>
        <div><dt>ID number</dt><dd>{member.id_number ?? "Not submitted"}</dd></div>
        <div><dt>Date of birth</dt><dd>{member.id_type === "NID" && member.dob ? new Date(`${member.dob}T00:00:00`).toLocaleDateString("en-BD", { dateStyle: "medium", timeZone: "Asia/Dhaka" }) : "Not applicable"}</dd></div>
        <div><dt>Institution</dt><dd>{member.id_type === "Student ID" ? member.institution_name ?? "Not submitted" : "Not applicable"}</dd></div>
        <div><dt>Address</dt><dd>{member.address ?? "Not submitted"}</dd></div>
      </dl>
      {photoUrl ? <a className="admin-id-photo-link" href={photoUrl} rel="noreferrer" target="_blank"><Image alt={`ID card photo submitted by ${member.full_name}`} className="admin-id-photo-preview" height={1200} src={photoUrl} unoptimized width={900} /></a> : <p className="admin-form-error" role="alert">The private ID photo could not be loaded.</p>}
      <form action={verifyMemberIdAction} className="admin-id-dialog-actions">
        <input name="memberId" type="hidden" value={member.id} />
        <input name="returnTo" type="hidden" value="/ashik-loves-jannat/id-verification-pending" />
        <AdminSubmitButton disabled={!photoUrl} pendingLabel="Approving ID…">Approve ID</AdminSubmitButton>
        <Link className="admin-action-button" href={closeHref}>Cancel</Link>
      </form>
      <form action={rejectMemberIdAction} className="admin-id-rejection-form">
        <input name="memberId" type="hidden" value={member.id} />
        <input name="returnTo" type="hidden" value="/ashik-loves-jannat/id-verification-pending" />
        <label className="admin-form-field">
          Rejection reason
          <select id="id-rejection-reason" name="reason" onChange={(event) => setReason(event.currentTarget.value)} required value={reason}>
            <option value="">Choose a reason</option>
            <option value="unclear_photo">Unclear ID photo</option>
            <option value="number_mismatch">ID number mismatch</option>
            <option value="expired_id">Expired ID</option>
            <option value="other">Other</option>
          </select>
        </label>
        {reason === "other" ? <label className="admin-form-field" htmlFor="id-rejection-custom">Custom reason<textarea id="id-rejection-custom" maxLength={500} minLength={1} name="customReason" required rows={3} /></label> : <input name="customReason" type="hidden" value="" />}
        <AdminSubmitButton className="admin-action-button admin-archive-button" pendingLabel="Rejecting ID…">Reject Application</AdminSubmitButton>
      </form>
    </dialog>
  );
}