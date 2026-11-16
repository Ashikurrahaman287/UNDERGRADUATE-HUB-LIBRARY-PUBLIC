"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { MemberSubmitButton } from "@/components/member/member-submit-button";
import { submitWalletPaymentAction, type WalletPaymentState } from "@/app/member/dashboard/wallet/actions";
import { siteInfo } from "@/lib/site-info";

type WalletPurpose = "MANUAL_BALANCE_TOPUP" | "LATE_FEE" | "SUBSCRIPTION_RENEWAL";
type Gateway = "bkash" | "nagad";

const initialState: WalletPaymentState = {};

function money(amount: number): string {
  return `৳${Number(amount).toLocaleString("en-BD", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function WalletPaymentPanel({ lateFee, subscriptionFee, lateFeePending, renewalPending, identityVerified }: {
  lateFee: number;
  subscriptionFee: number | null;
  lateFeePending: boolean;
  renewalPending: boolean;
  identityVerified: boolean;
}) {
  const [state, formAction] = useActionState(submitWalletPaymentAction, initialState);
  const [purpose, setPurpose] = useState<WalletPurpose | null>(null);
  const [amount, setAmount] = useState("");
  const [customAmount, setCustomAmount] = useState("");
  const [gateway, setGateway] = useState<Gateway | "">("");
  const [phone, setPhone] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [step, setStep] = useState(1);
  const [dismissed, setDismissed] = useState(false);

  function begin(nextPurpose: WalletPurpose, nextAmount: number) {
    setPurpose(nextPurpose);
    setAmount(nextAmount.toFixed(2));
    setGateway("");
    setPhone("");
    setTransactionId("");
    setStep(1);
  }

  function startTopup() {
    if (!identityVerified) return;
    const parsedAmount = Number(customAmount);
    if (Number.isFinite(parsedAmount) && parsedAmount > 0 && parsedAmount <= 100000) begin("MANUAL_BALANCE_TOPUP", parsedAmount);
  }

  const confirmationTitle = purpose === "MANUAL_BALANCE_TOPUP" ? "Payment TrxID Received!" : "Thanks for Your Payment!";
  const confirmationMessage = purpose === "MANUAL_BALANCE_TOPUP"
    ? `Our team will verify your TrxID shortly. Once confirmed, ${money(Number(amount))} will be added to your account balance automatically.`
    : state.success;

  return (
    <>
      <div className="wallet-payment-actions">
        <button className="button-outline" disabled={lateFee <= 0 || lateFeePending} onClick={() => begin("LATE_FEE", lateFee)} type="button">
          {lateFeePending ? "Late fee payment pending" : `Pay Late Fee · ${money(lateFee)}`}
        </button>
        <button className="button-primary" disabled={!identityVerified || subscriptionFee === null || subscriptionFee <= 0 || renewalPending} onClick={() => subscriptionFee !== null && begin("SUBSCRIPTION_RENEWAL", subscriptionFee)} type="button">
          {renewalPending ? "Subscription payment pending" : "Pay Next Month Fee"}
        </button>
      </div>

      {!identityVerified ? <div className="member-form-message member-form-message-error" role="alert"><strong>ID Verification Required:</strong> Please submit your Student ID or NID for verification before topping up your account balance. <Link className="text-link" href="/member/dashboard#identity-verification">Verify ID Now</Link></div> : null}

      <section className="wallet-topup" aria-labelledby="wallet-topup-title">
        <div className="wallet-topup-heading"><div><p className="eyebrow">Add funds</p><h3 id="wallet-topup-title">Top up your wallet</h3></div><span>Choose an amount or enter your own</span></div>
        <div aria-label="Suggested top-up amounts" className="wallet-amount-presets">
          {[50, 100, 500].map((preset) => <button aria-pressed={Number(customAmount) === preset} key={preset} onClick={() => setCustomAmount(String(preset))} type="button">৳{preset}</button>)}
        </div>
        <label htmlFor="wallet-custom-amount">Amount (TK)</label>
        <div className="wallet-topup-controls">
          <input id="wallet-custom-amount" inputMode="decimal" max="100000" min="1" onChange={(event) => setCustomAmount(event.target.value)} placeholder="50, 100, 500" step="0.01" type="number" value={customAmount} />
          <button className="button-outline" disabled={!identityVerified || !Number.isFinite(Number(customAmount)) || Number(customAmount) <= 0 || Number(customAmount) > 100000} onClick={startTopup} type="button">Add Balance</button>
        </div>
      </section>

      {purpose ? <div className="wallet-modal-backdrop">
        <section aria-labelledby="wallet-payment-title" aria-modal="true" className={`wallet-payment-dialog ${gateway ? `wallet-payment-${gateway}` : ""}`} role="dialog">
          <header className="wallet-payment-heading">
            <div><p className="eyebrow">Secure payment submission</p><h2 id="wallet-payment-title">{purpose === "MANUAL_BALANCE_TOPUP" ? "Add Balance to Wallet" : purpose === "LATE_FEE" ? "Pay late fee" : "30-day subscription"}</h2>{purpose === "MANUAL_BALANCE_TOPUP" ? <p className="wallet-payment-subtitle">Send Money / Pay via bKash or Nagad, then enter your Transaction ID (TrxID) below to credit your account balance.</p> : null}</div>
            <button aria-label="Close payment dialog" className="wallet-modal-close" onClick={() => setPurpose(null)} type="button">×</button>
          </header>
          <p className="wallet-payment-total">Amount to send <strong>{money(Number(amount))}</strong></p>
          <div aria-label="Payment steps" className="wallet-payment-steps"><span aria-current={step === 1 ? "step" : undefined}>1 Gateway</span><span aria-current={step === 2 ? "step" : undefined}>2 Phone</span><span aria-current={step === 3 ? "step" : undefined}>3 Verify</span></div>

          {step === 1 ? <div className="wallet-gateway-options">
            <p>Select a payment gateway</p>
            <div className="wallet-gateway-buttons">
              <button aria-pressed={gateway === "bkash"} className="wallet-gateway-choice wallet-gateway-bkash" onClick={() => setGateway("bkash")} type="button"><strong aria-hidden="true">bKash</strong><span>Mobile payment</span></button>
              <button aria-pressed={gateway === "nagad"} className="wallet-gateway-choice wallet-gateway-nagad" onClick={() => setGateway("nagad")} type="button"><strong aria-hidden="true">Nagad</strong><span>Mobile payment</span></button>
            </div>
            <button className="button-primary" disabled={!gateway} onClick={() => setStep(2)} type="button">Continue</button>
          </div> : null}

          {step === 2 ? <div className="wallet-payment-step">
            <label htmlFor="wallet-payer-phone">{gateway === "bkash" ? "bKash" : "Nagad"} phone number</label>
            <input autoComplete="tel" id="wallet-payer-phone" inputMode="tel" maxLength={14} onChange={(event) => setPhone(event.target.value)} placeholder="01XXXXXXXXX" type="tel" value={phone} />
            <div className="wallet-step-actions"><button className="button-outline" onClick={() => setStep(1)} type="button">Back</button><button className="button-primary" disabled={!/^01\d{9}$/.test(phone.replace(/\D/g, ""))} onClick={() => setStep(3)} type="button">Continue</button></div>
          </div> : null}

          {step === 3 ? <form action={formAction} className="wallet-payment-step" onSubmit={() => setDismissed(false)}>
            <input name="paymentType" type="hidden" value={purpose} />
            <input name="amount" type="hidden" value={amount} />
            <input name="paymentMethod" type="hidden" value={gateway} />
            <input name="payerPhone" type="hidden" value={phone.replace(/\D/g, "")} />
            <div className={`wallet-merchant-details wallet-merchant-${gateway}`}><span className="wallet-gateway-wordmark">{gateway === "bkash" ? "bKash" : "Nagad"}</span><span>Send <strong>{money(Number(amount))}</strong> to merchant number</span><strong className="wallet-merchant-number">{siteInfo.paymentNumber}</strong></div>
            <label htmlFor="wallet-transaction-id">bKash / Nagad Transaction ID (TrxID)</label>
            <input autoComplete="off" id="wallet-transaction-id" maxLength={64} minLength={6} name="transactionId" onChange={(event) => setTransactionId(event.target.value)} pattern="[A-Za-z0-9-]{6,64}" placeholder="e.g., BLJ8X9Q2P4 or 9A8B7C6D5E" required value={transactionId} />
            <p className="wallet-transaction-help">You will find the 10-character TrxID in the confirmation SMS from bKash (*247#) or Nagad (*167#) after completing the payment.</p>
            {state.error ? <p className="member-form-message member-form-message-error" role="alert">{state.error}</p> : null}
            <div className="wallet-step-actions"><button className="button-outline" onClick={() => setStep(2)} type="button">Back</button><MemberSubmitButton pendingLabel="Submitting…">{purpose === "MANUAL_BALANCE_TOPUP" ? "Submit TrxID to Add Balance" : purpose === "SUBSCRIPTION_RENEWAL" ? "Submit TrxID for Membership Verification" : "Submit TrxID for Fine Verification"}</MemberSubmitButton></div>
          </form> : null}
        </section>
      </div> : null}

      {state.success && !dismissed ? <div className="wallet-modal-backdrop wallet-confirmation-backdrop">
        <section aria-labelledby="wallet-confirmation-title" aria-modal="true" className="wallet-payment-dialog wallet-confirmation" role="dialog">
          <p className="eyebrow">Payment submitted</p><h2 id="wallet-confirmation-title">{confirmationTitle}</h2><p role="status">{confirmationMessage}</p>
          <button className="button-primary" onClick={() => { setDismissed(true); setPurpose(null); }} type="button">Done</button>
        </section>
      </div> : null}
    </>
  );
}