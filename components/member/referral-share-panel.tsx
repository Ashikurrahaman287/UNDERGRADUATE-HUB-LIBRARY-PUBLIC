"use client";

import { useState, useSyncExternalStore } from "react";

const subscribeToOrigin = () => () => {};
const getClientOrigin = () => window.location.origin;
const getServerOrigin = () => "";

export function ReferralSharePanel({ referralCode, invited, completed, bonusDays, lockedDays }: {
  referralCode: string;
  invited: number;
  completed: number;
  bonusDays: number;
  lockedDays: number;
}) {
  const [copied, setCopied] = useState(false);
  const siteOrigin = useSyncExternalStore(subscribeToOrigin, getClientOrigin, getServerOrigin);
  const referralPath = `/ref/${encodeURIComponent(referralCode)}`;
  const referralLink = `${siteOrigin}${referralPath}`;
  const shareText = `Join me at Undergraduate Hub Library: ${referralLink}`;

  async function copyReferralLink() {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <section aria-labelledby="referral-link-heading" className="referral-invite-card">
        <div className="referral-invite-main">
          <p className="eyebrow">Campus ambassador · personal invitation</p>
          <h2 className="display-font" id="referral-link-heading">Good books travel.<br />Send your invite.</h2>
          <p>Share your link with a friend. When their membership is activated, you each receive a 10-day membership extension.</p>
          <div className="referral-url-row">
            <p className="member-referral-link">{referralLink}</p>
            <button aria-label="Copy referral link" className="button-primary" onClick={copyReferralLink} type="button">{copied ? "Copied" : "Copy link"}</button>
          </div>
          <p aria-live="polite" className="member-field-note">{copied ? "Referral link copied." : ""}</p>
          <div className="referral-share-actions">
            <a className="button-outline" href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} rel="noreferrer" target="_blank"><span aria-hidden="true">↗</span> WhatsApp</a>
            <a className="button-outline" href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(referralLink)}`} rel="noreferrer" target="_blank"><span aria-hidden="true">↗</span> Facebook</a>
          </div>
        </div>
        <aside aria-label="Referral reward" className="referral-reward-callout"><span>For every completed invite</span><strong>+10</strong><span>membership days</span><p>Applied immediately when the member has more than five days left; otherwise locked until renewal.</p></aside>
      </section>
      {lockedDays > 0 ? <p className="member-form-message member-form-message-pending" role="status">Your {lockedDays}-day referral reward is locked and will be automatically applied after your next approved subscription or rental payment.</p> : null}
      <section aria-label="Referral statistics" className="referral-statistics">
        <article><span className="referral-stat-index">01</span><div><span>Friends invited</span><strong>{invited}</strong></div></article>
        <article><span className="referral-stat-index">02</span><div><span>Referrals completed</span><strong>{completed}</strong></div></article>
        <article><span className="referral-stat-index">03</span><div><span>Bonus days gained</span><strong>{bonusDays}</strong></div></article>
      </section>
      <p className="member-field-note">Once your invited friend’s membership is approved, the referral is marked complete. Each reward is applied immediately or held until that member renews, depending on their expiry date.</p>
    </>
  );
}