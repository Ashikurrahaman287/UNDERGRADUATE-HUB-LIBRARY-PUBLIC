import Link from "next/link";

type AdminPaginationProps = {
  page: number;
  pageSize: number;
  total: number;
  pathname: string;
  filters?: Record<string, string>;
};

export function AdminPagination({ page, pageSize, total, pathname, filters = {} }: AdminPaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (pageCount <= 1) return null;

  function pageHref(destination: number): string {
    const params = new URLSearchParams({ ...filters, page: String(destination) });
    return `${pathname}?${params.toString()}`;
  }

  return (
    <nav aria-label="Pagination" className="admin-pagination">
      {page > 1 ? <Link href={pageHref(page - 1)}>Previous</Link> : <span aria-disabled="true">Previous</span>}
      <span>Page {page} of {pageCount}</span>
      {page < pageCount ? <Link href={pageHref(page + 1)}>Next</Link> : <span aria-disabled="true">Next</span>}
    </nav>
  );
}
