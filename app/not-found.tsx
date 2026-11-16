import Link from "next/link";

export default function NotFound() {
  return (
    <main className="not-found-page container" id="main-content">
      <p className="eyebrow">Not on this shelf</p>
      <h1 className="display-font">We couldn&apos;t find that book.</h1>
      <p>The link may be out of date, or this title may have moved.</p>
      <Link className="button-primary" href="/books">Back to the Library <span aria-hidden="true">→</span></Link>
    </main>
  );
}