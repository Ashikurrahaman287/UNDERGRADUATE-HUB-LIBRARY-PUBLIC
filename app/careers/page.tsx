import type { Metadata } from "next";
import Link from "next/link";
import { CareerBannerImage } from "@/components/careers/career-banner-image";
import { getMemberSession } from "@/lib/member/session";
import { createPublicSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Careers | Undergraduate Hub Library", description: "Explore current opportunities at Undergraduate Hub Library." };
export const dynamic = "force-dynamic";

export default async function CareersPage() {
  const client = await createPublicSupabaseClient();
  const [{ data: jobs, error }, session] = await Promise.all([client.from("jobs")
    .select("id, title, department, description, image_url, created_at")
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: false }), getMemberSession()]);
  const { data: applications } = session
    ? await session.supabase.from("job_applications").select("job_id").eq("user_id", session.user.id)
    : { data: [] };
  const appliedJobIds = new Set((applications ?? []).map((application) => application.job_id));

  return <main className="container careers-page" id="main-content">
    <header className="member-page-heading careers-heading"><p className="eyebrow">Work with us</p><h1 className="display-font">Careers</h1><p>Join a team making room for more stories, readers, and ideas.</p></header>
    <div className="careers-page-actions"><Link className="button-outline" href="/careers/my-applications">My Applications</Link></div>
    {error ? <p className="member-form-message member-form-message-error" role="alert">Current opportunities could not be loaded. Refresh to try again.</p> : null}
    {!error && jobs?.length ? <div className="career-job-list">{jobs.map((job) => <article className="career-job-card" key={job.id}>
      {job.image_url ? <Link aria-label={`View ${job.title}`} className="career-job-banner" href={`/careers/${job.id}`}><CareerBannerImage alt="" key={job.image_url} sizes="(max-width: 700px) 100vw, 360px" src={job.image_url} /></Link> : null}
      <div className="career-job-card-body"><p className="eyebrow">{job.department}</p><h2 className="display-font"><Link href={`/careers/${job.id}`}>{job.title}</Link></h2><p>{job.description.length > 260 ? `${job.description.slice(0, 257).trimEnd()}…` : job.description}</p>{appliedJobIds.has(job.id) ? <button aria-disabled="true" className="career-applied-badge" disabled type="button">Applied</button> : <Link className="button-primary" href={`/careers/${job.id}`}>View and apply</Link>}</div>
    </article>)}</div> : null}
    {!error && !jobs?.length ? <p className="member-muted careers-empty">There are no open positions right now.</p> : null}
  </main>;
}