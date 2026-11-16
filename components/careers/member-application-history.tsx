"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import { useCareerOptimisticApplications } from "@/components/careers/career-optimistic-applications";

export type MemberCareerApplication = {
  id: string;
  jobId: string;
  jobTitle: string;
  department: string;
  submittedAt: string;
  status: string;
  skills: string[];
  answers: Record<string, string>;
  questionLabels: Record<string, string>;
  resumeUrl: string | null;
  photoUrl: string | null;
  reviewNote: string | null;
  isSubmitting?: boolean;
};

function statusClass(status: string): string {
  if (status === "SHORTLISTED" || status === "APPROVED") return "career-application-status career-application-status-success";
  if (status === "REJECTED") return "career-application-status career-application-status-error";
  return "career-application-status career-application-status-pending";
}

function ApplicationDetails({ application }: { application: MemberCareerApplication }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const answers = Object.entries(application.answers);

  function closeDialog() {
    dialogRef.current?.close();
    setIsOpen(false);
  }

  return <>
    <button aria-haspopup="dialog" className="button-outline" onClick={() => {
      dialogRef.current?.showModal();
      setIsOpen(true);
    }} type="button">View details</button>
    <dialog aria-labelledby={`career-application-details-${application.id}`} className="career-application-dialog" onClose={() => setIsOpen(false)} ref={dialogRef}>
      <header className="career-application-dialog-header"><div><p className="eyebrow">Application details</p><h2 className="display-font" id={`career-application-details-${application.id}`}>{application.jobTitle}</h2></div><button aria-label="Close application details" className="button-outline" onClick={closeDialog} type="button">Close</button></header>
      {isOpen ? <div className="career-application-dialog-content">
        <p><strong>Department:</strong> {application.department}</p>
        <p><strong>Submitted:</strong> {new Date(application.submittedAt).toLocaleString("en-BD", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" })}</p>
        <p><strong>Status:</strong> <span className={statusClass(application.status)}>{application.status}</span></p>
        {application.skills.length ? <p><strong>Skills:</strong> {application.skills.join(", ")}</p> : null}
        {answers.length ? <section aria-label="Your answers"><h3>Your answers</h3><dl>{answers.map(([questionId, answer]) => <div key={questionId}><dt>{application.questionLabels[questionId] ?? questionId}</dt><dd>{answer || "No answer provided"}</dd></div>)}</dl></section> : null}
        <section aria-label="Submitted files"><h3>Submitted files</h3>
          {application.resumeUrl ? <p><a className="text-link" href={application.resumeUrl} rel="noreferrer" target="_blank">Open submitted CV / resume</a></p> : <p>No CV / resume was submitted.</p>}
          {application.photoUrl ? <div className="career-application-photo"><Image alt="Your submitted applicant photo" height={480} src={application.photoUrl} unoptimized width={360} /></div> : <p>No applicant photo was submitted.</p>}
        </section>
        <section aria-label="Admin review note"><h3>Review note</h3><p>{application.reviewNote || "No review note has been added."}</p></section>
        <Link className="button-outline" href={`/careers/${application.jobId}`}>View job opening</Link>
      </div> : null}
    </dialog>
  </>;
}

export function MemberApplicationHistory({ applications }: { applications: MemberCareerApplication[] }) {
  const { pendingApplications } = useCareerOptimisticApplications();
  const savedJobIds = new Set(applications.map((application) => application.jobId));
  const visibleApplications = [
    ...pendingApplications.filter((application) => !savedJobIds.has(application.jobId)),
    ...applications,
  ];
  if (!visibleApplications.length) return <p className="member-muted careers-empty">You have not submitted any applications yet.</p>;

  return <div className="career-application-history">{visibleApplications.map((application) => <article className="career-application-history-row" key={application.id}>
    <div><p className="eyebrow">{application.department}</p><h2 className="display-font"><Link href={`/careers/${application.jobId}`}>{application.jobTitle}</Link></h2><p>Submitted {new Date(application.submittedAt).toLocaleDateString("en-BD", { dateStyle: "medium", timeZone: "Asia/Dhaka" })}</p></div>
    <span className={statusClass(application.status)}>{application.isSubmitting ? "PENDING (Submitting…)" : application.status}</span>
    <ApplicationDetails application={application} />
  </article>)}</div>;
}