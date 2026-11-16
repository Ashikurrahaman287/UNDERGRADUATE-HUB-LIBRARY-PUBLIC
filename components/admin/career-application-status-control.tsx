"use client";

import { useOptimistic, useState, useTransition, type FormEvent } from "react";
import { ButtonLabel } from "@/components/button-label";
import { updateCareerApplicationStatusAction, type ApplicationStatus } from "@/app/admin/(protected)/careers/actions";

function statusClass(status: ApplicationStatus): string {
  if (status === "SHORTLISTED") return "admin-status admin-status-available";
  if (status === "PENDING") return "admin-status admin-status-limited";
  return "admin-status admin-status-unavailable";
}

export function CareerApplicationStatusControl({ applicationId, jobId, status, applicantName }: {
  applicationId: string;
  jobId: string;
  status: ApplicationStatus;
  applicantName: string;
}) {
  const [statusState, setStatusState] = useState({ source: status, committed: status, selected: status });
  const committedStatus = statusState.source === status ? statusState.committed : status;
  const selectedStatus = statusState.source === status ? statusState.selected : status;
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(committedStatus, (_current, next: ApplicationStatus) => next);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      setOptimisticStatus(selectedStatus);
      try {
        const result = await updateCareerApplicationStatusAction(applicationId, jobId, selectedStatus);
        if (result.error) {
          setError(result.error);
          return;
        }
        setStatusState({ source: status, committed: selectedStatus, selected: selectedStatus });
      } catch {
        setError("The application status could not be updated. Refresh and try again.");
      }
    });
  }

  return <>
    <span aria-live="polite" className={statusClass(optimisticStatus)}>{optimisticStatus}</span>
    <form className="career-application-review" onSubmit={submit}>
      <select aria-label={`Set status for ${applicantName}`} disabled={pending} onChange={(event) => setStatusState({ source: status, committed: committedStatus, selected: event.target.value as ApplicationStatus })} value={selectedStatus}>
        <option value="PENDING">Pending</option><option value="SHORTLISTED">Shortlisted</option><option value="REJECTED">Rejected</option>
      </select>
      <button aria-busy={pending} className="admin-action-button button-stateful" disabled={pending} type="submit"><ButtonLabel pending={pending} pendingLabel="Saving…">Update</ButtonLabel></button>
    </form>
    {error ? <p className="admin-form-error" role="alert">{error}</p> : null}
  </>;
}