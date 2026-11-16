"use client";

import Link from "next/link";

export default function PublicError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="site-error-page container" id="main-content">
      <p className="eyebrow">A brief pause</p>
      <h1 className="display-font">The library is taking a moment.</h1>
      <p>We could not load this part of the collection. Please try again shortly.</p>
      <div><button className="button-outline" onClick={reset} type="button">Try again</button><Link className="text-link" href="/">Back to the library <span aria-hidden="true">→</span></Link></div>
    </main>
  );
}
