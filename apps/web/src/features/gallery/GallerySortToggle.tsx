import type { FeedFilters, GallerySort } from "@opika/domain";
import { GALLERY_SORTS } from "@opika/domain";
import { uk } from "@opika/i18n";
import type { CitySlugsById } from "./filter-url";
import { galleryHref } from "./filter-url";
import { Dropdown, DropdownOption } from "./GalleryFilterDropdowns";

interface GallerySortToggleProps {
  filters: FeedFilters;
  sort: GallerySort;
  citySlugs: CitySlugsById;
}

const SORT_LABEL: Record<GallerySort, string> = {
  freshest: uk.filters.sortFreshestShort,
  longest_waiting: uk.filters.sortLongestWaitingShort,
};

const SORT_FULL_SENTENCE: Record<GallerySort, string> = {
  freshest: uk.filters.sortFreshest,
  longest_waiting: uk.filters.sortLongestWaiting,
};

/**
 * «Сортування: Нові/Зачекались» - the gallery-v3 control block's sort
 * control, restyled as a filter-styled dropdown (gallery filter
 * restructure, decision taken: the user's own instruction was "toggle
 * old/new becomes a new filter like Old New options", read as the visual
 * inverse of the species change below it - species moved from a dropdown
 * to a toggle, sort moves from its own sliding-knob toggle to the
 * dropdown city/age/size/sex already use. Not "every other filter here":
 * species is the one dimension that went the other way, onto a toggle.
 *
 * Reuses `GalleryFilterDropdowns.tsx`'s own `Dropdown`/`DropdownOption` -
 * same component, not a visual copy - with no `clearHref`: sort always
 * carries a real value (there is no "any" sort), so `Dropdown` always
 * shows its chevron here, never the clear ✕ the filter dropdowns show
 * once constrained. `active` is always `true`: the trigger's label is
 * always the real current sort, never a placeholder, so it reads in the
 * same ink colour a constrained filter dropdown does, not the muted
 * placeholder colour.
 *
 * `GallerySort`/`GALLERY_SORTS` (`packages/domain`) are unchanged - this
 * is a pure UI restyle, not a semantic change to sorting itself. Still two
 * real links, each an instant navigation: only two sorts ever exist, so a
 * client-side "open a menu" control (what `Dropdown`'s own disclosure
 * mechanism technically is) buys real choice between them for free,
 * without inventing a third interaction pattern for exactly two options.
 */
export function GallerySortToggle({ filters, sort, citySlugs }: GallerySortToggleProps) {
  return (
    <Dropdown legend={uk.filters.sortLabel} active={true} label={SORT_LABEL[sort]}>
      {GALLERY_SORTS.map((candidate) => (
        <DropdownOption
          key={candidate}
          active={candidate === sort}
          href={galleryHref(filters, candidate, citySlugs)}
        >
          {SORT_FULL_SENTENCE[candidate]}
        </DropdownOption>
      ))}
    </Dropdown>
  );
}
