"use client";

import { useActionState, useEffect, useOptimistic, useRef, useState } from "react";
import { ButtonLabel } from "@/components/button-label";
import { extendRentalDueDateAction, extendRentalPeriodAction, type RentalDueDateExtensionState } from "@/app/admin/(protected)/rentals/actions";

const initialState: RentalDueDateExtensionState = {};

function formatDueDate(value: string | null): string {
  if (!value) return "Not set";
  return new Date(value).toLocaleDateString("en-BD", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Dhaka" });
}

type RentalDisplayState = { dueDate: string | null; status: string };

function proposedDueDate(formData: FormData, currentDueDate: string | null, mode: "days" | "date"): string | null {
  if (mode === "days") {
    const days = Number(formData.get(mode === "days" && formData.has("customDays") ? "customDays" : "days"));
    if (!Number.isInteger(days) || days < 1 || days > 3650) return null;
    const baseTime = Math.max(currentDueDate ? Date.parse(currentDueDate) : 0, Date.now());
    return new Date(baseTime + days * 86_400_000).toISOString();
  }
  const date = formData.get("newDueDate")?.toString() ?? "";
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T23:59:59.999+06:00`).toISOString() : null;
}

function statusClass(status: string): string {
  if (status === "active" || status === "returned") return "admin-status admin-status-available";
  if (status === "overdue" || status === "cancelled") return "admin-status admin-status-unavailable";
  if (status === "return_requested") return "admin-status admin-status-limited";
  return "admin-status admin-status-limited";
}

export function RentalDueDateExtension({ rentalId, memberName, bookTitle, currentDueDate, status, canExtend }: {
  rentalId: string;
  memberName: string;
  bookTitle: string;
  currentDueDate: string | null;
  status: string;
  canExtend: boolean;
}) {
  const [committedState, setCommittedState] = useState({ sourceDueDate: currentDueDate, sourceStatus: status, value: { dueDate: currentDueDate, status } });
  const committed = committedState.sourceDueDate === currentDueDate && committedState.sourceStatus === status
    ? committedState.value
    : { dueDate: currentDueDate, status };
  const [display, setOptimisticDisplay] = useOptimistic(committed, (_current, next: RentalDisplayState) => next);
  const [quickState, quickAction, quickPending] = useActionState(async (previousState: RentalDueDateExtensionState, formData: FormData) => {
    const nextDueDate = proposedDueDate(formData, committed.dueDate, "days");
    if (nextDueDate) setOptimisticDisplay({ dueDate: nextDueDate, status: "active" });
    const result = await extendRentalPeriodAction(previousState, formData);
    if (result.success && nextDueDate) setCommittedState({ sourceDueDate: currentDueDate, sourceStatus: status, value: { dueDate: nextDueDate, status: "active" } });
    return result;
  }, initialState);
  const [state, formAction, pending] = useActionState(async (previousState: RentalDueDateExtensionState, formData: FormData) => {
    const nextDueDate = proposedDueDate(formData, committed.dueDate, "date");
    if (nextDueDate) setOptimisticDisplay({ dueDate: nextDueDate, status: "active" });
    const result = await extendRentalDueDateAction(previousState, formData);
    if (result.success && nextDueDate) setCommittedState({ sourceDueDate: currentDueDate, sourceStatus: status, value: { dueDate: nextDueDate, status: "active" } });
    return result;
  }, initialState);
  const [mode, setMode] = useState<"days" | "date">("days");
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const isPending = quickPending || pending;

  useEffect(() => {
    if (state.success) detailsRef.current?.removeAttribute("open");
  }, [state.success]);

  return <div className="rental-due-date-control">
    <span className={statusClass(display.status)}>{display.status === "pending" ? "awaiting handover" : display.status}</span>
    <span className="rental-due-date-current" aria-live="polite">Due {formatDueDate(display.dueDate)}{isPending ? <span className="optimistic-updating">Updating…</span> : null}</span>
    {quickState.success ? <p className="admin-flash-success rental-due-date-feedback" role="status">{quickState.success}</p> : null}
    {state.success ? <p className="admin-flash-success rental-due-date-feedback" role="status">{state.success}</p> : null}
    {quickState.error || state.error ? <p className="admin-form-error rental-due-date-feedback" role="alert">{quickState.error ?? state.error}</p> : null}
    {canExtend ? <>
      <form action={quickAction} className="admin-rental-extension"><input name="rentalId" type="hidden" value={rentalId} /><label className="visually-hidden" htmlFor={`rental-extension-${rentalId}`}>Rental extension</label><select aria-label={`Rental extension for ${bookTitle}`} disabled={isPending} defaultValue="7" id={`rental-extension-${rentalId}`} name="days"><option value="7">+7 Days</option><option value="14">+14 Days</option><option value="30">+30 Days</option></select><button aria-busy={quickPending} className="button-secondary button-stateful" disabled={isPending} type="submit"><ButtonLabel pending={quickPending} pendingLabel="Extending…">Extend due date</ButtonLabel></button></form>
      <details ref={detailsRef}>
        <summary className="admin-action-button">Custom Extend</summary>
        <form action={formAction} className="rental-due-date-popover">
        <input name="rentalId" type="hidden" value={rentalId} />
        <h3 className="display-font">Set rental due date</h3>
        <dl className="rental-due-date-summary">
          <div><dt>Member</dt><dd>{memberName}</dd></div>
          <div><dt>Book</dt><dd>{bookTitle}</dd></div>
          <div><dt>Current due date</dt><dd>{formatDueDate(display.dueDate)}</dd></div>
        </dl>
        <fieldset className="rental-due-date-method">
          <legend>Extension method</legend>
          <label><input checked={mode === "days"} name="extensionMode" onChange={() => setMode("days")} type="radio" value="days" /> Add custom days</label>
          <label><input checked={mode === "date"} name="extensionMode" onChange={() => setMode("date")} type="radio" value="date" /> Choose exact due date</label>
        </fieldset>
        {mode === "days" ? <label className="admin-form-field">Days to add
          <input defaultValue="7" max="3650" min="1" name="customDays" required type="number" />
        </label> : <label className="admin-form-field">New due date
          <input name="newDueDate" required type="date" />
        </label>}
        {state.error ? <p className="admin-form-error" role="alert">{state.error}</p> : null}
        <div className="rental-due-date-actions">
          <button className="button-outline" onClick={() => detailsRef.current?.removeAttribute("open")} type="button">Cancel</button>
          <button aria-busy={pending} className="button-primary button-stateful" disabled={isPending} type="submit"><ButtonLabel pending={pending} pendingLabel="Saving…">Save New Due Date</ButtonLabel></button>
        </div>
        </form>
      </details>
    </> : null}
  </div>;
}