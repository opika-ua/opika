import Link from "next/link";
import { cx } from "./cx";
import { Icon } from "./Icon";
import { paginationWindow } from "./pagination-window";

/**
 * Numbered pages as real links (so it works without JS and every page has a URL). Prev and next are
 * icon-only and named by `prevLabel`/`nextLabel`; each page link is named by `pageLabel` with `{page}`
 * replaced. The current page is `aria-current="page"` and is read out with `currentLabel`. A missing
 * prev or next keeps its space so the numbers do not jump. Hit areas are 48px; the visible circle is 44.
 * Nothing renders for a single page.
 */
export type PaginationProps = {
  page: number;
  totalPages: number;
  /** The href of a page number; the caller owns the URL scheme. */
  hrefFor: (page: number) => string;
  navLabel: string;
  prevLabel: string;
  nextLabel: string;
  /** Contains `{page}`, e.g. «Сторінка {page}». */
  pageLabel: string;
  /** Read after the current page's number, e.g. «поточна». */
  currentLabel: string;
  /** Shown after a truncated list, e.g. «з 83». */
  ofTotalLabel?: string;
  className?: string;
};

const HIT = "flex min-h-target min-w-target items-center justify-center";

export function Pagination({
  page,
  totalPages,
  hrefFor,
  navLabel,
  prevLabel,
  nextLabel,
  pageLabel,
  currentLabel,
  ofTotalLabel,
  className,
}: PaginationProps) {
  if (totalPages <= 1) return null;
  const items = paginationWindow(page, totalPages);
  return (
    <nav
      aria-label={navLabel}
      className={cx("flex flex-wrap items-center justify-center gap-4", className)}
    >
      {page > 1 ? (
        <Link
          prefetch={false}
          href={hrefFor(page - 1)}
          aria-label={prevLabel}
          className={cx(HIT, "rounded-pill text-ink focus-ring")}
        >
          <Icon name="chevron-left" />
        </Link>
      ) : (
        <span aria-hidden="true" className="min-h-target min-w-target" />
      )}

      <div className="flex flex-wrap items-center justify-center gap-2">
        {items.map((item, index) =>
          item === "ellipsis" ? (
            <span key={`gap-${index}`} aria-hidden="true" className="px-1 text-ink-2">
              …
            </span>
          ) : item === page ? (
            <span key={item} aria-current="page" className={cx(HIT, "relative")}>
              <span
                aria-hidden="true"
                className="absolute inset-0 m-auto size-11 rounded-pill bg-ink"
              />
              <span className="relative text-label text-on-ink">{item}</span>
              <span className="sr-only">, {currentLabel}</span>
            </span>
          ) : (
            <Link
              key={item}
              prefetch={false}
              href={hrefFor(item)}
              aria-label={pageLabel.replace("{page}", String(item))}
              className={cx(HIT, "relative rounded-pill focus-ring")}
            >
              <span
                aria-hidden="true"
                className="absolute inset-0 m-auto size-11 rounded-pill bg-line"
              />
              <span className="relative text-label text-ink">{item}</span>
            </Link>
          ),
        )}
        {ofTotalLabel !== undefined && items.includes("ellipsis") ? (
          <span className="text-caption text-ink-2">{ofTotalLabel}</span>
        ) : null}
      </div>

      {page < totalPages ? (
        <Link
          prefetch={false}
          href={hrefFor(page + 1)}
          aria-label={nextLabel}
          className={cx(HIT, "rounded-pill text-ink focus-ring")}
        >
          <Icon name="chevron-right" />
        </Link>
      ) : (
        <span aria-hidden="true" className="min-h-target min-w-target" />
      )}
    </nav>
  );
}
