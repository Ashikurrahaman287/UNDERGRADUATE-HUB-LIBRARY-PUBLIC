import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminSubmitButton } from "@/components/admin/admin-submit-button";
import { CareerJobForm } from "@/components/admin/career-job-form";
import { CareerApplicationResponseDialog } from "@/components/admin/career-application-response-dialog";
import { CareerApplicationStatusControl } from "@/components/admin/career-application-status-control";
import { updateCareerApplicationReviewNoteAction } from "@/app/admin/(protected)/careers/actions";
import { parseJobRequiredFields } from "@/lib/careers";
import { requireAdminSession } from "@/lib/admin/session";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Career applications", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

function validId(id: string): boolean {
  return /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id);
}

async function queryWithLogging<T>(query: PromiseLike<{ data: T; error: unknown | null }>): Promise<{ data: T | null; error: unknown | null }> {
  try {
    const result = await query;
    return { data: result.data, error: result.error };
  } catch (error) {
    console.error("Error fetching job applications:", error);
    return { data: null, error };
  }
}

export default async function AdminCareerApplicationsPage({ params, searchParams }: {
  params: Promise<{ jobId: string }>;
  searchParams?: Promise<{ review?: string }>;
}) {
  await requireAdminSession();
  const { jobId } = await params;
  const query = await searchParams;
  if (!validId(jobId)) notFound();
  const adminSupabase = createAdminSupabaseClient();
  const [jobQuery, applicationsQuery] = await Promise.all([
    queryWithLogging(adminSupabase.from("jobs").select("id, title, department, description, image_url, required_fields, status, created_at").eq("id", jobId).maybeSingle()),
    queryWithLogging(adminSupabase.from("job_applications").select("*").eq("job_id", jobId).order("created_at", { ascending: false })),
  ]);
  const job = jobQuery.data;
  const applications = applicationsQuery.data;
  const jobError = jobQuery.error;
  const applicationsError = applicationsQuery.error;
  if (jobError) console.error("Error fetching job applications:", jobError);
  if (applicationsError) console.error("Error fetching job applications:", applicationsError);
  if (!job) notFound();
  const fields = parseJobRequiredFields(job.required_fields);
  const applicantRows = applications ?? [];
  const signedFiles = new Map<string, { resume: string | null; photo: string | null }>();
  await Promise.all(applicantRows.map(async (application) => {
    const resumePath = application.resume_url;
    const photoPath = application.photo_url;
    const validBase = `${application.user_id}/${job.id}/`;
    let resumeUrl: string | null = null;
    let photoUrl: string | null = null;
    try {
      const [resume, photo] = await Promise.all([
        resumePath && resumePath.startsWith(validBase) && !resumePath.includes("..")
          ? adminSupabase.storage.from("career-submissions").createSignedUrl(resumePath, 3600)
          : Promise.resolve({ data: null, error: null }),
        photoPath && photoPath.startsWith(validBase) && !photoPath.includes("..")
          ? adminSupabase.storage.from("career-submissions").createSignedUrl(photoPath, 3600)
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (resume.error) console.error("Error fetching job applications:", resume.error);
      if (photo.error) console.error("Error fetching job applications:", photo.error);
      resumeUrl = resume.error ? null : resume.data?.signedUrl ?? null;
      photoUrl = photo.error ? null : photo.data?.signedUrl ?? null;
    } catch (error) {
      console.error("Error fetching job applications:", error);
    }
    signedFiles.set(application.id, {
      resume: resumeUrl,
      photo: photoUrl,
    });
  }));

  return <main className="admin-page admin-career-applications-page">
    <header className="admin-page-header"><div><p className="eyebrow">{job.department} · {job.status}</p><h1 className="display-font">{job.title}</h1></div><Link className="admin-action-button" href="/ashik-loves-jannat/careers">Back to careers</Link></header>
    {query?.review === "updated" ? <p className="admin-flash-success" role="status">Application status updated.</p> : null}
    {query?.review === "error" ? <p className="admin-form-error" role="alert">Application status could not be updated.</p> : null}
    {query?.review === "note-updated" ? <p className="admin-flash-success" role="status">Applicant review note saved.</p> : null}
    {query?.review === "note-error" ? <p className="admin-form-error" role="alert">Applicant review note could not be saved.</p> : null}
    {applicationsError ? <p className="admin-form-error" role="alert">Applications could not be loaded.</p> : null}
    <section aria-labelledby="career-job-edit-heading" className="admin-career-edit-section"><h2 className="display-font" id="career-job-edit-heading">Edit job posting</h2><CareerJobForm job={{ id: job.id, title: job.title, department: job.department, description: job.description, imageUrl: job.image_url, requiredFields: fields }} /></section>
    <section aria-labelledby="career-description-heading" className="admin-recent-panel"><h2 className="display-font" id="career-description-heading">Description</h2><p className="career-job-description">{job.description}</p><p className="admin-help-note">Application fields: {fields.require_resume ? "Resume · " : ""}{fields.require_photo ? "Photo · " : ""}{fields.require_skills ? "Skills · " : ""}{fields.custom_questions.length} custom question(s)</p></section>
    <section aria-labelledby="career-applicants-heading" className="admin-recent-panel"><div className="admin-section-heading"><div><p className="eyebrow">Candidate responses</p><h2 className="display-font" id="career-applicants-heading">Applications ({applicantRows.length})</h2></div></div>
      {applicantRows.length ? <div className="admin-table-wrap"><table className="admin-books-table admin-career-applicants"><thead><tr><th>Applicant</th><th>Responses</th><th>Submitted</th><th>Status</th><th>Applicant note</th></tr></thead><tbody>{applicantRows.map((application) => {
        const files = signedFiles.get(application.id);
        const answers = application.custom_answers && typeof application.custom_answers === "object"
          ? Object.entries(application.custom_answers).map(([questionId, answer]) => ({
            id: questionId,
            label: fields.custom_questions.find((question) => question.id === questionId)?.label ?? questionId,
            value: typeof answer === "string" ? answer : JSON.stringify(answer),
          }))
          : [];
        return <tr key={application.id}>
          <td><strong>{application.applicant_name}</strong><a href={`mailto:${application.applicant_email}`}>{application.applicant_email}</a></td>
          <td><CareerApplicationResponseDialog applicationId={application.id} applicantName={application.applicant_name} answers={answers} photoUrl={files?.photo ?? null} resumeUrl={files?.resume ?? null} skills={application.skills} /></td>
          <td>{new Date(application.created_at).toLocaleString("en-BD", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" })}</td>
          <td><CareerApplicationStatusControl applicantName={application.applicant_name} applicationId={application.id} jobId={job.id} status={application.status} /></td>
          <td><form action={updateCareerApplicationReviewNoteAction} className="career-review-note-form"><input name="applicationId" type="hidden" value={application.id} /><input name="jobId" type="hidden" value={job.id} /><textarea aria-label={`Review note for ${application.applicant_name}`} maxLength={2000} name="reviewNote" defaultValue={application.review_note ?? ""} rows={3} /><AdminSubmitButton className="admin-action-button" pendingLabel="Saving…">Save note</AdminSubmitButton></form></td>
        </tr>;
      })}</tbody></table></div> : !applicationsError ? <p className="admin-empty-note">No applications have been submitted for this opening yet.</p> : null}
    </section>
  </main>;
}