import type { Metadata } from "next";
import Link from "next/link";
import { CareerJobStatusControl } from "@/components/admin/career-job-status-control";
import { CareerJobForm } from "@/components/admin/career-job-form";
import { requireAdminSession } from "@/lib/admin/session";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Careers", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminCareersPage({ searchParams }: { searchParams?: Promise<{ status?: string }> }) {
  await requireAdminSession();
  const params = await searchParams;
  const { data: jobs, error } = await createAdminSupabaseClient().from("jobs")
    .select("id, title, department, status, created_at")
    .order("created_at", { ascending: false });

  return <main className="admin-page admin-careers-page">
    <header className="admin-page-header"><div><p className="eyebrow">People &amp; opportunities</p><h1 className="display-font">Careers</h1></div><Link className="button-outline" href="/careers">Public careers page</Link></header>
    {params?.status === "updated" ? <p className="admin-flash-success" role="status">Job status updated.</p> : null}
    {params?.status === "error" ? <p className="admin-form-error" role="alert">Job status could not be updated.</p> : null}
    {error ? <p className="admin-form-error" role="alert">Job postings could not be loaded.</p> : null}
    <div className="admin-careers-layout">
      <CareerJobForm />
      <section aria-labelledby="career-openings-heading" className="admin-recent-panel admin-career-openings">
        <div className="admin-section-heading"><div><p className="eyebrow">Postings and responses</p><h2 className="display-font" id="career-openings-heading">Job openings</h2></div></div>
        {jobs?.length ? <div className="admin-table-wrap"><table className="admin-books-table"><thead><tr><th>Title</th><th>Department</th><th>Status</th><th>Posted</th><th>Actions</th></tr></thead><tbody>{jobs.map((job) => <tr key={job.id}>
          <td><strong>{job.title}</strong></td>
          <td>{job.department}</td>
          <td><CareerJobStatusControl jobId={job.id} status={job.status} /></td>
          <td>{new Date(job.created_at).toLocaleDateString("en-BD", { dateStyle: "medium", timeZone: "Asia/Dhaka" })}</td>
          <td className="admin-career-actions"><Link className="admin-action-button" href={`/ashik-loves-jannat/careers/${job.id}`}>Applications</Link><Link className="admin-action-button" href={`/ashik-loves-jannat/careers/${job.id}#career-job-edit-heading`}>Edit</Link></td>
        </tr>)}</tbody></table></div> : !error ? <p className="admin-empty-note">No career postings yet.</p> : null}
      </section>
    </div>
  </main>;
}