export default function BooksLoading() {
  const placeholders = ["one", "two", "three", "four", "five", "six", "seven", "eight"];

  return (
    <main aria-busy="true" className="container page-main books-loading" id="main-content">
      <span className="sr-only" role="status">Loading books</span>
      <div aria-hidden="true" className="route-loading-copy">
        <span className="route-skeleton route-skeleton-eyebrow" />
        <span className="route-skeleton route-skeleton-title" />
      </div>
      <span aria-hidden="true" className="route-skeleton books-loading-search" />
      <div aria-hidden="true" className="route-loading-grid books-loading-grid">
        {placeholders.map((placeholder) => (
          <div className="books-loading-card" key={placeholder}>
            <span className="route-skeleton books-loading-cover" />
            <span className="route-skeleton books-loading-category" />
            <span className="route-skeleton books-loading-title" />
            <span className="route-skeleton books-loading-author" />
            <span className="route-skeleton books-loading-action" />
          </div>
        ))}
      </div>
    </main>
  );
}