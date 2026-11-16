import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminSession } from "@/lib/admin/session";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { siteInfo } from "@/lib/site-info";

type Setting = { key: string; value_number: number | null; value_text: string | null; description: string | null };
type SettingsQueryClient = {
  from(table: "library_settings"): {
    select(columns: "key, value_number, value_text, description"): {
      in(column: "key", values: string[]): PromiseLike<{ data: Setting[] | null; error: { message: string } | null }>;
    };
  };
};

export const metadata: Metadata = { title: "Library Settings", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  await requireAdminSession();
  const client = createAdminSupabaseClient() as unknown as SettingsQueryClient;
  const { data: settings, error } = await client.from("library_settings").select("key, value_number, value_text, description").in("key", ["membership_fee_bdt", "fine_per_day_bdt"]);
  const settingsByKey = new Map((settings ?? []).map((setting) => [setting.key, setting]));
  const membershipFee = settingsByKey.get("membership_fee_bdt")?.value_number ?? null;
  const fineRate = settingsByKey.get("fine_per_day_bdt")?.value_number ?? null;

  return (
    <main className="admin-page">
      <header className="admin-page-header"><div><p className="eyebrow">Configured library values</p><h1 className="display-font">Settings</h1></div></header>
      {error ? <p className="admin-form-error" role="alert">Library settings could not be loaded.</p> : null}
      <section className="admin-recent-panel">
        <h2 className="display-font">Financial rules</h2>
        <dl className="admin-setting-list">
          <div><dt>One-time membership activation fee</dt><dd>{membershipFee === null ? "Not configured" : `৳${Number(membershipFee).toLocaleString("en-BD")}`}</dd><p>Separate from subscription plan pricing.</p></div>
          <div><dt>Configured daily fine rate</dt><dd>{fineRate === null ? "Not configured" : `৳${Number(fineRate).toLocaleString("en-BD")} per eligible overdue rental day`}</dd><p>Fine accrual eligibility is determined by the scheduled database function.</p></div>
        </dl>
      </section>
      <section className="admin-recent-panel">
        <h2 className="display-font">Member payment instructions</h2>
        <dl className="admin-setting-list"><div><dt>Method</dt><dd>{siteInfo.paymentMethod}</dd></div><div><dt>Recipient</dt><dd>{siteInfo.paymentNumber}</dd></div></dl>
        <p className="admin-help-note">Payment instructions are fixed site information supplied by the library, not values stored in the current settings schema. Payment approval remains in the existing membership/rental review workflows.</p>
      </section>
      <section className="admin-recent-panel">
        <h2 className="display-font">Library contact</h2>
        <dl className="admin-setting-list"><div><dt>Address</dt><dd>{siteInfo.address}</dd></div><div><dt>Phone numbers</dt><dd>{siteInfo.phoneNumbers.join(" · ")}</dd></div><div><dt>Facebook</dt><dd><a href={siteInfo.facebookUrl} rel="noreferrer" target="_blank">Undergradiate.hub</a></dd></div><div><dt>Instagram</dt><dd><a href={siteInfo.instagramUrl} rel="noreferrer" target="_blank">undergraduatehub_Com</a></dd></div></dl>
      </section>
      <p className="admin-help-note">Values are read-only because there is no dedicated, audited settings-update action. Deployment secrets such as CRON_SECRET, service-role credentials, and admin session secrets are never managed here.</p>
      <p><Link className="text-link" href="/ashik-loves-jannat">Back to dashboard <span aria-hidden="true">→</span></Link></p>
    </main>
  );
}