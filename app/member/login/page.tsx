import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MemberAuthForm } from "@/components/member/member-auth-form";
import { getSafeMemberDestination } from "@/lib/member/redirect";
import { getMemberSession } from "@/lib/member/session";

export const metadata: Metadata = {
  title: "Member Login",
  robots: { index: false, follow: false },
};

export default async function MemberLoginPage({ searchParams }: { searchParams?: Promise<{ next?: string }> }) {
  const params = await searchParams;
  const nextDestination = getSafeMemberDestination(params?.next) ?? undefined;
  const session = await getMemberSession().catch(() => null);

  if (session) {
    const { data: profile, error } = await session.supabase
      .from("member_profiles")
      .select("id")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (!error) {
      const registerDestination = nextDestination ? `/member/register?next=${encodeURIComponent(nextDestination)}` : "/member/register";
      redirect(profile ? nextDestination ?? "/member/dashboard" : registerDestination);
    }
  }

  return (
    <main className="container member-form-page-shell" id="main-content">
      <div className="member-form-narrow member-login-content">
        <p className="eyebrow">Member access</p>
        <h1 className="display-font">Library Member Login</h1>
        <p className="member-login-description">Sign in or create an account with a code sent to your phone or email. Choose either option each time you sign in.</p>
        <MemberAuthForm nextDestination={nextDestination} />
        <p className="member-login-note">New members can complete a profile after sign-in. Borrowing requires an approved membership and a valid Bangladesh phone number.</p>
      </div>
    </main>
  );
}
