export default function RouteLoading() {
  return (
    <main aria-busy="true" className="container route-loading" id="main-content">
      <span className="sr-only" role="status">Loading page</span>
      <div aria-hidden="true" className="route-loading-copy">
        <span className="route-skeleton route-skeleton-eyebrow" />
        <span className="route-skeleton route-skeleton-title" />
        <span className="route-skeleton route-skeleton-line" />
      </div>
      <div aria-hidden="true" className="route-loading-grid">
        <span className="route-skeleton" /><span className="route-skeleton" /><span className="route-skeleton" />
      </div>
    </main>
  );
}