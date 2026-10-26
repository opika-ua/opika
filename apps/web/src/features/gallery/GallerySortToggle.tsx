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
 * «Нові ⬤ Зачекались» - the gallery-v3 control block's sort toggle (Figma
 * `58:1617`). A new component, not a restyle of `SortControl`/`SortLinks`
 * (`SortControl.tsx`) in place: `SortLinks` is shared with the shelter page
 * (designer round 1, S6), which is not in this redesign's scope, and the
 * two designs are visually different enough (a sliding-knob track here vs.
 * a two-pill segmented control there) that reusing one component for both
 * would mean branching its entire render on a `variant` prop. Reuses the
 * two sorts' real hrefs (`galleryHref`) and `aria-current` semantics -
 * `SortLinks`'s own reasoning for both still applies here - just with its
 * own markup.
 *
 * Still two real links, each an instant navigation, same as `SortLinks`:
 * only two sorts ever exist (`GALLERY_SORTS`, `packages/domain`), so a
 * client-side "open a menu" control would be new interaction surface for
 * no benefit - `SortControl.tsx`'s own comment makes the identical call for
 * the old design.
 *
 * Visible labels are the owner's pre-approved short forms («Нові» /
 * «Зачекались»). **Decision taken, deviating from the builder prompt's own
 * instruction to keep the existing long sentences
 * (`uk.filters.sortFreshest`/`sortLongestWaiting`) as each link's bare
 * `aria-label`:** neither short label is a substring of its long sentence
 * ("Нові" does not appear in "Спочатку найсвіжіші картки"; "Зачекались" is
 * a different word form from "чекають" in "Найдовше чекають"), so that
 * would have been exactly the WCAG 2.5.3 accessible-name mismatch
 * `docs/standing-constraints.md` already records as a real, previously
 * caught defect ("When a mock exists, open the mock" - bare chevrons with
 * a conflicting aria-label). Each `aria-label` here is the short label
 * followed by the long sentence (e.g. "Нові. Спочатку найсвіжіші картки"),
 * so it both contains the visible text verbatim and keeps the fuller
 * context the original instruction was presumably after.
 */
export function GallerySortToggle({ filters, sort, citySlugs }: GallerySortToggleProps) {
  const freshestHref = galleryHref(filters, "freshest", citySlugs);
  const longestWaitingHref = galleryHref(filters, "longest_waiting", citySlugs);
  const activeIndex = GALLERY_SORTS.indexOf(sort);
  // Clicking the track flips to whichever sort isn't active right now -
  // Oleksii, mid-build: "the toggle for Нові/Зачекались has to switch when
  // you click on it as well, not only on the text." Since there are only
  // ever two sorts, "flip" and "go to the other one" are the same href.
  const otherHref = sort === "freshest" ? longestWaitingHref : freshestHref;

  return (
    <nav aria-label={uk.filters.sortLabel} className="flex items-center gap-3 font-brand-ui">
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
        The track itself: 46x26, radius 13 (`rounded-brand-pill`, which is
        999 and so renders the same fully-rounded shape at this size), ink
        fill, a 20px surface-coloured knob sliding to whichever side is
        active. A real, clickable link to "the other" sort - not merely
        decorative - but `tabIndex={-1}` and `aria-hidden="true"` keep it
        out of the Tab order and the accessible tree: it always leads to
        exactly the same place one of the two text links beside it
        already does, so a keyboard or screen-reader user has no reason
        to meet it as a third, redundant stop. Mouse/touch clicks reach
        it regardless of either attribute - neither suppresses pointer
        interaction, only keyboard/AT exposure.
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
