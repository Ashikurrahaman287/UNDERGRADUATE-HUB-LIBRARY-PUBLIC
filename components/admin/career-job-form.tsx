"use client";

import { useActionState, useState } from "react";
import { ButtonLabel } from "@/components/button-label";
import { createCareerJobAction, updateCareerJobAction, type CareerJobActionState } from "@/app/admin/(protected)/careers/actions";
import { CareerBannerImage } from "@/components/careers/career-banner-image";
import type { CareerQuestionType, JobRequiredFields } from "@/lib/database.types";

const initialState: CareerJobActionState = {};

type CareerJobFormJob = {
  id: string;
  title: string;
  department: string;
  description: string;
  imageUrl: string | null;
  requiredFields: JobRequiredFields;
};

export function CareerJobForm({ job }: { job?: CareerJobFormJob }) {
  const action = job ? updateCareerJobAction : createCareerJobAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [questions, setQuestions] = useState(job?.requiredFields.custom_questions ?? []);
  const [bannerSource, setBannerSource] = useState<"upload" | "url">(job?.imageUrl ? "url" : "upload");

  function updateQuestion(questionId: string, changes: Partial<(typeof questions)[number]>) {
    setQuestions((current) => current.map((question) => question.id === questionId ? { ...question, ...changes } : question));
  }

  return <form action={formAction} className="admin-career-job-form">
    <h2 className="display-font">{job ? "Edit job opening" : "Post an opening"}</h2>
    {job ? <input name="jobId" type="hidden" value={job.id} /> : null}
    <label className="admin-form-field">Job title<input defaultValue={job?.title} maxLength={160} minLength={2} name="title" required /></label>
    <label className="admin-form-field">Department<input defaultValue={job?.department} maxLength={120} minLength={2} name="department" required /></label>
    <label className="admin-form-field">Description<textarea defaultValue={job?.description} maxLength={12000} name="description" placeholder="You can use plain text or Markdown notation." required rows={8} /></label>
    {job?.imageUrl ? <div className="admin-career-current-banner"><CareerBannerImage alt={`${job.title} banner`} sizes="(max-width: 700px) 100vw, 600px" src={job.imageUrl} /></div> : null}
    <fieldset className="admin-career-banner-source">
      <legend>Job banner</legend>
      <input name="bannerSource" type="hidden" value={bannerSource} />
      <div aria-label="Banner source" className="admin-career-banner-options" role="group">
        <button aria-pressed={bannerSource === "upload"} className={bannerSource === "upload" ? "is-selected" : ""} onClick={() => setBannerSource("upload")} type="button">Upload image file</button>
        <button aria-pressed={bannerSource === "url"} className={bannerSource === "url" ? "is-selected" : ""} onClick={() => setBannerSource("url")} type="button">Provide image URL</button>
      </div>
      {bannerSource === "upload" ? <label className="admin-form-field">Upload Image File <span>(optional, JPG/PNG up to 5 MB)</span><input accept="image/jpeg,image/png" name="image" type="file" /></label>
        : <label className="admin-form-field">Provide Image URL <span>(absolute HTTPS image URL)</span><input autoComplete="url" defaultValue={job?.imageUrl ?? ""} maxLength={2048} name="imageUrl" placeholder="https://example.com/banner.jpg" type="url" />
          {job?.imageUrl ? <input name="existingImageUrl" type="hidden" value={job.imageUrl} /> : null}
        </label>}
    </fieldset>
    <fieldset className="admin-career-fields">
      <legend>Applicant fields</legend>
      <label><input defaultChecked={job?.requiredFields.require_resume} name="requireResume" type="checkbox" /> Require CV / resume</label>
      <label><input defaultChecked={job?.requiredFields.require_photo} name="requirePhoto" type="checkbox" /> Require applicant photo</label>
      <label><input defaultChecked={job?.requiredFields.require_skills} name="requireSkills" type="checkbox" /> Require skills</label>
    </fieldset>
    <section aria-labelledby="career-custom-questions-heading" className="admin-career-question-builder">
      <div className="admin-career-question-heading"><div><h3 id="career-custom-questions-heading">Custom questions</h3><p>Up to 10 questions. Multiple-choice questions need 2–10 options.</p></div><button className="button-outline" disabled={questions.length >= 10} onClick={() => setQuestions((current) => [...current, { id: crypto.randomUUID(), label: "", required: true, type: "text", options: [] }])} type="button">+ Add question</button></div>
      <input name="customQuestions" type="hidden" value={JSON.stringify(questions)} />
      {questions.map((question, index) => <fieldset className="admin-career-question" key={question.id}>
        <legend>Question {index + 1}</legend>
        <label className="admin-form-field">Prompt<input maxLength={200} minLength={2} onChange={(event) => updateQuestion(question.id, { label: event.target.value })} value={question.label} /></label>
        <label className="admin-form-field">Answer type<select onChange={(event) => {
          const type = event.target.value as CareerQuestionType;
          updateQuestion(question.id, { type, options: type === "multiple_choice" && question.options.length < 2 ? ["Option 1", "Option 2"] : question.options });
        }} value={question.type}><option value="text">Short text</option><option value="essay">Long answer</option><option value="multiple_choice">Multiple choice</option></select></label>
        {question.type === "multiple_choice" ? <label className="admin-form-field">Options <span>(one per line)</span><textarea maxLength={1200} onChange={(event) => updateQuestion(question.id, { options: event.target.value.split(/\r?\n/) })} rows={4} value={question.options.join("\n")} /></label> : null}
        <label className="admin-career-question-required"><input checked={question.required} onChange={(event) => updateQuestion(question.id, { required: event.target.checked })} type="checkbox" /> Required</label>
        <button className="admin-action-button" onClick={() => setQuestions((current) => current.filter((entry) => entry.id !== question.id))} type="button">Remove question</button>
      </fieldset>)}
    </section>
    {state.error ? <p className="admin-form-error" role="alert">{state.error}</p> : null}
    {state.success ? <p className="admin-form-success" role="status">{state.success}</p> : null}
    <button aria-busy={pending} className="button-primary button-stateful" disabled={pending} type="submit"><ButtonLabel pending={pending} pendingLabel={job ? "Saving…" : "Publishing…"}>{job ? "Save changes" : "Publish opening"}</ButtonLabel></button>
  </form>;
}