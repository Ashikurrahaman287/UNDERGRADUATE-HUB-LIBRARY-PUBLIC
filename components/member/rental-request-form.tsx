"use client";

import { useActionState, useOptimistic } from "react";
import { ButtonLabel } from "@/components/button-label";
import { submitRentalRequestAction, type RentalRequestState } from "@/app/member/rent/actions";
import { termsAcceptanceToken } from "@/lib/terms";
import Link from "next/link";
import { MobileWalletCheckout } from "@/components/member/mobile-wallet-checkout";

const initialState: RentalRequestState = {};

export function RentalRequestForm({ bookId, firstSubscriptionPrice }: { bookId: string; firstSubscriptionPrice: number | null }) {
  const [state, formAction, isPending] = useActionState(submitRentalRequestAction, initialState);
  const [optimisticSubmitting, setOptimisticSubmitting] = useOptimistic(false);
  const isFirstRequest = firstSubscriptionPrice !== null;
  const confirmationMessage = "Our team will verify your TrxID shortly. Kindly wait while they confirm your payment and first rental request.";

  async function submitWithFeedback(formData: FormData) {
    setOptimisticSubmitting(true);
    await formAction(formData);
  }

  return (
    <form action={submitWithFeedback} className="member-form">
      <input name="bookId" type="hidden" value={bookId} />
      {isFirstRequest ? <>
        <p className="member-payment-instructions">Your first 30-day subscription covers multiple books. It starts after your bKash or Nagad payment is verified.</p>
        <MobileWalletCheckout amount={firstSubscriptionPrice ?? undefined} confirmationMessage={confirmationMessage} dashboardHref="/member/dashboard#rentals" fieldErrors={state.fieldErrors} idPrefix="first-rental" isPending={isPending} pendingLabel="Submitting request…" submitLabel="Submit TrxID for Membership Verification" success={Boolean(state.success)} />
      </> : <p className="member-field-note">No extra payment is due for this book during your active 30-day subscription.</p>}
      <label className="member-terms-agreement" htmlFor="rental-terms-accepted">
        <input disabled={Boolean(state.success)} id="rental-terms-accepted" name="termsAccepted" required type="checkbox" value={termsAcceptanceToken} />
        <span>I have read and agree to the Undergraduate Hub Library <Link href="/terms-and-conditions">Terms &amp; Conditions</Link>.</span>
      </label>
      {optimisticSubmitting || isPending ? <p className="member-field-note" role="status">Submitting your rental request for verification…</p> : null}
      {state.fieldErrors?.termsAccepted ? <p className="member-field-error" role="alert">{state.fieldErrors.termsAccepted}</p> : null}
      {state.error ? <p className="member-form-message member-form-message-error" role="alert">{state.error}</p> : null}
      {!isFirstRequest ? <button aria-busy={isPending} className="button-primary button-stateful" disabled={isPending} type="submit"><ButtonLabel pending={isPending} pendingLabel="Submitting request…">Request this book</ButtonLabel></button> : null}
    </form>
  );
}