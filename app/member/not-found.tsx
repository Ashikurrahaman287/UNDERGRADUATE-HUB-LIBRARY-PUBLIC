import Link from "next/link";

export default function MemberNotFound() {
  return (
    <main className="container member-page" id="main-content">
      <p className="eyebrow">Member area</p>
      <h1 className="display-font">This member page is unavailable</h1>
      <p className="member-muted">The page may have moved, or the requested record may no longer be available.</p>
      <div className="member-form-actions">
        <Link className="button-primary" href="/member/dashboard">Member dashboard</Link>
        <Link className="button-outline" href="/books">Browse the public catalogue</Link>
      </div>
    </main>
  );
}