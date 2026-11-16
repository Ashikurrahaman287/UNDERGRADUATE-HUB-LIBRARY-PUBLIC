export default function AdminLoading() {
  return (
    <main aria-busy="true" className="admin-page admin-route-loading">
      <span className="sr-only" role="status">Loading admin page</span>
      <div aria-hidden="true" className="admin-loading-lines"><span /><span /><span /></div>
      <div aria-hidden="true" className="admin-loading-table"><span /><span /><span /><span /></div>
    </main>
  );
}