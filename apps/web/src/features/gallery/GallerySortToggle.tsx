import type { FeedFilters, GallerySort } from "@opika/domain";
import { GALLERY_SORTS } from "@opika/domain";
import { uk } from "@opika/i18n";
import Link from "next/link";
import type { CitySlugsById } from "./filter-url";
import { galleryHref } from "./filter-url";

interface GallerySortToggleProps {
  filters: FeedFilters;
  sort: GallerySort;
  citySlugs: CitySlugsById;
}

/**
 * «Нові ⬤ Зачекались» - the two-link sliding-knob sort toggle, restored
 * per the owner's option-B sketch (`filter-row-option-B.png`) after #228
 * had restyled it into a `Dropdown`. Pre-#228 version, unchanged (its
 * `galleryHref`/`uk.filters.sort*` dependencies hadn't drifted): still two
 * real links, each an instant navigation - only two sorts ever exist
 * (`GALLERY_SORTS`), so a disclosure menu would be new interaction
 * surface for no benefit.
 *
 * Visible labels are the owner's pre-approved short forms («Нові» /
 * «Зачекались»); each `aria-label` is the short label followed by the
 * long sentence (e.g. "Нові. Спочатку найсвіжіші картки"), so it both
 * contains the visible text verbatim (WCAG 2.5.3) and keeps the fuller
 * context.
 */
export function GallerySortToggle({ filters, sort, citySlugs }: GallerySortToggleProps) {
  const freshestHref = galleryHref(filters, "freshest", citySlugs);
  const longestWaitingHref = galleryHref(filters, "longest_waiting", citySlugs);
  const activeIndex = GALLERY_SORTS.indexOf(sort);
  // Clicking the track flips to whichever sort isn't active - only two
  // sorts ever exist, so "flip" and "go to the other one" are the same href.
  const otherHref = sort === "freshest" ? longestWaitingHref : freshestHref;

  return (
    // shrink-0: in the control block's row the dropdowns give way and wrap,
    // never the switch. min-h-13 is a dropdown trigger's own height, so the
    // switch sits centred on the first line of dropdowns beside it.
    <nav
      aria-label={uk.filters.sortLabel}
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

      {/*
        The track: 46x26, radius 13 (rounded-brand-pill, 999 renders fully
        rounded at this size), ink fill, a 20px surface-coloured knob
        sliding to whichever side is active. A real link to "the other"
        sort, but tabIndex={-1} and aria-hidden keep it out of the Tab
        order and the accessible tree - it always leads where one of the
        two text links beside it already does.
      */}
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
