import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CareerBannerImage } from "@/components/careers/career-banner-image";
import { CareerApplicationForm } from "@/components/careers/career-application-form";
import { parseJobRequiredFields } from "@/lib/careers";
import { getMemberSession } from "@/lib/member/session";
import { createPublicSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ jobId: string }> }): Promise<Metadata> {
  const { jobId } = await params;
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(jobId)) return { title: "Career opportunity" };
  const client = await createPublicSupabaseClient();
  const { data } = await client.from("jobs").select("title, department").eq("id", jobId).eq("status", "ACTIVE").maybeSingle();
  return { title: data ? `${data.title} | Careers` : "Career opportunity", description: data?.department };
}

export default async function CareerJobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(jobId)) notFound();

  const client = await createPublicSupabaseClient();
  const { data: job, error } = await client.from("jobs")
    .select("id, title, department, description, image_url, required_fields, created_at")
    .eq("id", jobId)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (error || !job) notFound();

  const session = await getMemberSession();
  let application: { id: string; status: string } | null = null;
  let applicantName = "";
  let applicantEmail = "";
  if (session) {
    const [{ data: submittedApplication }, { data: memberProfile }] = await Promise.all([
      session.supabase.from("job_applications").select("id, status").eq("job_id", job.id).eq("user_id", session.user.id).maybeSingle(),
      session.supabase.from("member_profiles").select("full_name, email").eq("user_id", session.user.id).maybeSingle(),
    ]);
    application = submittedApplication;
    applicantName = memberProfile?.full_name ?? "";
    applicantEmail = memberProfile?.email ?? session.user.email ?? "";
  }

  const requiredFields = parseJobRequiredFields(job.required_fields);
  return <main className="container careers-page career-job-page" id="main-content">
    <Link className="text-link career-back-link" href="/careers">← All careers</Link>
    {job.image_url ? <div className="career-detail-banner"><CareerBannerImage alt="" key={job.image_url} priority sizes="(max-width: 900px) 100vw, 1180px" src={job.image_url} /></div> : null}
    <article className="career-detail-content">
      <header className="member-page-heading"><p className="eyebrow">{job.department}</p><h1 className="display-font">{job.title}</h1></header>
      <div className="career-job-description">{job.description}</div>
      <section aria-labelledby="career-application-heading" className="career-application-section">
        <h2 className="display-font" id="career-application-heading">Application</h2>
        {!session ? <div className="member-panel"><p>Sign in to apply for this position.</p><Link className="button-primary" href={`/member/login?next=${encodeURIComponent(`/careers/${job.id}`)}`}>Sign in to apply</Link></div>
          : application ? <p className="member-form-message member-form-message-success" role="status">Your application is {application.status.toLowerCase()}. You can return to this page to check for updates.</p>
            : <CareerApplicationForm applicantEmail={applicantEmail} applicantName={applicantName} department={job.department} jobId={job.id} jobTitle={job.title} requiredFields={requiredFields} />}
      </section>
    </article>
  </main>;
}