"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ButtonLabel } from "@/components/button-label";
import { recordMemberOtpAddressChangeAction, requestMemberOtpAction, verifyMemberOtpAction } from "@/app/member/login/actions";
import { isValidBangladeshPhone, normalizeBangladeshPhone } from "@/lib/member/phone";

type MemberAuthFormProps = {
  defaultPhone?: string;
  nextDestination?: string;
};

function getIdentifierMethod(value: string): "phone" | "email" {
  return value.includes("@") ? "email" : "phone";
}

function isValidEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function MemberAuthForm({ defaultPhone = "", nextDestination }: MemberAuthFormProps) {
  const router = useRouter();
  const [identifier, setIdentifier] = useState(defaultPhone);
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [addressChangeCount, setAddressChangeCount] = useState(0);
  const [isAddressLocked, setIsAddressLocked] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [statusMessage, setStatusMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setResendSeconds((current) => (current <= 1 ? 0 : current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendSeconds]);

  const method = getIdentifierMethod(identifier.trim());
  const normalizedIdentifier = method === "phone"
    ? normalizeBangladeshPhone(identifier)
    : identifier.trim().toLowerCase();
  const validIdentifier = method === "phone"
    ? isValidBangladeshPhone(identifier)
    : isValidEmail(normalizedIdentifier);

  async function requestOtp() {
    if (!validIdentifier) {
      setStatusMessage({ type: "error", text: method === "phone"
        ? "Enter a valid Bangladesh mobile number, such as 01XXXXXXXXX."
        : "Enter a valid email address." });
      return;
    }
    if (isAddressLocked) {
      setStatusMessage({ type: "error", text: "Maximum address changes reached. Please wait or refresh." });
      return;
    }

    setIsSubmitting(true);
    setStatusMessage(null);
    try {
      const result = await requestMemberOtpAction(method, normalizedIdentifier);
      if (result.error) {
        setStatusMessage({ type: "error", text: result.error });
        return;
      }
      setOtpSent(true);
      setResendSeconds(30);
      setStatusMessage({ type: "success", text: method === "phone"
        ? "If this number can receive verification codes, one was sent by SMS."
        : "If this address can receive verification codes, one was sent by email." });
    } catch {
      setStatusMessage({ type: "error", text: "We could not send a verification code. Try again later." });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleAddressChange() {
    if (isAddressLocked) {
      setStatusMessage({ type: "error", text: "Maximum address changes reached. Please wait or refresh." });
      return;
    }

    if (addressChangeCount >= 2) {
      setIsAddressLocked(true);
      setStatusMessage({ type: "error", text: "Maximum address changes reached. Please wait or refresh." });
      return;
    }

    setStatusMessage(null);
    setOtp("");
    setOtpSent(false);
    setResendSeconds(0);
    setIdentifier("");
    try {
      const result = await recordMemberOtpAddressChangeAction();
      const nextAddressChangeCount = result.addressChanges ?? addressChangeCount + 1;
      setAddressChangeCount(nextAddressChangeCount);

      if (result.error) {
        setIsAddressLocked(true);
        setStatusMessage({ type: "error", text: result.error });
        return;
      }
    } catch {
      setStatusMessage({ type: "error", text: "Maximum address changes reached. Please wait or refresh." });
      setIsAddressLocked(true);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!otpSent) {
      await requestOtp();
      return;
    }
    if (!validIdentifier) {
      setStatusMessage({ type: "error", text: "Enter a valid phone number or email address." });
      return;
    }
    if (!/^\d{6}$/.test(otp)) {
      setStatusMessage({ type: "error", text: "Enter the 6-digit verification code." });
      return;
    }

    setIsSubmitting(true);
    setStatusMessage(null);
    try {
      const result = await verifyMemberOtpAction(method, normalizedIdentifier, otp, nextDestination);
      if (result.error || !result.redirectTo) {
        setStatusMessage({ type: "error", text: result.error ?? "Sign-in could not be completed. Try again." });
        return;
      }
      router.replace(result.redirectTo);
      router.refresh();
    } catch {
      setStatusMessage({ type: "error", text: "Sign-in could not be completed. Check your connection and request a new code if needed." });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="member-auth-panel">
      <form className="member-form" onSubmit={submit}>
        <label htmlFor="member-identifier">Phone number or email address</label>
        <input
          autoComplete={method === "phone" ? "tel" : "email"}
          autoFocus={!otpSent}
          disabled={otpSent || isAddressLocked}
          id="member-identifier"
          inputMode={method === "phone" ? "tel" : "email"}
          onChange={(event) => {
            if (otpSent || isAddressLocked) return;
            setIdentifier(event.target.value);
            setOtpSent(false);
            setOtp("");
            setResendSeconds(0);
            setStatusMessage(null);
          }}
          placeholder="01XXXXXXXXX or name@example.com"
          required
          type="text"
          value={identifier}
        />
        {otpSent ? <>
          <label htmlFor="member-login-otp">6-digit verification code</label>
          <input
            autoComplete="one-time-code"
            autoFocus
            id="member-login-otp"
            inputMode="numeric"
            maxLength={6}
            onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
            pattern="[0-9]{6}"
            placeholder="000000"
            required
            value={otp}
          />
        </> : null}
        <div className="member-form-actions">
          <button aria-busy={isSubmitting} className="button-primary button-stateful" disabled={isSubmitting || !validIdentifier || (otpSent && otp.length !== 6) || isAddressLocked} type="submit">
            <ButtonLabel pending={isSubmitting} pendingLabel={otpSent ? "Verifying code…" : "Sending code…"}>{otpSent ? "Verify and continue" : "Send verification code"}</ButtonLabel>
          </button>
          {otpSent ? <button aria-busy={isSubmitting} className="button-outline button-stateful" disabled={isSubmitting || resendSeconds > 0 || isAddressLocked} onClick={() => void requestOtp()} type="button">
            <ButtonLabel pending={isSubmitting} pendingLabel="Sending code…">{resendSeconds > 0 ? `Resend in ${resendSeconds}s` : "Send a new code"}</ButtonLabel>
          </button> : null}
          {otpSent ? <button className="button-outline button-stateful" disabled={isSubmitting || isAddressLocked} onClick={() => void handleAddressChange()} type="button">
            Change number / email
          </button> : null}
        </div>
      </form>
      {statusMessage ? <p className={`member-form-message member-form-message-${statusMessage.type}`} role={statusMessage.type === "error" ? "alert" : "status"}>{statusMessage.text}</p> : null}
    </section>
  );
}