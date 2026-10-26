import type { FeedFilters, GallerySort } from "@opika/domain";
import { uk } from "@opika/i18n";
import Link from "next/link";
import type { CitySlugsById } from "./filter-url";
import { galleryPageHref } from "./filter-url";
import { hasPagination, isTruncated, paginationWindow } from "./gallery-pagination";
import { ChevronIcon } from "./icons";

interface GalleryPageNavProps {
  filters: FeedFilters;
  sort: GallerySort;
  citySlugs: CitySlugsById;
  page: number;
  totalPages: number;
}

function pageAriaLabel(page: number): string {
  return uk.pagination.pageLabel.replace("{page}", String(page));
}

/**
 * The gallery-v3 pagination (Figma `58:1617`): "Prev chevron, then the
 * pages, then the next chevron" — icon-only, unlike the existing
 * `GalleryPagination`/`PaginationNav` (`GalleryPagination.tsx`), whose
 * prev/next carry their own visible text specifically *because* an
 * icon-only control with a mismatched `aria-label` was a real, previously
 * caught WCAG 2.5.3 defect (`docs/standing-constraints.md`). That rule does
 * not forbid an icon-only control outright - it forbids visible text that
 * doesn't match the accessible name. These chevrons carry no visible text
 * at all, so an `aria-label` naming what they do (`uk.pagination.prev`/
 * `next`, the same existing strings) is the standard, compliant pattern,
 * not a reversion to the old bug.
 *
 * A new component, not a restyle of `PaginationNav` in place, for the same
 * reason as `GalleryCard`/`GallerySortToggle`: `PaginationNav` is shared
 * with the shelter page (designer round 1, S6), outside this redesign's
 * scope. Reuses the shared pure logic (`paginationWindow`, `isTruncated`,
 * `hasPagination`, `galleryPageHref`) and the existing i18n strings; only
 * the markup is new.
 *
 * Page pills: visual size stays the design's own 44px
 * (`size-11`); the *hit area* is widened to the project's 48px floor
 * (`min-h-12 min-w-12`) via invisible padding around that same visual
 * circle, per the hand-off's own accessibility note ("Extend each one's
 * hit area to at least 48px (padding or ::before)... keep their visual
 * size"). Same technique for the chevrons, which have no visual circle to
 * preserve a size for - just a 48px invisible box around the 24px icon.
 */
export function GalleryPageNav({
  filters,
  sort,
  citySlugs,
  page,
  totalPages,
}: GalleryPageNavProps) {
  if (!hasPagination(totalPages)) return null;

  const items = paginationWindow(page, totalPages);
  const truncated = isTruncated(items);
  const ofTotal = uk.pagination.ofTotal.replace("{total}", String(totalPages));

  return (
    <nav
      id="pagination"
      tabIndex={-1}
      data-testid="gallery-pagination"
      aria-label={uk.pagination.navLabel}
      className="mt-6 flex flex-wrap items-center justify-center gap-4 pt-2 font-brand-ui"
    >
      {page > 1 ? (
        <Link
          prefetch={false}
          href={galleryPageHref(filters, sort, page - 1, citySlugs)}
          aria-label={uk.pagination.prev}
          data-testid="pagination-prev"
          className="flex min-h-12 min-w-12 items-center justify-center rounded-brand-pill text-brand-ink focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-brand-accent focus-visible:outline-offset-[3px]"
        >
          <ChevronIcon className="size-6 rotate-90" />
        </Link>
      ) : (
        <span
          aria-hidden="true"
          className="min-h-12 min-w-12"
          data-testid="pagination-prev-disabled"
        />
      )}

      <div className="flex flex-wrap items-center justify-center gap-2">
        {items.map((item, index) =>
          item === "ellipsis" ? (
            <span key={`ellipsis-${index}`} aria-hidden="true" className="px-1 text-brand-muted">
              …
            </span>
          ) : item === page ? (
            <span
              key={item}
              aria-current="page"
              data-testid="pagination-page"
              data-active="true"
              className="relative flex min-h-12 min-w-12 items-center justify-center"
            >
              <span
                aria-hidden="true"
                className="absolute inset-0 m-auto size-11 rounded-brand-pill bg-brand-ink"
              />
              <span className="relative text-[16px]/[1.2] font-semibold text-brand-on-ink">
                {item}
              </span>
              <span className="sr-only">, {uk.pagination.current}</span>
            </span>
          ) : (
            <Link
              prefetch={false}
              key={item}
              href={galleryPageHref(filters, sort, item, citySlugs)}
              aria-label={pageAriaLabel(item)}
              data-testid="pagination-page"
              className="relative flex min-h-12 min-w-12 items-center justify-center focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-brand-accent focus-visible:outline-offset-[3px]"
            >
              <span
                aria-hidden="true"
                className="absolute inset-0 m-auto size-11 rounded-brand-pill bg-brand-line"
              />
              <span className="relative text-[16px]/[1.2] font-semibold text-brand-ink">
                {item}
              </span>
            </Link>
          ),
        )}
        {truncated && <span className="text-[16px] text-brand-muted">{ofTotal}</span>}
      </div>

      {page < totalPages ? (
        <Link
          prefetch={false}
          href={galleryPageHref(filters, sort, page + 1, citySlugs)}
          aria-label={uk.pagination.next}
          data-testid="pagination-next"
          className="flex min-h-12 min-w-12 items-center justify-center rounded-brand-pill text-brand-ink focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-brand-accent focus-visible:outline-offset-[3px]"
        >
          <ChevronIcon className="size-6 -rotate-90" />
        </Link>
      ) : (
        <span
          aria-hidden="true"
          className="min-h-12 min-w-12"
          data-testid="pagination-next-disabled"
        />
      )}
    </nav>
  );
}
