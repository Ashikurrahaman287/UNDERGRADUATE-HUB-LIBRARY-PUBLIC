"use client";

import Image from "next/image";
import { useRef, useState } from "react";

export type CareerApplicationAnswer = { id: string; label: string; value: string };

export function CareerApplicationResponseDialog({ applicationId, applicantName, skills, answers, resumeUrl, photoUrl }: {
  applicationId: string;
  applicantName: string;
  skills: string[];
  answers: CareerApplicationAnswer[];
  resumeUrl: string | null;
  photoUrl: string | null;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  function closeDialog() {
    dialogRef.current?.close();
    setIsOpen(false);
  }

  return <>
    <button aria-haspopup="dialog" className="admin-action-button" onClick={() => {
      dialogRef.current?.showModal();
      setIsOpen(true);
    }} type="button">View responses</button>
    <dialog aria-labelledby={`career-response-${applicationId}`} className="career-admin-response-dialog" onClose={() => setIsOpen(false)} ref={dialogRef}>
      <header><div><p className="eyebrow">Candidate responses</p><h2 className="display-font" id={`career-response-${applicationId}`}>{applicantName}</h2></div><button aria-label="Close candidate responses" className="admin-action-button" onClick={closeDialog} type="button">Close</button></header>
      {isOpen ? <div className="career-admin-response-content">
        <section><h3>Skills</h3><p>{skills.length ? skills.join(", ") : "No skills listed."}</p></section>
        <section><h3>Custom answers</h3>{answers.length ? <dl>{answers.map((answer) => <div key={answer.id}><dt>{answer.label}</dt><dd>{answer.value || "No answer provided"}</dd></div>)}</dl> : <p>No custom answers were submitted.</p>}</section>
        <section><h3>Submitted files</h3>
          {resumeUrl ? <p><a href={resumeUrl} rel="noreferrer" target="_blank">Open CV / resume</a></p> : <p>No resume submitted.</p>}
          {photoUrl ? <Image alt={`${applicantName}'s submitted photo`} className="career-admin-response-photo" height={480} src={photoUrl} unoptimized width={360} /> : <p>No photo submitted.</p>}
        </section>
      </div> : null}
    </dialog>
  </>;
}