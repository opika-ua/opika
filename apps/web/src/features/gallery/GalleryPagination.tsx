import type { FeedFilters, GallerySort } from "@opika/domain";
import { uk } from "@opika/i18n";
import Link from "next/link";
import { galleryPageHref } from "./filter-url";
import { paginationWindow } from "./gallery-pagination";

interface GalleryPaginationProps {
  filters: FeedFilters;
  sort: GallerySort;
  /** The page actually served — `gallery.list`'s own `page`, already
   * clamped server-side, never the raw `?stor=` a stale link might carry. */
  page: number;
  totalPages: number;
}

const PILL =
  "min-h-11 min-w-11 inline-flex items-center justify-center rounded-button font-sans text-sm px-2";
const PILL_INACTIVE = `${PILL} border border-line-strong bg-paper text-ink-2 hover:border-line-heavy`;
const PILL_ACTIVE = `${PILL} bg-leaf text-paper`;
const PILL_DISABLED = `${PILL} border border-line text-ink-4`;

function pageAriaLabel(page: number): string {
  return uk.pagination.pageLabel.replace("{page}", String(page));
}

/**
 * `docs/build-plan.md`'s E3 row: "Numbered pagination — ?stor=N, prev/next,
 * active page leaf-filled, all targets 44px." Plain `<Link>`s, no
 * `ReplaceNav` wrapper: `docs/gallery-contract-decisions.md` §7 settles page
 * navigation as `push`, not `replace` — a page link is a distinct view, the
 * same as the animal grid's own links, not a refinement of "the same" view
 * the way a filter chip is. That also means this component needs no
 * `"use client"`: every link is a real, plain navigation, so numbered pages
 * work with no JS at all, the same requirement the design states for the
 * whole surface.
 *
 * The current page renders as a non-interactive `<span>`, not a link to
 * itself — `aria-current="page"` plus the leaf fill carry the state; a
 * click that would navigate to the page already showing has nothing to do.
 *
 * `id="pagination"` + `tabIndex={-1}`: the skip link's target (`page.tsx`).
 * A `<nav>` landmark isn't natively focusable; `tabIndex={-1}` makes it a
 * valid target for `href="#pagination"` without adding it to the normal Tab
 * sequence — the standard "skip nav" pattern, not a roving-tabindex scheme
 * (nothing here ever sets `tabIndex` on more than this one, fixed element).
 */
export function GalleryPagination({ filters, sort, page, totalPages }: GalleryPaginationProps) {
  if (totalPages <= 1) return null;

  const items = paginationWindow(page, totalPages);

  return (
    <nav
      id="pagination"
      tabIndex={-1}
      data-testid="gallery-pagination"
      aria-label={uk.pagination.navLabel}
      className="mt-8 flex flex-col items-center gap-3"
    >
      <div className="flex flex-wrap items-center justify-center gap-2">
        {page > 1 ? (
          <Link
            href={galleryPageHref(filters, sort, page - 1)}
            aria-label={uk.pagination.prevLabel}
            data-testid="pagination-prev"
            className={PILL_INACTIVE}
          >
            ‹
          </Link>
        ) : (
          <span aria-hidden="true" data-testid="pagination-prev-disabled" className={PILL_DISABLED}>
            ‹
          </span>
        )}

        {items.map((item, index) =>
          item === "ellipsis" ? (
            <span key={`ellipsis-${index}`} aria-hidden="true" className="px-1 text-ink-3">
              …
            </span>
          ) : item === page ? (
            <span
              key={item}
              aria-current="page"
              data-testid="pagination-page"
              data-active="true"
              className={PILL_ACTIVE}
            >
              {item}
              <span className="sr-only">, {uk.pagination.current}</span>
            </span>
          ) : (
            <Link
              key={item}
              href={galleryPageHref(filters, sort, item)}
              aria-label={pageAriaLabel(item)}
              data-testid="pagination-page"
              className={PILL_INACTIVE}
            >
              {item}
            </Link>
          ),
        )}

        {page < totalPages ? (
          <Link
            href={galleryPageHref(filters, sort, page + 1)}
            aria-label={uk.pagination.nextLabel}
            data-testid="pagination-next"
            className={PILL_INACTIVE}
          >
            ›
          </Link>
        ) : (
          <span aria-hidden="true" data-testid="pagination-next-disabled" className={PILL_DISABLED}>
            ›
          </span>
        )}
      </div>

      <p className="text-center font-sans text-xs text-ink-3">{uk.pagination.footnote}</p>
    </nav>
  );
}
