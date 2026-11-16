"use client";

import { useActionState, useEffect, useOptimistic, useRef, useState } from "react";
import { ButtonLabel } from "@/components/button-label";
import { extendMemberValidityAction, type MemberValidityExtensionState } from "@/app/admin/(protected)/members/actions";

const initialState: MemberValidityExtensionState = {};

function formattedExpiry(value: string | null): string {
  if (!value) return "Not set";
  return new Date(value).toLocaleDateString("en-BD", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Dhaka" });
}

function proposedExpiry(formData: FormData, currentExpiry: string | null): string | null {
  if (formData.get("extensionMode") === "days") {
    const days = Number(formData.get("daysToAdd"));
    if (!Number.isInteger(days) || days < 1 || days > 3650) return null;
    const baseTime = Math.max(currentExpiry ? Date.parse(currentExpiry) : 0, Date.now());
    return new Date(baseTime + days * 86_400_000).toISOString();
  }
  const date = formData.get("newExpiryDate")?.toString() ?? "";
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T23:59:59.999+06:00`).toISOString() : null;
}

export function MemberValidityExtension({ memberId, name, email, expiresAt }: {
  memberId: string;
  name: string;
  email: string | null;
  expiresAt: string | null;
}) {
  const [expiryState, setExpiryState] = useState({ source: expiresAt, value: expiresAt });
  const committedExpiry = expiryState.source === expiresAt ? expiryState.value : expiresAt;
  const [optimisticExpiry, setOptimisticExpiry] = useOptimistic(committedExpiry, (_current, next: string | null) => next);
  const [state, formAction, pending] = useActionState(async (previousState: MemberValidityExtensionState, formData: FormData) => {
    const nextExpiry = proposedExpiry(formData, committedExpiry);
    if (nextExpiry) setOptimisticExpiry(nextExpiry);
    const result = await extendMemberValidityAction(previousState, formData);
    if (result.success && nextExpiry) setExpiryState({ source: expiresAt, value: nextExpiry });
    return result;
  }, initialState);
  const [mode, setMode] = useState<"days" | "date">("days");
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (state.success) detailsRef.current?.removeAttribute("open");
  }, [state.success]);

  return <div className="member-validity-control">
    <span className="member-validity-expiry" aria-live="polite">Membership expires {formattedExpiry(optimisticExpiry)}{pending ? <span className="optimistic-updating">Updating…</span> : null}</span>
    {state.success ? <p className="admin-flash-success member-validity-feedback" role="status">{state.success}</p> : null}
    <details ref={detailsRef}>
      <summary className="admin-action-button">Extend Validity</summary>
      <form action={formAction} className="member-validity-popover">
        <input name="memberId" type="hidden" value={memberId} />
        <h3 className="display-font">Extend membership validity</h3>
        <dl className="member-validity-summary">
          <div><dt>Member</dt><dd>{name}</dd></div>
          <div><dt>Email</dt><dd>{email || "Not provided"}</dd></div>
          <div><dt>Current expiration</dt><dd>{formattedExpiry(optimisticExpiry)}{pending ? <span className="optimistic-updating">Updating…</span> : null}</dd></div>
        </dl>
        <fieldset className="member-validity-method">
          <legend>Extension method</legend>
          <label><input checked={mode === "days"} name="extensionMode" onChange={() => setMode("days")} type="radio" value="days" /> Add days</label>
          <label><input checked={mode === "date"} name="extensionMode" onChange={() => setMode("date")} type="radio" value="date" /> Set exact expiry date</label>
        </fieldset>
        {mode === "days" ? <label className="admin-form-field">Days to add
          <input defaultValue="30" max="3650" min="1" name="daysToAdd" required type="number" />
        </label> : <label className="admin-form-field">New expiration date
          <input name="newExpiryDate" required type="date" />
        </label>}
        {state.error ? <p className="admin-form-error" role="alert">{state.error}</p> : null}
        <div className="member-validity-actions">
          <button className="button-outline" onClick={() => detailsRef.current?.removeAttribute("open")} type="button">Cancel</button>
          <button aria-busy={pending} className="button-primary button-stateful" disabled={pending} type="submit"><ButtonLabel pending={pending} pendingLabel="Updating…">Update Validity</ButtonLabel></button>
        </div>
      </form>
    </details>
  </div>;
}