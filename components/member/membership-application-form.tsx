"use client";

import { useActionState, useOptimistic } from "react";
import { submitMembershipApplicationAction, type MembershipApplicationState } from "@/app/member/apply/actions";
import { termsAcceptanceToken } from "@/lib/terms";
import Link from "next/link";
import { MemberIdFields } from "@/components/member/member-id-fields";
import { MobileWalletCheckout } from "@/components/member/mobile-wallet-checkout";
import type { MemberIdType } from "@/lib/member/id-verification";

const initialState: MembershipApplicationState = {};

type MembershipApplicationFormProps = {
  fullName: string;
  address: string | null;
  idType: MemberIdType | null;
  idNumber: string | null;
  dob: string | null;
  institutionName: string | null;
  idCardPath: string | null;
  identityVerified: boolean;
  requireNewPhoto?: boolean;
  amount: number;
};

export function MembershipApplicationForm({ fullName, address, idType, idNumber, dob, institutionName, idCardPath, identityVerified, requireNewPhoto = false, amount }: MembershipApplicationFormProps) {
  const [state, formAction, isPending] = useActionState(submitMembershipApplicationAction, initialState);
  const [optimisticSubmitting, setOptimisticSubmitting] = useOptimistic(false);
  const confirmationMessage = "Our team will verify your TrxID shortly. Kindly wait patiently while they confirm your membership payment.";

  async function submitWithFeedback(formData: FormData) {
    setOptimisticSubmitting(true);
    await formAction(formData);
  }

  return (
    <form action={submitWithFeedback} className="member-form membership-application-form">
      {identityVerified ? <p className="member-field-note">Your identity is already verified. You do not need to submit these details again.</p> : <MemberIdFields address={address} dob={dob} fullName={fullName} idCardPath={idCardPath} idNumber={idNumber} idType={idType} institutionName={institutionName} requireNewPhoto={requireNewPhoto} />}
      <MobileWalletCheckout amount={amount} confirmationMessage={confirmationMessage} dashboardHref="/member/dashboard#membership" fieldErrors={state.fieldErrors} idPrefix="membership" isPending={isPending} pendingLabel="Submitting TrxID…" submitLabel="Submit TrxID for Membership Verification" success={Boolean(state.success)} />
      {optimisticSubmitting || isPending ? <p className="member-field-note" role="status">Submitting your payment details for verification…</p> : null}
      <label className="member-terms-agreement" htmlFor="membership-terms-accepted">
        <input disabled={Boolean(state.success)} id="membership-terms-accepted" name="termsAccepted" required type="checkbox" value={termsAcceptanceToken} />
        <span>I have read and agree to the Undergraduate Hub Library <Link href="/terms-and-conditions">Terms &amp; Conditions</Link>.</span>
      </label>
      {state.fieldErrors?.termsAccepted ? <p className="member-field-error" role="alert">{state.fieldErrors.termsAccepted}</p> : null}
      {state.error ? <p className="member-form-message member-form-message-error" role="alert">{state.error}</p> : null}
    </form>
  );
}