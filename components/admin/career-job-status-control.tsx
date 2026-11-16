"use client";

import { OptimisticButton } from "@/components/ui/OptimisticButton";
import { updateCareerJobStatusAction, type JobStatus } from "@/app/admin/(protected)/careers/actions";

function statusClass(status: JobStatus): string {
  return `admin-status ${status === "ACTIVE" ? "admin-status-available" : "admin-status-unavailable"}`;
}

export function CareerJobStatusControl({ jobId, status }: { jobId: string; status: JobStatus }) {
  return <OptimisticButton
    actionId={jobId}
    className="admin-action-button"
    initialState={status}
    onActionServer={(id, nextStatus) => updateCareerJobStatusAction(id, nextStatus)}
    optimisticState={(current) => current === "ACTIVE" ? "CLOSED" : "ACTIVE"}
    pendingLabel="Updating…"
    renderState={(nextStatus) => <span className={statusClass(nextStatus)}>{nextStatus}</span>}
  >
    {(nextStatus) => nextStatus === "ACTIVE" ? "Close" : "Reopen"}
  </OptimisticButton>;
}