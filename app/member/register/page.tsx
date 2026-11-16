import type { Metadata } from "next";
import { MemberProfileForm } from "@/components/member/member-profile-form";
import { getSafeMemberDestination } from "@/lib/member/redirect";
import { isPhoneAuthUser, requireMemberSession } from "@/lib/member/session";
import { decryptPiiField } from "@/lib/security/pii";

type ProfileQueryClient = {
  from(table: "member_profiles"): {
    select(columns: "full_name, phone, email, address, avatar_url, id_card_url, is_id_verified, verification_status"): {
      eq(column: "user_id", value: string): {
        maybeSingle(): PromiseLike<{ data: { full_name: string; phone: string; email: string | null; address: string | null; avatar_url: string | null; id_card_url: string | null; is_id_verified: boolean; verification_status: "PENDING" | "APPROVED" | "REJECTED" } | null; error: { message: string } | null }>;
      };
    };
  };
};

export const metadata: Metadata = {
  title: "Create Account",
  robots: { index: false, follow: false },
};

export default async function MemberRegisterPage({ searchParams }: { searchParams?: Promise<{ next?: string }> }) {
  const session = await requireMemberSession("/member/register");
  const params = await searchParams;
  const nextDestination = getSafeMemberDestination(params?.next) ?? undefined;
  const client = session.supabase as unknown as ProfileQueryClient;
  const { data: profile, error } = await client
    .from("member_profiles")
    .select("full_name, phone, email, address, avatar_url, id_card_url, is_id_verified, verification_status")
    .eq("user_id", session.user.id)
    .maybeSingle();
  const phoneAuthRequired = isPhoneAuthUser(session.user);

  return (
    <main className="container member-form-page-shell" id="main-content">
      <div className="member-form-narrow member-register-content">
        <p className="eyebrow">Create account</p>
        <h1 className="display-font">{profile ? "Your member profile" : "Complete your member profile"}</h1>
        {error ? <p className="member-form-message member-form-message-error" role="alert">Your profile could not be loaded. Refresh to try again.</p> : null}
        {!error ? <MemberProfileForm
          address={decryptPiiField(profile?.address ?? null, "address") ?? undefined}
          avatarUrl={profile?.avatar_url}
          email={profile?.email ?? session.user.email}
          fullName={profile?.full_name}
          identityVerified={Boolean(profile?.is_id_verified || profile?.verification_status === "APPROVED")}
          identityLocked={Boolean(profile?.is_id_verified || profile?.verification_status === "APPROVED" || (profile?.verification_status === "PENDING" && profile.id_card_url))}
          nextDestination={nextDestination}
          phone={phoneAuthRequired ? session.user.phone ?? "" : profile?.phone ?? ""}
          phoneAuthRequired={phoneAuthRequired}
        /> : null}
      </div>
    </main>
  );
}
