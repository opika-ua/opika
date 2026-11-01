import type { FeedFilters, GallerySort } from "@opika/domain";
import { GALLERY_SORTS } from "@opika/domain";
import { uk } from "@opika/i18n";
import { Toggle } from "../../ui/Toggle";
import type { CitySlugsById } from "./filter-url";
import { galleryHref } from "./filter-url";

interface GallerySortToggleProps {
  filters: FeedFilters;
  sort: GallerySort;
  citySlugs: CitySlugsById;
}

/**
 * «Нові ⬤ Зачекались»: the kit `Toggle` over the two sorts. Each accessible name is the short
 * visible label followed by the long sentence, so it contains the visible text (WCAG 2.5.3).
 */
export function GallerySortToggle({ filters, sort, citySlugs }: GallerySortToggleProps) {
  return (
    <Toggle
      label={uk.filters.sortLabel}
      current={GALLERY_SORTS.indexOf(sort) === 1 ? 1 : 0}
      options={[
        {
          label: uk.filters.sortFreshestShort,
          href: galleryHref(filters, "freshest", citySlugs),
          ariaLabel: `${uk.filters.sortFreshestShort}. ${uk.filters.sortFreshest}`,
        },
        {
          label: uk.filters.sortLongestWaitingShort,
          href: galleryHref(filters, "longest_waiting", citySlugs),
          ariaLabel: `${uk.filters.sortLongestWaitingShort}. ${uk.filters.sortLongestWaiting}`,
        },
      ]}
    />
  );
}
