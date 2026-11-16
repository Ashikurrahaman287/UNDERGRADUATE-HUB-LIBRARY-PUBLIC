"use client";

import { useOptimistic, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { ButtonLabel } from "@/components/button-label";
import { submitSubscriptionRenewalAction, type RenewalPaymentState } from "@/app/member/rent/return-actions";
import { siteInfo } from "@/lib/site-info";

const initialState: RenewalPaymentState = {};

export function SubscriptionRenewalForm({ amount, isFirstSubscription = false, identityVerified, onSuccess }: { amount: number; isFirstSubscription?: boolean; identityVerified: boolean; onSuccess?: () => void }) {
  const [state, setState] = useState<RenewalPaymentState>(initialState);
  const [optimisticSubmitting, setOptimisticSubmitting] = useOptimistic(false);
  const [isPending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setState({});
    startTransition(async () => {
      setOptimisticSubmitting(true);
      try {
        const result = await submitSubscriptionRenewalAction(initialState, new FormData(form));
        setState(result);
        if (result.success) onSuccess?.();
      } catch {
        setState({ error: "Your payment details could not be submitted. Refresh and try again." });
      }
    });
  }

  if (!identityVerified) return <div className="member-form-message member-form-message-error" role="alert">Verification Pending: Your ID must be verified by an admin before you can activate your membership. <Link className="text-link" href="/member/dashboard#identity-verification">Verify ID Now</Link></div>;

  return (
    <form className="member-form" onSubmit={submit}>
      <p className="member-payment-instructions">{isFirstSubscription ? "First 30-day subscription payment" : "Next 30-day subscription"}: <strong>৳{amount.toLocaleString("en-BD")}</strong> for 30 days, covering multiple books without a per-book fee. Send money to {siteInfo.paymentMethod} at <strong>{siteInfo.paymentDisplayNumber}</strong>.</p>
      {optimisticSubmitting || isPending ? <p className="member-field-note" role="status">Submitting your payment details for verification…</p> : null}
      <label htmlFor="renewal-payment-method">Payment method</label>
      <select autoComplete="off" id="renewal-payment-method" name="paymentMethod" required defaultValue="">
        <option value="" disabled>Select payment method</option>
        <option value="bkash">bKash</option>
        <option value="nagad">Nagad</option>
      </select>
      <label htmlFor="renewal-transaction-id">bKash / Nagad Transaction ID (TrxID)</label>
      <input autoComplete="off" id="renewal-transaction-id" maxLength={10} minLength={10} name="transactionId" pattern="[A-Za-z0-9]{10}" placeholder="10-character TrxID" required />
      <p className="member-field-note">Send exactly the amount shown. You will find the 10-character TrxID in the confirmation SMS after payment.</p>
      {state.error ? <p className="member-form-message member-form-message-error" role="alert">{state.error}</p> : null}
      {state.success ? <p className="member-form-message member-form-message-success" role="status">{state.success}</p> : null}
      <button aria-busy={isPending} className="button-primary button-stateful" disabled={isPending} type="submit"><ButtonLabel pending={isPending} pendingLabel="Submitting…">Submit TrxID for Membership Verification</ButtonLabel></button>
    </form>
  );
}