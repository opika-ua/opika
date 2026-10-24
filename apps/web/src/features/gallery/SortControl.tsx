import type { FeedFilters, GallerySort } from "@opika/domain";
import { GALLERY_SORTS } from "@opika/domain";
import { uk } from "@opika/i18n";
import Link from "next/link";
import type { CitySlugsById } from "./filter-url";
import { galleryHref } from "./filter-url";

interface SortControlProps {
  filters: FeedFilters;
  sort: GallerySort;
  citySlugs: CitySlugsById;
}

const SORT_LABEL: Record<GallerySort, string> = {
  freshest: uk.filters.sortFreshest,
  longest_waiting: uk.filters.sortLongestWaiting,
};

/**
 * docs/design/README.md, "Rail, count, sort": "sort control right (48,
 * radius 16)." A standalone control, not part of the rail card — it sits
 * beside the result-count line above the grid at every width the rail also
 * appears, and is folded into the sheet's own form (as radios) below 1024.
 *
 * The mock (`Opika Registry System.dc.html`'s B1 frame) draws this as a
 * single closed dropdown showing the active choice plus a "▾" caret — but
 * with only two options ever, rebuilding that as a real opening menu would
 * trade a working, no-JS, keyboard-native pair of links for a client
 * component that has to reinvent focus management, Escape-to-close and a
 * no-JS fallback none of which the mock actually specifies (it only shows
 * the closed state). That is new interaction surface, not a restyle, so
 * this keeps the two-link structure — both options are always real,
 * instantly-applying navigations, same as the rail's chips — and applies
 * the mock's sizing/radius/colour to it instead of its dropdown affordance.
 * Reviewed and settled, not left open: a "skin, not skeleton" call, the
 * same reasoning `docs/build-plan.md`'s Phase E entry for V2 states for
 * the phase as a whole. Recorded in the V2 PR description's decisions.
 */
export function SortControl({ filters, sort, citySlugs }: SortControlProps) {
  return (
    <SortLinks
      sort={sort}
      hrefFor={(option) => galleryHref(filters, option, citySlugs)}
      visibility="hidden desktop:flex"
    />
  );
}

/**
 * The two date sorts as links, for any list that offers them: the gallery
 * (`SortControl`, beside its rail) and the shelter page (designer round 1,
 * S6), which has no rail or sheet and so shows them at every width. The
 * caller says where each sort leads, so the URL scheme stays the caller's.
 */
export function SortLinks({
  sort,
  hrefFor,
  visibility,
}: {
  sort: GallerySort;
  hrefFor: (option: GallerySort) => string;
  /** The display utilities: the gallery hides these below `desktop`, where its sheet holds them. */
  visibility: "flex" | "hidden desktop:flex";
}) {
  return (
    <nav
      data-testid="sort-control"
      aria-label={uk.filters.sortLabel}
      /*
       * Designer feedback batch B: on the shelter page this sits directly in a
       * `flex flex-col` section, whose default `align-items: stretch` was
       * pulling the nav (and so its two links) across the full row — a
       * compact segmented control reading as a stretched bar while the cards
       * below it stayed their own width. `self-start` sizes it to its content
       * in a column parent; in the gallery's row parent (`items-center`
       * already overrides stretch there) it changes nothing, so one class
       * serves both without a new prop.
       */
      className={`font-rg self-start ${visibility} rounded-rg-button bg-rg-surface h-12`}
    >
      {/*
        The nav keeps its own rounding (for the continuous-pill fill,
        visible through the inactive link's transparent background) but
        NOT `overflow-hidden` — that was clipping a focus-visible outline
        on the two end links along with everything else, and this
        control's own focus ring must never disappear
        (docs/design/README.md, "Focus": "Never removed."). Rounding the
        two end links individually (GALLERY_SORTS is a fixed 2-option
        union — `packages/domain` — so first/last is exactly
        first/second here) keeps each link's own corner from squaring
        off against the nav's now-unclipped edges.
      */}
      {GALLERY_SORTS.map((option, index) => (
        <Link
          // Off, like the cards' own links: with the animal overlay's interception
          // in the tree, Next keys prefetches by the current URL, so every overlay
          // opened re-prefetched every visible gallery link, each one a request
          // against proxy.ts's per-IP limit (gallery-animal-overlay.harness.ts).
          prefetch={false}
          key={option}
          href={hrefFor(option)}
          // `aria-current`, not `aria-pressed` — same reason as FilterRail's
          // Chip: `aria-pressed` is not an allowed attribute on role="link".
          aria-current={sort === option ? "true" : undefined}
          className={`flex items-center px-5 text-[15px] whitespace-nowrap transition-colors duration-[120ms] ease-rg focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px] ${
            index === 0 ? "rounded-l-[16px]" : "rounded-r-[16px]"
          } ${
            sort === option
              ? "bg-rg-ink text-rg-surface font-medium"
              : "text-rg-ink-3 hover:text-rg-ink-2"
          }`}
        >
          {SORT_LABEL[option]}
        </Link>
      ))}
    </nav>
  );
}
