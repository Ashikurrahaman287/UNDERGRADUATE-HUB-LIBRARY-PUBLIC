export default function MemberLoading() {
  return (
    <main className="container member-page" id="main-content" aria-busy="true">
      <p className="eyebrow">Member area</p>
      <h1 className="display-font">Loading your library account</h1>
      <p className="member-muted">Your private account details are being retrieved.</p>
      <div className="member-loading-lines" aria-hidden="true"><span /><span /><span /></div>
    </main>
  );
}