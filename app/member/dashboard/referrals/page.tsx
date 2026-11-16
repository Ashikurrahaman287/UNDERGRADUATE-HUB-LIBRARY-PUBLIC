import type { Metadata } from "next";
import Link from "next/link";
import { ReferralSharePanel } from "@/components/member/referral-share-panel";
import { requireMemberSession } from "@/lib/member/session";
import { decryptPiiField } from "@/lib/security/pii";

type QueryResult<T> = { data: T | null; error: { message: string } | null };
type MemberProfile = { id: string; referral_code: string };
type Referral = {
  id: string;
  status: "pending" | "completed";
  bonus_days_awarded: number;
  created_at: string;
  completed_at: string | null;
  referee: { full_name: string; institution_name: string | null } | null;
};
type ReferralQuery = {
  eq(column: "referrer_id", value: string): {
    order(column: "created_at", options: { ascending: boolean }): PromiseLike<QueryResult<Referral[]>>;
  };
};
type ReferralClient = {
  from(table: "referrals"): { select(columns: string): ReferralQuery };
};
type ReferralReward = { id: string; referral_id: string; bonus_days_awarded: number; status: "locked" | "claimed"; locked_at: string | null; claimed_at: string | null; created_at: string };
type ReferralRewardQuery = {
  eq(column: "member_id", value: string): {
    order(column: "created_at", options: { ascending: boolean }): PromiseLike<QueryResult<ReferralReward[]>>;
  };
};
type ReferralRewardClient = {
  from(table: "referral_rewards"): { select(columns: string): ReferralRewardQuery };
};

export const metadata: Metadata = { title: "Refer & Earn", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

function maskedFriend(referee: Referral["referee"]): string {
  if (!referee?.full_name) return "Library member";
  const [firstName, secondName] = referee.full_name.trim().split(/\s+/);
  const maskedName = secondName ? `${firstName} ${secondName[0].toUpperCase()}.` : firstName;
  const institution = decryptPiiField(referee.institution_name, "institution_name")?.trim();
  const institutionLabel = institution
    ? institution.split(/\s+/).map((word) => word[0]).join("").toUpperCase().slice(0, 5)
    : "";
  return institutionLabel ? `${maskedName} - ${institutionLabel}` : maskedName;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-BD", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dhaka" });
}

export default async function MemberReferralsPage() {
  const session = await requireMemberSession("/member/dashboard/referrals");
  const client = session.supabase;
  const { data: profile, error: profileError } = await (client.from("member_profiles")
    .select("id, referral_code")
    .eq("user_id", session.user.id)
    .maybeSingle() as unknown as Promise<QueryResult<MemberProfile>>);

  if (profileError || !profile) {
    return <main className="container member-page" id="main-content"><p className="member-form-message member-form-message-error" role="alert">Your referral link could not be loaded.</p></main>;
  }

  const referralClient = client as unknown as ReferralClient;
  const { data: referrals, error } = await referralClient.from("referrals")
    .select("id, status, bonus_days_awarded, created_at, completed_at, referee:member_profiles!referrals_referee_id_fkey(full_name, institution_name)")
    .eq("referrer_id", profile.id)
    .order("created_at", { ascending: false });
  const { data: rewards, error: rewardsError } = await (client as unknown as ReferralRewardClient)
    .from("referral_rewards")
    .select("id, referral_id, bonus_days_awarded, status, locked_at, claimed_at, created_at")
    .eq("member_id", profile.id)
    .order("created_at", { ascending: false });
  const rows = referrals ?? [];
  const rewardRows = rewards ?? [];
  const completed = rows.filter((referral) => referral.status === "completed");
  const rewardsByReferral = new Map(rewardRows.map((reward) => [reward.referral_id, reward]));
  const bonusDays = rewardRows.filter((reward) => reward.status === "claimed")
    .reduce((total, reward) => total + Number(reward.bonus_days_awarded), 0);
  const lockedDays = rewardRows.filter((reward) => reward.status === "locked")
    .reduce((total, reward) => total + Number(reward.bonus_days_awarded), 0);

  return (
    <main className="container member-page" id="main-content">
      <header className="member-page-heading"><p className="eyebrow">Member area</p><h1 className="display-font">Refer &amp; Earn</h1><p>Invite a friend and grow your reading community.</p></header>
      <nav aria-label="Member dashboard pages" className="member-dashboard-tabs">
        <Link href="/member/dashboard/my-books">My Rented Books</Link>
        <Link href="/member/dashboard/payments">Payments &amp; Subscription</Link>
        <Link aria-current="page" href="/member/dashboard/referrals">Refer &amp; Earn</Link>
        <Link href="/member/dashboard">Dashboard</Link>
      </nav>
      {error || rewardsError ? <p className="member-form-message member-form-message-error" role="alert">Referral statistics could not be loaded.</p> : null}
      <ReferralSharePanel referralCode={profile.referral_code} invited={rows.length} completed={completed.length} bonusDays={bonusDays} lockedDays={lockedDays} />
      <section aria-labelledby="referral-history-heading" className="member-library-section referral-history-section">
        <div className="member-section-heading"><div><p className="eyebrow">Your invitations</p><h2 className="display-font" id="referral-history-heading">Invite History</h2></div><span className="member-count-badge">{rows.length}</span></div>
        {error || rewardsError ? null : rows.length ? <div className="member-history-table-wrap"><table className="member-history-table"><thead><tr><th>Friend</th><th>Status</th><th>Date</th></tr></thead><tbody>{rows.map((referral) => {
          const reward = rewardsByReferral.get(referral.id);
          const isClaimed = reward?.status === "claimed";
          const isLocked = reward?.status === "locked";
          const label = referral.status === "pending" ? "Pending Membership Approval"
            : isLocked ? "10-Day Reward Locked"
              : isClaimed ? "10 Days Added" : "Completed";
          return <tr key={referral.id}><td>{maskedFriend(referral.referee)}</td><td><span className={`member-status ${isClaimed ? "member-status-positive" : "member-status-pending"}`}>{label}</span></td><td>{formatDate(reward?.claimed_at ?? reward?.locked_at ?? referral.completed_at ?? referral.created_at)}</td></tr>;
        })}</tbody></table></div> : <p className="member-muted">Your invited friends will appear here after they complete their member profile.</p>}
      </section>
      {rewardRows.length ? <section aria-labelledby="referral-reward-history-heading" className="member-library-section">
        <div className="member-section-heading"><div><p className="eyebrow">Your rewards</p><h2 className="display-font" id="referral-reward-history-heading">Membership day extensions</h2></div></div>
        <ul className="member-record-list">{rewardRows.map((reward) => <li key={reward.id}><div><strong>{reward.bonus_days_awarded} referral days</strong><span>{reward.status === "locked" ? "Apply after your next approved subscription payment" : `Applied ${formatDate(reward.claimed_at ?? reward.created_at)}`}</span></div><span className={`member-status ${reward.status === "claimed" ? "member-status-positive" : "member-status-pending"}`}>{reward.status === "claimed" ? "Claimed" : "Locked"}</span></li>)}</ul>
      </section> : null}
    </main>
  );
}