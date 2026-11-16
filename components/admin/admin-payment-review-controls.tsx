"use client";

import { useOptimistic, useRef, type MouseEvent } from "react";
import { useFormStatus } from "react-dom";
import { reviewUnifiedPaymentAction } from "@/app/admin/(protected)/payments/actions";

type Plan = { id: string; name: string; price_bdt: number; duration_days: number };

type Props = {
  recordId: string;
  recordType: string;
  relatedId: string | null;
  plans: Plan[];
  status: "PENDING" | "APPROVED" | "REJECTED";
};

function DecisionButton({ decision, noteRef, planRef }: {
  decision: "approve" | "reject";
  noteRef: React.RefObject<HTMLInputElement | null>;
  planRef: React.RefObject<HTMLSelectElement | null>;
}) {
  const { pending } = useFormStatus();

  function prepareReview(event: MouseEvent<HTMLButtonElement>) {
    if (decision === "approve" && planRef.current && !planRef.current.value) {
      window.alert("Select a 30-day plan before approving this membership payment.");
      planRef.current.focus();
      event.preventDefault();
      return;
    }
    if (decision === "reject") {
      const reason = window.prompt("Enter a rejection reason (for example: Invalid TrxID or Amount Mismatch).");
      if (reason === null) {
        event.preventDefault();
        return;
      }
      if (!reason.trim()) {
        window.alert("A rejection reason is required.");
        event.preventDefault();
        return;
      }
      if (noteRef.current) noteRef.current.value = reason.trim().slice(0, 1000);
    } else if (noteRef.current) {
      noteRef.current.value = "Payment verified.";
    }
  }

  const approve = decision === "approve";
  return <button aria-busy={pending} className={`button-stateful ${approve ? "admin-payment-approve" : "admin-payment-reject"}`} disabled={pending} name="decision" onClick={prepareReview} type="submit" value={decision}>
    <span className="button-state-label">{approve ? "Approve" : "Reject"}</span>
    <span className="button-pending-label">{approve ? "Approving…" : "Rejecting…"}</span>
  </button>;
}

export function AdminPaymentReviewControls({ recordId, recordType, relatedId, plans, status }: Props) {
  const noteRef = useRef<HTMLInputElement>(null);
  const planRef = useRef<HTMLSelectElement>(null);
  const requiresPlan = recordType === "membership";
  const requiresRelatedRecord = recordType === "membership" || recordType === "rental";
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(status, (_current, next: Props["status"]) => next);
  const statusClass = optimisticStatus === "APPROVED" ? "admin-status admin-status-available"
    : optimisticStatus === "PENDING" ? "admin-status admin-status-limited"
      : "admin-status admin-status-unavailable";

  async function submitReview(formData: FormData) {
    const decision = formData.get("decision");
    if (decision === "approve" || decision === "reject") {
      setOptimisticStatus(decision === "approve" ? "APPROVED" : "REJECTED");
    }
    await reviewUnifiedPaymentAction(formData);
  }

  return <>
    <td><span className={statusClass} role="status">{optimisticStatus}</span></td>
    <td>{optimisticStatus !== "PENDING" ? <span aria-live="polite">Review submitted</span>
      : requiresRelatedRecord && !relatedId ? <span className="admin-form-error">Linked review record unavailable</span>
        : <form action={submitReview} className="admin-payment-review-controls">
          <input name="recordId" type="hidden" value={recordId} />
          <input name="recordType" type="hidden" value={recordType} />
          <input name="relatedId" type="hidden" value={relatedId ?? ""} />
          <input name="adminNote" readOnly ref={noteRef} type="hidden" value="" />
          {requiresPlan ? <label className="admin-payment-plan">Plan for membership activation<select name="planId" ref={planRef} defaultValue=""><option disabled value="">Select 30-day plan</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · ৳{Number(plan.price_bdt).toLocaleString("en-BD")}</option>)}</select></label> : null}
          <div className="admin-payment-buttons">
            <DecisionButton decision="approve" noteRef={noteRef} planRef={planRef} />
            <DecisionButton decision="reject" noteRef={noteRef} planRef={planRef} />
          </div>
        </form>}
    </td>
  </>;
}