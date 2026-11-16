"use client";

import { useActionState, useState } from "react";
import { ButtonLabel } from "@/components/button-label";
import { adminLoginStepAction, type AdminLoginState } from "@/app/admin/login/actions";

type OtpMethod = "phone" | "email";

function OtpDestinationFields({
  idPrefix,
  method,
  destination,
  onMethodChange,
  onDestinationChange,
}: {
  idPrefix: string;
  method: OtpMethod;
  destination: string;
  onMethodChange: (method: OtpMethod) => void;
  onDestinationChange: (destination: string) => void;
}) {
  const inputId = `${idPrefix}-destination`;
  return <>
    <fieldset className="admin-otp-methods">
      <legend>Choose verification method</legend>
      <label><input checked={method === "phone"} name={`${idPrefix}-method-choice`} onChange={() => onMethodChange("phone")} type="radio" /> Verify via Phone OTP</label>
      <label><input checked={method === "email"} name={`${idPrefix}-method-choice`} onChange={() => onMethodChange("email")} type="radio" /> Verify via Email OTP</label>
    </fieldset>
    <input name="method" type="hidden" value={method} />
    <label htmlFor={inputId}>{method === "phone" ? "Phone number" : "Email address"}</label>
    <input
      autoComplete={method === "phone" ? "tel" : "email"}
      id={inputId}
      inputMode={method === "phone" ? "tel" : "email"}
      maxLength={method === "phone" ? 14 : 254}
      name="destination"
      onChange={(event) => onDestinationChange(event.currentTarget.value)}
      pattern={method === "phone" ? "\\+880[0-9]{10}" : undefined}
      placeholder={method === "phone" ? "+880..." : "admin@example.com"}
      required
      type={method === "phone" ? "tel" : "email"}
      value={destination}
    />
  </>;
}

export function AdminLoginForm({ initialState }: { initialState: AdminLoginState }) {
  const [state, formAction, pending] = useActionState(adminLoginStepAction, initialState);
  const [keyVisible, setKeyVisible] = useState(false);
  const [otpMethod, setOtpMethod] = useState<OtpMethod>(initialState.otpMethod ?? "phone");
  const [destination, setDestination] = useState("");
  const step = state.step ?? initialState.step ?? "passphrase";
  const destinationHint = state.destinationHint ?? initialState.destinationHint;

  if (step === "method") {
    return (
      <form action={formAction} className="admin-login-form">
        <input name="step" type="hidden" value="method" />
        <p className="admin-login-step">Step 2 of 3 · Choose where to receive your code</p>
        <OtpDestinationFields
          destination={destination}
          idPrefix="admin-otp"
          method={otpMethod}
          onDestinationChange={setDestination}
          onMethodChange={setOtpMethod}
        />
        {state.error ? <p className="admin-form-error" role="alert">{state.error}</p> : null}
        <button aria-busy={pending} className="button-primary admin-login-submit button-stateful" disabled={pending} type="submit">
          <ButtonLabel pending={pending} pendingLabel="Sending code…">Send OTP</ButtonLabel>
        </button>
      </form>
    );
  }

  if (step === "otp") {
    return (
      <div className="admin-login-step-group">
        <form action={formAction} className="admin-login-form">
          <input name="step" type="hidden" value="otp" />
          <p className="admin-login-step">Step 3 of 3 · Enter the six-digit code sent to {destinationHint ?? "your selected destination"}</p>
          <label htmlFor="admin-otp-code">Verification code</label>
          <input autoComplete="one-time-code" autoFocus id="admin-otp-code" inputMode="numeric" maxLength={6} minLength={6} name="otp" pattern="[0-9]{6}" required />
          {state.error ? <p className="admin-form-error" role="alert">{state.error}</p> : null}
          <button aria-busy={pending} className="button-primary admin-login-submit button-stateful" disabled={pending} type="submit">
            <ButtonLabel pending={pending} pendingLabel="Verifying code…">Verify and continue</ButtonLabel>
          </button>
        </form>
        <details className="admin-login-resend">
          <summary>Resend code or use another phone</summary>
          <form action={formAction} className="admin-login-form">
            <input name="step" type="hidden" value="method" />
            <OtpDestinationFields
              destination={destination}
              idPrefix="admin-otp-resend"
              method={otpMethod}
              onDestinationChange={setDestination}
              onMethodChange={setOtpMethod}
            />
            <button aria-busy={pending} className="admin-action-button" disabled={pending} type="submit">
              {pending ? "Sending…" : "Send new OTP"}
            </button>
          </form>
        </details>
      </div>
    );
  }

  return (
    <form action={formAction} className="admin-login-form">
      <input name="step" type="hidden" value="passphrase" />
      <p className="admin-login-step">Step 1 of 3 · Master passphrase</p>
      <label htmlFor="admin-access-key">Admin passphrase</label>
      <div className="admin-key-field">
        <input autoComplete="current-password" id="admin-access-key" maxLength={1024} minLength={24} name="accessKey" placeholder="Enter master passphrase" required type={keyVisible ? "text" : "password"} />
        <button aria-label={keyVisible ? "Hide passphrase" : "Show passphrase"} aria-pressed={keyVisible} className="admin-key-toggle" onClick={() => setKeyVisible(!keyVisible)} type="button">
          {keyVisible ? "Hide" : "Show"}
        </button>
      </div>
      {state.error ? <p className="admin-form-error" role="alert">{state.error}</p> : null}
      <button aria-busy={pending} className="button-primary admin-login-submit button-stateful" disabled={pending} type="submit">
        <ButtonLabel pending={pending} pendingLabel="Checking passphrase…">Continue</ButtonLabel>
      </button>
    </form>
  );
}
