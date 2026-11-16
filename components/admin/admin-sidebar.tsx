"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logoutAdmin } from "@/app/admin/(protected)/actions";
import { BrandLogo } from "@/components/layout/brand-logo";

const links = [
  { href: "/ashik-loves-jannat", label: "Dashboard" },
  { href: "/ashik-loves-jannat/books", label: "Books" },
  { href: "/ashik-loves-jannat/careers", label: "Careers" },
  { href: "/ashik-loves-jannat/categories", label: "Categories" },
  { href: "/ashik-loves-jannat/members", label: "Members" },
  { href: "/ashik-loves-jannat/approved-members", label: "Approved Members" },
  { href: "/ashik-loves-jannat/manual-approved-members", label: "Manual Approved Members" },
  { href: "/ashik-loves-jannat/id-verification-pending", label: "ID Verification Pending" },
  { href: "/ashik-loves-jannat/membership-requests", label: "Membership Requests" },
  { href: "/ashik-loves-jannat/subscription-plans", label: "Subscription Plans" },
  { href: "/ashik-loves-jannat/subscriptions", label: "Subscriptions" },
  { href: "/ashik-loves-jannat/payments", label: "Payments" },
  { href: "/ashik-loves-jannat/rental-requests", label: "Rental Requests" },
  { href: "/ashik-loves-jannat/rentals", label: "Issued Rentals" },
  { href: "/ashik-loves-jannat/reservations", label: "Reservations" },
  { href: "/ashik-loves-jannat/fines", label: "Fine Ledger" },
  { href: "/ashik-loves-jannat/finances", label: "Finance" },
  { href: "/ashik-loves-jannat/audit", label: "Audit" },
  { href: "/ashik-loves-jannat/notifications", label: "Notifications" },
  { href: "/ashik-loves-jannat/settings", label: "Settings" },
];

export function AdminSidebar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  return (
    <aside className="admin-sidebar">
      <Link className="admin-brand" href="/ashik-loves-jannat" aria-label="Undergraduate Hub Library admin dashboard">
        <BrandLogo className="admin-brand-logo" sizes="(max-width: 700px) 80px, 200px" />
      </Link>
      <button aria-controls="admin-navigation" aria-expanded={menuOpen} aria-label={menuOpen ? "Close admin navigation" : "Open admin navigation"} className="admin-menu-toggle" onClick={() => setMenuOpen(!menuOpen)} type="button">
        <span /><span />
      </button>
      <nav aria-label="Admin navigation" className={menuOpen ? "admin-navigation is-open" : "admin-navigation"} id="admin-navigation">
        {links.map((link) => {
          const active = link.href === "/ashik-loves-jannat" ? pathname === link.href : pathname === link.href || pathname.startsWith(`${link.href}/`);
          return <Link aria-current={active ? "page" : undefined} href={link.href} key={link.href} onClick={() => setMenuOpen(false)}>{link.label}<span aria-hidden="true">→</span></Link>;
        })}
        <form action={logoutAdmin} className="admin-logout-form"><button type="submit">Logout <span aria-hidden="true">↗</span></button></form>
      </nav>
    </aside>
  );
}
