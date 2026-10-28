import { GALLERY_SORTS, type GallerySort, type ShelterId } from "@opika/domain";
import { uk } from "@opika/i18n";
import Link from "next/link";
import { shelterPageHref } from "./shelter-url";

interface ShelterSortToggleProps {
  shelterId: ShelterId;
  sort: GallerySort;
}

/**
 * The gallery-v3 sort toggle's own markup (`GallerySortToggle.tsx`), rooted
 * at this shelter's own page instead of `/tvaryny`. Same design-feedback
 * round as `ShelterPageNav.tsx` - see that file's comment for why this is a
 * new, small component in this PR's own feature folder rather than a swap
 * to `GallerySortToggle` itself: that component builds its hrefs with
 * `galleryHref`, hardcoded to `/tvaryny`, which would send a sort click off
 * this shelter's own page and break this screen's own pinned test ("offers
 * the gallery's two date sorts, each leading back to this shelter's page").
 * `GallerySortToggle` and `SortControl.tsx` are both unedited.
 *
 * `data-testid="sort-control"` is new here (the original had none) so this
 * screen's existing test keeps finding it by the same name `SortLinks` used.
 */
export function ShelterSortToggle({ shelterId, sort }: ShelterSortToggleProps) {
  const hrefFor = (option: GallerySort) => shelterPageHref(shelterId, option, 1);
  const freshestHref = hrefFor("freshest");
  const longestWaitingHref = hrefFor("longest_waiting");
  const activeIndex = GALLERY_SORTS.indexOf(sort);
  const otherHref = sort === "freshest" ? longestWaitingHref : freshestHref;

  return (
    <nav
      aria-label={uk.filters.sortLabel}
      data-testid="sort-control"
      className="flex min-h-13 shrink-0 items-center gap-3 font-brand-ui"
    >
      <Link
        prefetch={false}
        href={freshestHref}
        aria-label={`${uk.filters.sortFreshestShort}. ${uk.filters.sortFreshest}`}
        aria-current={sort === "freshest" ? "true" : undefined}
        data-testid="sort-freshest"
        className={`flex min-h-12 items-center rounded-brand-pill px-2 text-[18px]/[1.2] font-semibold focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-brand-accent focus-visible:outline-offset-[3px] ${
          sort === "freshest" ? "text-brand-ink" : "text-brand-muted"
        }`}
      >
        {uk.filters.sortFreshestShort}
      </Link>

      <Link
        prefetch={false}
        href={otherHref}
        tabIndex={-1}
        aria-hidden="true"
        data-testid="sort-track"
        className="relative inline-flex h-[26px] w-[46px] shrink-0 items-center rounded-brand-pill bg-brand-ink p-[3px]"
      >
        <span
          className={`block size-5 rounded-brand-pill bg-brand-surface transition-transform duration-[120ms] ${
            activeIndex === 1 ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </Link>

      <Link
        prefetch={false}
        href={longestWaitingHref}
        aria-label={`${uk.filters.sortLongestWaitingShort}. ${uk.filters.sortLongestWaiting}`}
        aria-current={sort === "longest_waiting" ? "true" : undefined}
        data-testid="sort-longest-waiting"
        className={`flex min-h-12 items-center rounded-brand-pill px-2 text-[18px]/[1.2] font-semibold focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-brand-accent focus-visible:outline-offset-[3px] ${
          sort === "longest_waiting" ? "text-brand-ink" : "text-brand-muted"
        }`}
      >
        {uk.filters.sortLongestWaitingShort}
      </Link>
    </nav>
  );
}
