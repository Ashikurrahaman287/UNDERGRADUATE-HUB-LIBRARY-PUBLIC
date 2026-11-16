"use client";

export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="admin-page admin-error-page">
      <p className="eyebrow">Admin portal</p>
      <h1 className="display-font">The catalogue could not be loaded.</h1>
      <p>Check that the library database is available, then try again.</p>
      <button className="button-primary" onClick={reset} type="button">Try again</button>
    </main>
  );
}
