import type { FeedFilters, GallerySort } from "@opika/domain";
import { GALLERY_SORTS } from "@opika/domain";
import { uk } from "@opika/i18n";
import Link from "next/link";
import { galleryHref } from "./filter-url";

interface SortControlProps {
  filters: FeedFilters;
  sort: GallerySort;
}

const SORT_LABEL: Record<GallerySort, string> = {
  freshest: uk.filters.sortFreshest,
  longest_waiting: uk.filters.sortLongestWaiting,
};

/**
 * docs/design/README.md, "Rail, count, sort": "Above the grid: '...' left;
 * a sort control right (44px, radius 12)." A standalone control, not part
 * of the rail card — it sits beside the result-count line above the grid
 * at every width the rail also appears, and is folded into the sheet's own
 * form (as radios) below 1024. Two links, same "instant apply, no button"
 * behaviour as the rail's chips, for the same reason: a click is already a
 * real navigation.
 */
export function SortControl({ filters, sort }: SortControlProps) {
  return (
    <nav
      data-testid="sort-control"
      aria-label={uk.filters.sortLabel}
      className="hidden desktop:flex rounded-button border border-line-strong bg-paper overflow-hidden h-11"
    >
      {GALLERY_SORTS.map((option) => (
        <Link
          key={option}
          href={galleryHref(filters, option)}
          // `aria-current`, not `aria-pressed` — same reason as FilterRail's
          // Chip: `aria-pressed` is not an allowed attribute on role="link".
          aria-current={sort === option ? "true" : undefined}
          className={`flex items-center px-4 font-sans text-sm whitespace-nowrap ${
            sort === option ? "bg-leaf text-paper" : "text-ink-3 hover:text-ink-2"
          }`}
        >
          {SORT_LABEL[option]}
        </Link>
      ))}
    </nav>
  );
}
