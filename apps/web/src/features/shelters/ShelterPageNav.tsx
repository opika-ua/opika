import type { GallerySort, ShelterId } from "@opika/domain";
import { uk } from "@opika/i18n";
import Link from "next/link";
import { hasPagination, isTruncated, paginationWindow } from "../gallery/gallery-pagination";
import { ChevronIcon } from "../gallery/icons";
import { shelterPageHref } from "./shelter-url";

interface ShelterPageNavProps {
  shelterId: ShelterId;
  sort: GallerySort;
  page: number;
  totalPages: number;
}

function pageAriaLabel(page: number): string {
  return uk.pagination.pageLabel.replace("{page}", String(page));
}

/**
 * The gallery-v3 pagination's own markup (`GalleryPageNav.tsx`), rooted at
 * this shelter's own page instead of `/tvaryny`. Design feedback on this
 * PR's first screenshot round: the shelter page still showed the old
 * boxed-button pagination while every other part of it had moved to the
 * brand style - `GalleryPageNav.tsx`'s own doc comment names the shelter
 * page as exactly the "outside this redesign's scope" case it was built
 * around, so this PR is where that gets closed.
 *
 * Not a straight swap to `GalleryPageNav` itself: that component builds its
 * hrefs with `galleryPageHref`, hardcoded to `/tvaryny` - reusing it here
 * would send a page click off this shelter's own page entirely (and break
 * this screen's own pinned test, "keeps its pagination within this
 * shelter"). `GalleryPageNav`, `SortControl.tsx` and `GalleryPagination.tsx`
 * are all unedited: this is a new, small component in this PR's own
 * feature folder, copying the gallery-v3 markup and reusing the same pure
 * logic (`paginationWindow`, `isTruncated`, `hasPagination`) and icon
 * (`ChevronIcon`) - only the href builder (`shelterPageHref`) differs.
 */
export function ShelterPageNav({ shelterId, sort, page, totalPages }: ShelterPageNavProps) {
  if (!hasPagination(totalPages)) return null;

  const items = paginationWindow(page, totalPages);
  const truncated = isTruncated(items);
  const ofTotal = uk.pagination.ofTotal.replace("{total}", String(totalPages));
  const hrefFor = (target: number) => shelterPageHref(shelterId, sort, target);

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
          href={hrefFor(page - 1)}
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
              href={hrefFor(item)}
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
          href={hrefFor(page + 1)}
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
