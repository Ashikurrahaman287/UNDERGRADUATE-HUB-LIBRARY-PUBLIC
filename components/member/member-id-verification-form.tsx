"use client";

import { useOptimistic, useState, useTransition } from "react";
import { ButtonLabel } from "@/components/button-label";
import { MemberIdFields } from "@/components/member/member-id-fields";
import { updateMemberIdVerificationAction, type MemberIdVerificationFormState } from "@/app/member/register/actions";
import type { MemberIdType } from "@/lib/member/id-verification";

type MemberIdVerificationFormProps = {
  fullName: string;
  address: string | null;
  idType: MemberIdType | null;
  idNumber: string | null;
  dob: string | null;
  institutionName: string | null;
  idCardPath: string | null;
  requireNewPhoto?: boolean;
  submitLabel?: string;
};

const initialState: MemberIdVerificationFormState = {};

export function MemberIdVerificationForm(props: MemberIdVerificationFormProps) {
  const [state, setState] = useState(initialState);
  const [optimisticSubmitting, setOptimisticSubmitting] = useOptimistic(false);
  const [isPending, startTransition] = useTransition();

  function submitVerification(formData: FormData) {
    setState({});
    startTransition(async () => {
      setOptimisticSubmitting(true);
      try {
        setState(await updateMemberIdVerificationAction(state, formData));
      } catch {
        setState({ error: "Your ID details could not be saved. Refresh and try again." });
      }
    });
  }

  return (
    <form action={submitVerification} className="member-form">
      <MemberIdFields address={props.address} dob={props.dob} fullName={props.fullName} idCardPath={props.idCardPath} idNumber={props.idNumber} idType={props.idType} institutionName={props.institutionName} requireNewPhoto={props.requireNewPhoto} />
      {state.error ? <p className="member-form-message member-form-message-error" role="alert">{state.error}</p> : null}
      {state.success ? <p className="member-form-message member-form-message-success" role="status">{state.success}</p> : null}
      {optimisticSubmitting || isPending ? <p className="member-field-note" role="status">Submitting your ID details…</p> : null}
      <button aria-busy={isPending} className="button-primary button-stateful" disabled={isPending} type="submit"><ButtonLabel pending={isPending} pendingLabel="Submitting…">{props.submitLabel ?? "Submit ID documents for verification"}</ButtonLabel></button>
    </form>
  );
}