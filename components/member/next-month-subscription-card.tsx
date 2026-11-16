"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { SubscriptionRenewalForm } from "@/components/member/subscription-renewal-form";
import { siteInfo } from "@/lib/site-info";

function formatDate(value: string | null): string {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleDateString("en-BD", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Dhaka" });
}

export function NextMonthSubscriptionCard({ amount, currentEndsAt, identityVerified }: {
  amount: number;
  currentEndsAt: string | null;
  identityVerified: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (dialogOpen && !dialog.open) dialog.showModal();
    else if (!dialogOpen && dialog.open) dialog.close();
  }, [dialogOpen]);

  function openPaymentForm() {
    startTransition(() => setDialogOpen(true));
  }

  return <>
    <section aria-labelledby="next-month-subscription-title" className="next-month-subscription-card">
      <div className="next-month-subscription-copy">
        <p className="eyebrow">Keep your reading month ready</p>
        <h2 className="display-font" id="next-month-subscription-title">Pay Next Month Subscription</h2>
        <p>Pay in advance to queue your next 30-day cycle. It starts after your current cycle ends{currentEndsAt ? ` on ${formatDate(currentEndsAt)}` : ""}, so you keep your current access.</p>
        <p>After the library approves your payment, any locked referral reward days are automatically added to the renewed subscription.</p>
      </div>
      <div className="next-month-subscription-payment">
        <span>Personal Send Money</span>
        <strong className="next-month-payment-number" dir="ltr">{siteInfo.paymentDisplayNumber}</strong>
        <span>{siteInfo.paymentMethod} · {amount.toLocaleString("en-BD")} BDT</span>
        {!identityVerified ? <p className="member-field-note">Verified ID is required before submitting renewal payment details.</p> : null}
        <button aria-busy={isPending} className="button-primary button-stateful" disabled={isPending || !identityVerified} onClick={openPaymentForm} type="button">
          <span className="button-state-label">Pay via bKash / Nagad</span>
          <span aria-hidden={ !isPending } className="button-pending-label">Opening…</span>
        </button>
      </div>
    </section>
    <dialog aria-labelledby="next-month-payment-dialog-title" className="next-month-subscription-dialog" onClose={() => setDialogOpen(false)} ref={dialogRef}>
      <header>
        <div><p className="eyebrow">Advance renewal</p><h2 className="display-font" id="next-month-payment-dialog-title">Submit payment</h2></div>
        <button aria-label="Close payment form" className="button-outline" onClick={() => dialogRef.current?.close()} type="button">Close</button>
      </header>
      <SubscriptionRenewalForm amount={amount} identityVerified={identityVerified} onSuccess={() => dialogRef.current?.close()} />
    </dialog>
  </>;
}
