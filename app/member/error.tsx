"use client";

import Link from "next/link";

export default function MemberError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="container member-page" id="main-content">
      <p className="eyebrow">Member area</p>
      <h1 className="display-font">Your account could not be loaded</h1>
      <p className="member-muted">The request may have expired or the library service may be temporarily unavailable. Your account data has not been changed.</p>
      <div className="member-form-actions">
        <button className="button-primary" onClick={reset} type="button">Try again</button>
        <Link className="button-outline" href="/member/login">Sign in again</Link>
      </div>
    </main>
  );
}