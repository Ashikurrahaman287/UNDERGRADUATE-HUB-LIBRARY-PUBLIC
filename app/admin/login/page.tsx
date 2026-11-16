import type { Metadata } from "next";
import Link from "next/link";
import { AdminLoginForm } from "@/components/admin/admin-login-form";
import { BrandLogo } from "@/components/layout/brand-logo";
import { getPendingAdminLoginState } from "@/lib/admin/otp-challenge";

export const metadata: Metadata = {
  title: "Admin Login",
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage() {
  const initialState = await getPendingAdminLoginState();
  return (
    <main className="admin-login-page" id="main-content">
      <section aria-labelledby="admin-login-title" className="admin-login-panel">
        <Link aria-label="Undergraduate Hub Library" className="footer-brand admin-login-brand" href="/">
          <BrandLogo className="footer-logo" sizes="180px" />
        </Link>
        <div className="admin-login-heading">
          <p className="eyebrow">Private access</p>
          <h1 className="display-font" id="admin-login-title">Admin Portal</h1>
          <p>Sign in to manage the library catalogue.</p>
        </div>
        <AdminLoginForm initialState={initialState} />
        <Link className="admin-return-link" href="/">Return to the public library</Link>
      </section>
      <div aria-hidden="true" className="admin-login-aside">
        <span className="eyebrow">Undergraduate Hub Library</span>
        <p className="display-font">A considered collection,<br />kept with care.</p>
      </div>
    </main>
  );
}