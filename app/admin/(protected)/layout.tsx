import { Suspense } from "react";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { requireAdminSession } from "@/lib/admin/session";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

async function ProtectedAdminShell({ children }: { children: ReactNode }) {
  await requireAdminSession();

  return (
    <div className="admin-shell">
      <AdminSidebar />
      <div className="admin-content" id="main-content">{children}</div>
    </div>
  );
}

function ProtectedAdminLoading() {
  return (
    <div aria-busy="true" className="admin-shell">
      <aside aria-hidden="true" className="admin-sidebar admin-sidebar-loading"><span /><span /><span /></aside>
      <main className="admin-content admin-page admin-route-loading"><span className="sr-only" role="status">Loading admin workspace</span><div aria-hidden="true" className="admin-loading-lines"><span /><span /><span /></div></main>
    </div>
  );
}

export default function ProtectedAdminLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<ProtectedAdminLoading />}><ProtectedAdminShell>{children}</ProtectedAdminShell></Suspense>;
}
