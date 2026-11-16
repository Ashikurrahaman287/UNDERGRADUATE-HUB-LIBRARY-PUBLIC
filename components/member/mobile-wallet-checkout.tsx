"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ButtonLabel } from "@/components/button-label";
import { siteInfo } from "@/lib/site-info";

export type PaymentCheckoutFieldErrors = Partial<Record<"paymentMethod" | "payerPhone" | "transactionId", string>>;

type MobileWalletCheckoutProps = {
  amount?: number;
  confirmationMessage: string;
  dashboardHref: string;
  fieldErrors?: PaymentCheckoutFieldErrors;
  idPrefix: string;
  isPending: boolean;
  pendingLabel: string;
  submitLabel: string;
  success: boolean;
};

export function MobileWalletCheckout({ amount, confirmationMessage, dashboardHref, fieldErrors, idPrefix, isPending, pendingLabel, submitLabel, success }: MobileWalletCheckoutProps) {
  const [gateway, setGateway] = useState<"bkash" | "nagad" | null>(null);
  const [step, setStep] = useState(1);
  const [payerPhone, setPayerPhone] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const merchantNumber = gateway === "bkash" ? siteInfo.paymentNumbers.bkash : siteInfo.paymentNumbers.nagad;
  const formattedPhone = payerPhone.length > 5 ? `${payerPhone.slice(0, 5)}-${payerPhone.slice(5)}` : payerPhone;
  const payerPhoneIsValid = /^01\d{9}$/.test(payerPhone);
  const activeStep = step === 3 && fieldErrors?.paymentMethod ? 1
    : step === 3 && fieldErrors?.payerPhone && !payerPhoneIsValid ? 2
      : step;

  async function copyNumber() {
    try {
      await navigator.clipboard.writeText(merchantNumber);
      setCopyMessage("Payment number copied");
    } catch {
      setCopyMessage("Copy is unavailable. Select the number to copy it.");
    }
    window.setTimeout(() => setCopyMessage(""), 2600);
  }

  return (
    <>
      <section className="membership-checkout" data-theme={gateway ?? "neutral"} aria-label="Payment checkout">
        <ol className="membership-checkout-steps" aria-label="Checkout progress">
          {["Payment method", "Account number", "Confirm payment"].map((label, index) => {
            const stepNumber = index + 1;
            return <li aria-current={activeStep === stepNumber ? "step" : undefined} className={activeStep >= stepNumber ? "is-current" : ""} key={label}><span>{stepNumber}</span>{label}</li>;
          })}
        </ol>

        {activeStep === 1 ? <div className="membership-checkout-stage">
          <div className="membership-checkout-heading"><p className="eyebrow">Step 1 of 3</p><h3>Choose a payment method</h3><p>Select bKash or Nagad to send your payment.</p></div>
          <div className="membership-gateway-options">
            <label className={`membership-gateway-card gateway-bkash${gateway === "bkash" ? " is-selected" : ""}`}>
              <input checked={gateway === "bkash"} name="paymentMethod" onChange={() => { setGateway("bkash"); setStep(1); }} required type="radio" value="bkash" />
              <Image alt="bKash logo" height={42} referrerPolicy="no-referrer" sizes="120px" src="https://znhaqyuhxydnjijbkzza.supabase.co/storage/v1/object/public/book-covers/Bkash-logo.jpg" width={120} />
              <span className="membership-gateway-title">bKash</span><span className="membership-gateway-caption">Send Money</span>
            </label>
            <label className={`membership-gateway-card gateway-nagad${gateway === "nagad" ? " is-selected" : ""}`}>
              <input checked={gateway === "nagad"} name="paymentMethod" onChange={() => { setGateway("nagad"); setStep(1); }} required type="radio" value="nagad" />
              <Image alt="Nagad logo" height={42} referrerPolicy="no-referrer" sizes="120px" src="https://znhaqyuhxydnjijbkzza.supabase.co/storage/v1/object/public/book-covers/Nagad-Logo.wine.png" width={120} />
              <span className="membership-gateway-title">Nagad</span><span className="membership-gateway-caption">Send Money</span>
            </label>
          </div>
          {fieldErrors?.paymentMethod ? <p className="member-field-error" role="alert">{fieldErrors.paymentMethod}</p> : null}
          <button className="membership-checkout-button" disabled={!gateway} onClick={() => setStep(2)} type="button">Continue</button>
        </div> : null}

        {activeStep === 2 ? <div className="membership-checkout-stage">
          <div className="membership-checkout-heading"><p className="eyebrow">Step 2 of 3</p><h3>Your {gateway === "bkash" ? "bKash" : "Nagad"} account number</h3><p>Enter the 11-digit mobile number you will pay from.</p></div>
          <label htmlFor={`${idPrefix}-payer-phone`}>Mobile account number</label>
          <input autoComplete="tel-national" id={`${idPrefix}-payer-phone`} inputMode="numeric" maxLength={12} onChange={(event) => { setPayerPhone(event.target.value.replace(/\D/g, "").slice(0, 11)); setStep(2); }} pattern="01[0-9]{3}-?[0-9]{6}" placeholder="01XXX-XXXXXX" required type="tel" value={formattedPhone} />
          <p className="member-field-note">Use a Bangladesh mobile number beginning with 01. Your number is encrypted before it is stored.</p>
          {fieldErrors?.payerPhone && !payerPhoneIsValid ? <p className="member-field-error" role="alert">{fieldErrors.payerPhone}</p> : null}
          <div className="membership-checkout-actions"><button className="membership-checkout-back" onClick={() => setStep(1)} type="button">Back</button><button className="membership-checkout-button" disabled={!payerPhoneIsValid} onClick={() => setStep(3)} type="button">Proceed to Pay</button></div>
        </div> : null}

        {activeStep === 3 ? <div className="membership-checkout-stage">
          <div className="membership-checkout-heading"><p className="eyebrow">Step 3 of 3</p><h3>Send payment and confirm</h3><p>Use the exact account details below. Your TrxID is reviewed by the library team.</p></div>
          {amount !== undefined ? <p className="membership-payment-amount">Amount due <strong>৳{amount.toLocaleString("en-BD")}</strong></p> : null}
          <div className="membership-merchant-panel">
            <div><span className="membership-merchant-label">{gateway === "bkash" ? "Personal bKash Number" : "Nagad payment number"}</span><strong>{merchantNumber}</strong></div>
            <button aria-label="Copy payment number" className="membership-copy-button" disabled={success} onClick={copyNumber} type="button">Copy Number</button>
          </div>
          <p className="membership-copy-toast" aria-live="polite">{copyMessage}</p>
          {gateway === "bkash" ? <p className="membership-personal-number-note"><strong>Personal bKash Number, not a merchant account.</strong> Choose Send Money; do not choose Merchant Payment.</p> : null}
          <div className="membership-payment-guidance"><strong>Make a {gateway === "bkash" ? "bKash" : "Nagad"} Send Money transfer</strong><ol><li>Open your {gateway === "bkash" ? "bKash" : "Nagad"} app or dial <strong>{gateway === "bkash" ? "*247#" : "*167#"}</strong>.</li><li>Choose <strong>Send Money</strong> and enter the payment number above.</li><li>Send exactly the amount shown, complete the transfer, then return here with your TrxID.</li></ol></div>
          <div className="membership-payment-waiting" role="status"><span aria-hidden="true" className="membership-payment-radar"><i /></span><span>System is waiting for payment submission...</span></div>
          <label htmlFor={`${idPrefix}-transaction-id`}>bKash / Nagad Transaction ID (TrxID)</label>
          <input autoComplete="off" disabled={success} id={`${idPrefix}-transaction-id`} maxLength={10} minLength={10} name="transactionId" onChange={(event) => setTransactionId(event.target.value.replace(/[^a-z0-9]/gi, "").slice(0, 10).toUpperCase())} pattern="[A-Za-z0-9]{10}" placeholder="10-character TrxID" required value={transactionId} />
          <p className="member-field-note">You will find the 10-character TrxID in the confirmation SMS from bKash (*247#) or Nagad (*167#) after completing the payment.</p>
          {fieldErrors?.transactionId ? <p className="member-field-error" role="alert">{fieldErrors.transactionId}</p> : null}
          <label htmlFor={`${idPrefix}-payment-proof`}>Payment proof <span>(optional)</span></label>
          <input accept="image/jpeg,image/png" disabled={success} id={`${idPrefix}-payment-proof`} name="paymentProof" type="file" />
          <p className="member-field-note">Proof images are validated and uploaded to private storage. Do not upload unrelated documents.</p>
          <input name="paymentMethod" type="hidden" value={gateway ?? ""} />
          <input name="payerPhone" type="hidden" value={payerPhone} />
          <div className="membership-checkout-actions"><button className="membership-checkout-back" disabled={isPending || success} onClick={() => setStep(2)} type="button">Back</button><button aria-busy={isPending} className="membership-checkout-button" disabled={isPending || success || transactionId.length !== 10} type="submit"><ButtonLabel pending={isPending} pendingLabel={pendingLabel}>{submitLabel}</ButtonLabel></button></div>
        </div> : null}
      </section>

      {success ? <div className={`membership-confirmation-backdrop membership-confirmation-${gateway ?? "bkash"}`}><section aria-labelledby={`${idPrefix}-confirmation-title`} aria-modal="true" autoFocus className="membership-confirmation-dialog" role="dialog" tabIndex={-1}>
        <span aria-hidden="true" className="membership-confirmation-icon"><i /></span><p className="eyebrow">Pending verification</p><h3 id={`${idPrefix}-confirmation-title`}>Thanks for Your Payment!</h3><p>{confirmationMessage}</p><Link className="membership-checkout-button membership-confirmation-link" href={dashboardHref}>Go to Dashboard</Link>
      </section></div> : null}
    </>
  );
}