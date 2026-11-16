"use client";

import Link from "next/link";
import { useActionState, useOptimistic, useState } from "react";
import { MemberSubmitButton } from "@/components/member/member-submit-button";
import { useCareerOptimisticApplications } from "@/components/careers/career-optimistic-applications";
import { submitCareerApplicationAction, type CareerApplicationState } from "@/app/careers/actions";
import type { JobRequiredFields } from "@/lib/database.types";

const initialState: CareerApplicationState = {};

export function CareerApplicationForm({ jobId, jobTitle, department, requiredFields, applicantName, applicantEmail }: {
  jobId: string;
  jobTitle: string;
  department: string;
  requiredFields: JobRequiredFields;
  applicantName: string;
  applicantEmail: string;
}) {
  const { addPendingApplication, removePendingApplication } = useCareerOptimisticApplications();
  const [submitted, setSubmitted] = useState(false);
  const [optimisticSubmitted, setOptimisticSubmitted] = useOptimistic(submitted, () => true);
  const [state, formAction, pending] = useActionState(async (previousState: CareerApplicationState, formData: FormData) => {
    const optimisticId = `optimistic-${jobId}`;
    const answers = Object.fromEntries(requiredFields.custom_questions.map((question) => [question.id, (formData.get(`answer:${question.id}`) ?? "").toString()]));
    const skills = [...new Set((formData.get("skills") ?? "").toString().split(",").map((skill) => skill.trim()).filter(Boolean))];
    addPendingApplication({
      id: optimisticId,
      jobId,
      jobTitle,
      department,
      submittedAt: new Date().toISOString(),
      status: "PENDING",
      isSubmitting: true,
      skills,
      answers,
      questionLabels: Object.fromEntries(requiredFields.custom_questions.map((question) => [question.id, question.label])),
      resumeUrl: null,
      photoUrl: null,
      reviewNote: null,
    });
    setOptimisticSubmitted(true);
    try {
      const result = await submitCareerApplicationAction(previousState, formData);
      if (result.success) setSubmitted(true);
      else removePendingApplication(optimisticId);
      return result;
    } catch {
      removePendingApplication(optimisticId);
      return { error: "Your application could not be submitted. Try again." };
    }
  }, initialState);

  if (state.success) {
    return <div className="member-form-message member-form-message-success" role="status"><p>{state.success}</p><p><span className="career-application-status career-application-status-pending">PENDING</span></p><Link className="text-link" href="/careers/my-applications">View My Applications <span aria-hidden="true">→</span></Link></div>;
  }

  return <form action={formAction} className="member-form career-application-form">
    <input name="jobId" type="hidden" value={jobId} />
    {optimisticSubmitted && pending ? <p className="career-application-status career-application-status-pending career-submitting-status" role="status">PENDING (Submitting…) · <Link href="/careers/my-applications">View applications</Link></p> : null}
    <label htmlFor="career-applicant-name">Full name</label>
    <input autoComplete="name" defaultValue={applicantName} id="career-applicant-name" maxLength={120} minLength={2} name="applicantName" required />
    <label htmlFor="career-applicant-email">Email</label>
    <input autoComplete="email" defaultValue={applicantEmail} id="career-applicant-email" maxLength={254} name="applicantEmail" required type="email" />

    {requiredFields.require_resume ? <>
      <label htmlFor="career-resume">Resume / CV</label>
      <input accept="application/pdf,.pdf" id="career-resume" name="resume" required type="file" />
      <p className="member-field-note">PDF, up to 5 MB.</p>
    </> : <>
      <label htmlFor="career-resume">Resume / CV <span>(optional)</span></label>
      <input accept="application/pdf,.pdf" id="career-resume" name="resume" type="file" />
    </>}

    {requiredFields.require_photo ? <>
      <label htmlFor="career-photo">Applicant photo</label>
      <input accept="image/jpeg,image/png" id="career-photo" name="photo" required type="file" />
      <p className="member-field-note">JPG or PNG, up to 5 MB.</p>
    </> : <>
      <label htmlFor="career-photo">Applicant photo <span>(optional)</span></label>
      <input accept="image/jpeg,image/png" id="career-photo" name="photo" type="file" />
    </>}

    {requiredFields.require_skills ? <>
      <label htmlFor="career-skills">Skills</label>
      <input autoComplete="off" id="career-skills" maxLength={1600} name="skills" placeholder="Separate skills with commas" required />
    </> : <>
      <label htmlFor="career-skills">Skills <span>(optional)</span></label>
      <input autoComplete="off" id="career-skills" maxLength={1600} name="skills" placeholder="Separate skills with commas" />
    </>}

    {requiredFields.custom_questions.map((question) => (
      <label key={question.id} htmlFor={`career-${question.id}`}>
        {question.label}{question.required ? null : <span> (optional)</span>}
        {question.type === "multiple_choice" ? <select defaultValue="" id={`career-${question.id}`} name={`answer:${question.id}`} required={question.required}>
          <option disabled value="">Choose an answer</option>
          {question.options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select> : question.type === "essay" ? <textarea autoComplete="off" id={`career-${question.id}`} maxLength={2000} name={`answer:${question.id}`} required={question.required} rows={5} />
          : <input autoComplete="off" id={`career-${question.id}`} maxLength={2000} name={`answer:${question.id}`} required={question.required} type="text" />}
      </label>
    ))}

    {state.error ? <p className="member-form-message member-form-message-error" role="alert">{state.error}</p> : null}
    <MemberSubmitButton pendingLabel="Submitting application…">Submit application</MemberSubmitButton>
  </form>;
}