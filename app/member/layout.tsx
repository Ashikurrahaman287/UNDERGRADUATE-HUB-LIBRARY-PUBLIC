import { Suspense } from "react";
import Link from "next/link";
import { logoutMember } from "@/app/member/logout/actions";
import { getMemberSession } from "@/lib/member/session";

export const dynamic = "force-dynamic";

async function MemberNavigation() {
  let hasSession = false;
  try {
    hasSession = Boolean(await getMemberSession());
  } catch {
    hasSession = false;
  }

  return (
    <nav aria-label="Member navigation" className="member-navigation">
      {hasSession ? (
        <>
          <Link href="/member/dashboard">Dashboard</Link>
          <Link href="/member/dashboard/my-books">My books</Link>
          <Link href="/member/dashboard/payments">Payments</Link>
          <Link href="/member/apply">Membership</Link>
          <Link href="/member/reservations">Reservations</Link>
          <Link href="/member/notifications">Notifications</Link>
          <Link href="/member/register">Profile</Link>
          <form action={logoutMember}><button type="submit">Sign out</button></form>
        </>
      ) : <Link href="/member/login">Member sign in</Link>}
      <Link className="member-nav-action" href="/books">Find a book <span aria-hidden="true">↗</span></Link>
    </nav>
  );
}

function MemberNavigationFallback() {
  return <nav aria-label="Member navigation" aria-busy="true" className="member-navigation member-navigation-loading"><span /><span /><span /></nav>;
}

export default function MemberLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <div className="member-navigation-band">
        <div className="container member-navigation-inner">
          <div className="member-navigation-brand">
            <span>Undergraduate Hub Library</span>
            <strong>Stories to escape into. Ideas to live by.</strong>
          </div>
          <Suspense fallback={<MemberNavigationFallback />}>
            <MemberNavigation />
          </Suspense>
        </div>
      </div>
      {children}
    </>
  );
}