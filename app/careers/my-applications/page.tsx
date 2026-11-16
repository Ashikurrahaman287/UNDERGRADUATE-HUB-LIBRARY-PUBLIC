import type { Metadata } from "next";
import Link from "next/link";
import { MemberApplicationHistory, type MemberCareerApplication } from "@/components/careers/member-application-history";
import { parseJobRequiredFields } from "@/lib/careers";
import { requireMemberSession } from "@/lib/member/session";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My applications | Careers", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function MemberCareerApplicationsPage() {
  const session = await requireMemberSession("/careers/my-applications");
  let history: MemberCareerApplication[] = [];
  let loadError: string | null = null;

  try {
    const { data: rows, error } = await session.supabase.from("job_applications")
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Error fetching job applications:", error);
      loadError = error.message;
    } else {
      const applications = rows ?? [];
      const jobIds = [...new Set(applications.map((application) => application.job_id))];
      const adminSupabase = createAdminSupabaseClient();
      const { data: jobs, error: jobsError } = jobIds.length
        ? await adminSupabase.from("jobs").select("id, title, department, required_fields").in("id", jobIds)
        : { data: [], error: null };
      if (jobsError) console.error("Error fetching job applications:", jobsError);
      const jobsById = new Map((jobs ?? []).map((job) => [job.id, job]));

      history = await Promise.all(applications.map(async (application) => {
        const job = jobsById.get(application.job_id);
        const validBase = `${session.user.id}/${application.job_id}/`;
        const resumePath = application.resume_url;
        const photoPath = application.photo_url;
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
        const fields = parseJobRequiredFields(job?.required_fields);
        const questionLabels = Object.fromEntries(fields.custom_questions.map((question) => [question.id, question.label]));

        return {
          id: application.id,
          jobId: application.job_id,
          jobTitle: job?.title ?? "Job opening",
          department: job?.department ?? "Careers",
          submittedAt: application.created_at,
          status: application.status,
          skills: application.skills,
          answers: application.custom_answers ?? {},
          questionLabels,
          resumeUrl: resume.error ? null : resume.data?.signedUrl ?? null,
          photoUrl: photo.error ? null : photo.data?.signedUrl ?? null,
          reviewNote: application.review_note,
        };
      }));
    }
  } catch (error) {
    console.error("Error fetching job applications:", error);
    loadError = error instanceof Error ? error.message : String(error);
  }

  return <main className="container careers-page career-history-page" id="main-content">
    <header className="member-page-heading careers-heading"><p className="eyebrow">Your activity</p><h1 className="display-font">My Applications</h1><p>Review your application status, submitted answers, and files.</p></header>
    <Link className="text-link career-back-link" href="/careers">Back to open positions</Link>
    {loadError ? <p className="member-form-message member-form-message-error" role="alert">Your applications could not be loaded. Refresh to try again.</p>
      : <MemberApplicationHistory applications={history} />}
  </main>;
}