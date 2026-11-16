import { redirect } from "next/navigation";
import { getMemberSession } from "@/lib/member/session";

export default async function MemberLandingPage() {
  const session = await getMemberSession().catch(() => null);
  if (!session) redirect("/member/login");

  const { data: profile, error } = await session.supabase
    .from("member_profiles")
    .select("id")
    .eq("user_id", session.user.id)
    .maybeSingle();

  redirect(error ? "/member/dashboard" : profile ? "/member/dashboard" : "/member/register");
}
