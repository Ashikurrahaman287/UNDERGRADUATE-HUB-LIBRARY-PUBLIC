import Link from "next/link";
import { requireAdminSession } from "@/lib/admin/session";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  await requireAdminSession();
  const client = createAdminSupabaseClient();
  type CountResult = { count: number | null; error: { message: string } | null };
  type RecentBook = { id: string; slug: string; title: string; author: string; added_at: string };
  type RecentBooksResult = { data: RecentBook[] | null; error: { message: string } | null };

  const [totalBooks, availableBooks, limitedBooks, unavailableBooks, members, pendingApplications, pendingPayments, pendingRentalRequests, activeRentals, overdueRentals, pendingReturns, outstandingFines, activeSubscriptions, expiredSubscriptions, pendingReservations, pendingIdVerifications, recentBooksResult] = await Promise.all([
    client.from("books").select("id", { count: "exact", head: true }).eq("is_active", true) as unknown as Promise<CountResult>,
    client.from("books").select("id", { count: "exact", head: true }).eq("is_active", true).eq("availability", "available") as unknown as Promise<CountResult>,
    client.from("books").select("id", { count: "exact", head: true }).eq("is_active", true).eq("availability", "limited") as unknown as Promise<CountResult>,
    client.from("books").select("id", { count: "exact", head: true }).eq("is_active", true).eq("availability", "unavailable") as unknown as Promise<CountResult>,
    client.from("member_profiles").select("id", { count: "exact", head: true }) as unknown as Promise<CountResult>,
    client.from("membership_applications").select("id", { count: "exact", head: true }).eq("status", "pending") as unknown as Promise<CountResult>,
    client.from("payment_submissions").select("id", { count: "exact", head: true }).eq("status", "pending") as unknown as Promise<CountResult>,
    client.from("rental_requests").select("id", { count: "exact", head: true }).eq("status", "pending") as unknown as Promise<CountResult>,
    client.from("rentals").select("id", { count: "exact", head: true }).eq("status", "active") as unknown as Promise<CountResult>,
    client.from("rentals").select("id", { count: "exact", head: true }).eq("status", "overdue") as unknown as Promise<CountResult>,
    client.from("rentals").select("id", { count: "exact", head: true }).eq("status", "return_requested") as unknown as Promise<CountResult>,
    client.from("fine_ledger").select("id", { count: "exact", head: true }).eq("status", "outstanding") as unknown as Promise<CountResult>,
    client.from("member_subscriptions").select("id", { count: "exact", head: true }).eq("status", "active") as unknown as Promise<CountResult>,
    client.from("member_subscriptions").select("id", { count: "exact", head: true }).eq("status", "expired") as unknown as Promise<CountResult>,
    client.from("reservation_requests").select("id", { count: "exact", head: true }).in("status", ["waiting", "notified"]) as unknown as Promise<CountResult>,
    client.from("member_profiles").select("id", { count: "exact", head: true }).eq("is_id_verified", false).eq("verification_status", "PENDING").not("id_type", "is", null).not("id_number", "is", null).not("id_card_url", "is", null) as unknown as Promise<CountResult>,
    client.from("books").select("id, slug, title, author, added_at").eq("is_active", true).order("added_at", { ascending: false }).limit(5) as unknown as Promise<RecentBooksResult>,
  ]);

  const countResults = [totalBooks, availableBooks, limitedBooks, unavailableBooks, members, pendingApplications, pendingPayments, pendingRentalRequests, activeRentals, overdueRentals, pendingReturns, outstandingFines, activeSubscriptions, expiredSubscriptions, pendingReservations, pendingIdVerifications];
  const hasCountError = countResults.some((result) => result.error);
  const statistic = (result: CountResult) => result.error ? "—" : result.count ?? 0;
  const stats = [
    { label: "Active books", result: totalBooks, href: "/ashik-loves-jannat/books" },
    { label: "Available books", result: availableBooks, href: "/ashik-loves-jannat/books" },
    { label: "Limited availability", result: limitedBooks, href: "/ashik-loves-jannat/books" },
    { label: "Unavailable books", result: unavailableBooks, href: "/ashik-loves-jannat/books" },
    { label: "Registered members", result: members, href: "/ashik-loves-jannat/members" },
    { label: "Pending applications", result: pendingApplications, href: "/ashik-loves-jannat/membership-requests?status=pending" },
    { label: "Pending payments", result: pendingPayments, href: "/ashik-loves-jannat/payments?status=pending" },
    { label: "Pending rental requests", result: pendingRentalRequests, href: "/ashik-loves-jannat/rental-requests?status=pending" },
    { label: "Active rentals", result: activeRentals, href: "/ashik-loves-jannat/rentals?status=active" },
    { label: "Overdue rentals", result: overdueRentals, href: "/ashik-loves-jannat/rentals?status=overdue" },
    { label: "Return requests", result: pendingReturns, href: "/ashik-loves-jannat/rentals?status=return_requested" },
    { label: "Outstanding fine entries", result: outstandingFines, href: "/ashik-loves-jannat/fines?status=outstanding" },
    { label: "Active subscriptions", result: activeSubscriptions, href: "/ashik-loves-jannat/subscriptions?status=active" },
    { label: "Expired subscriptions", result: expiredSubscriptions, href: "/ashik-loves-jannat/subscriptions?status=expired" },
    { label: "Open reservations", result: pendingReservations, href: "/ashik-loves-jannat/reservations?status=open" },
    { label: "ID verification pending", result: pendingIdVerifications, href: "/ashik-loves-jannat/id-verification-pending" },
  ];
  const recentBooks = recentBooksResult.data ?? [];

  return (
    <main className="admin-page">
      <header className="admin-page-header">
        <div><p className="eyebrow">Library management</p><h1 className="display-font">Dashboard</h1></div>
        <Link className="button-primary" href="/ashik-loves-jannat/books/new">+ Add Book</Link>
      </header>
      <section aria-label="Catalogue overview" className="admin-stat-grid">
        {stats.map((stat) => <Link className="admin-stat-card" href={stat.href} key={stat.label}><span>{stat.label}</span><strong>{statistic(stat.result)}</strong></Link>)}
      </section>
      {hasCountError || recentBooksResult.error ? <p className="admin-form-error" role="alert">Some dashboard counts are unavailable. Refresh to try again; unavailable counts are shown as a dash.</p> : null}
      <section className="admin-recent-panel">
        <div className="admin-section-heading"><div><p className="eyebrow">Latest updates</p><h2 className="display-font">Recently Added</h2></div><Link className="text-link" href="/ashik-loves-jannat/books">All books <span aria-hidden="true">→</span></Link></div>
        {recentBooks.length ? <ul className="admin-recent-list">{recentBooks.map((book) => <li key={book.id}>
          <div><strong>{book.title}</strong><span>{book.author}</span></div><time dateTime={book.added_at}>{new Date(book.added_at).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}</time>
        </li>)}</ul> : <p className="admin-empty-note">No books have been added yet.</p>}
      </section>
    </main>
  );
}
