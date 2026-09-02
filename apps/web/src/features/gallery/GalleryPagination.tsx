import type { FeedFilters, GallerySort } from "@opika/domain";
import { uk } from "@opika/i18n";
import Link from "next/link";
import { galleryPageHref } from "./filter-url";
import { hasPagination, isTruncated, paginationWindow } from "./gallery-pagination";

interface GalleryPaginationProps {
  filters: FeedFilters;
  sort: GallerySort;
  /** The page actually served — `gallery.list`'s own `page`, already
   * clamped server-side, never the raw `?stor=` a stale link might carry. */
  page: number;
  totalPages: number;
}

/**
 * `Opika Registry System.dc.html`'s B1 gallery frame, the pagination row's
 * literal styles: prev/next 56 tall, radius 16, 15px, no border on either
 * state — the mock's own available/unavailable pair is a fill contrast
 * (`Далі →` filled `#101112`/white; `← Назад` plain `#FFFFFF`/`ink-3`), not
 * a border-and-colour pair, applied symmetrically to whichever of prev/next
 * is at its own end. The mock only shows one example of each (page 1: prev
 * unavailable, next available) — this applies the same two treatments to
 * whichever control is inert on any given page.
 */
const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px]";
const NAV_BUTTON = `font-rg inline-flex items-center min-h-14 px-6 rounded-rg-button text-[15px] ${FOCUS_RING}`;
const NAV_BUTTON_AVAILABLE = `${NAV_BUTTON} bg-rg-ink text-rg-surface font-medium`;
const NAV_BUTTON_UNAVAILABLE = `${NAV_BUTTON} bg-rg-surface text-rg-ink-3`;

/** The number pills — 56x56, centred, no border on either state (the
 * mock's inactive "2" is a plain white fill, not an outline). */
const PAGE_PILL = `font-rg min-h-14 min-w-14 inline-flex items-center justify-center rounded-rg-button text-[15px] ${FOCUS_RING}`;
const PAGE_PILL_INACTIVE = `${PAGE_PILL} bg-rg-surface text-rg-ink`;
const PAGE_PILL_ACTIVE = `${PAGE_PILL} bg-rg-ink text-rg-surface font-medium`;

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
 * Prev/next carry their own visible text ("← Назад" / "Далі →", the design's
 * own copy) rather than an icon plus a separate `aria-label` — an aria-label
 * that doesn't contain the visible text is a WCAG 2.5.3 accessible-name
 * mismatch (a voice-control user saying "click назад" would fail to match a
 * label that instead read "Попередня сторінка"); an earlier draft of this
 * component had exactly that bug, caught on review before it shipped.
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
      className="font-rg mt-6 flex flex-wrap items-center justify-between gap-4 pt-2"
    >
      {page > 1 ? (
        <Link
          href={galleryPageHref(filters, sort, page - 1)}
          data-testid="pagination-prev"
          className={NAV_BUTTON_AVAILABLE}
        >
          {uk.pagination.prev}
        </Link>
      ) : (
        <span
          aria-hidden="true"
          data-testid="pagination-prev-disabled"
          className={NAV_BUTTON_UNAVAILABLE}
        >
          {uk.pagination.prev}
        </span>
      )}

      <div className="flex flex-wrap items-center justify-center gap-2">
        {items.map((item, index) =>
          item === "ellipsis" ? (
            <span key={`ellipsis-${index}`} aria-hidden="true" className="px-1 text-rg-ink-3">
              …
            </span>
          ) : item === page ? (
            <span
              key={item}
              aria-current="page"
              data-testid="pagination-page"
              data-active="true"
              className={PAGE_PILL_ACTIVE}
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
              className={PAGE_PILL_INACTIVE}
            >
              {item}
            </Link>
          ),
        )}
        {/*
          docs/design/README.md, "Pagination — not infinite scroll": "«з N»
          renders only when the number list is truncated with an ellipsis
          (1 2 3 … 9, з 12) — while every number is on screen the counter
          just restates what you can count." Previously rendered
          unconditionally whenever pagination existed at all (>1 page) —
          repointed: the design value that changed is "always shown" ->
          "shown only when `paginationWindow` actually emits an ellipsis."
        */}
        {truncated && <span className="text-[15px] text-rg-ink-3">{ofTotal}</span>}
      </div>

      {page < totalPages ? (
        <Link
          href={galleryPageHref(filters, sort, page + 1)}
          data-testid="pagination-next"
          className={NAV_BUTTON_AVAILABLE}
        >
          {uk.pagination.next}
        </Link>
      ) : (
        <span
          aria-hidden="true"
          data-testid="pagination-next-disabled"
          className={NAV_BUTTON_UNAVAILABLE}
        >
          {uk.pagination.next}
        </span>
      )}

      {/*
        The footnote that used to sit here («Сторінки, а не безкінечна
        стрічка: у кожної сторінки своя адреса…») is gone — Phase T, critique
        finding D1. It was never part of any mock frame; E3 added it, and the
        comment here previously said removing it "would be a content decision
        this phase isn't making." This is that decision: it was the product
        explaining its own engineering to an adopter who did not arrive
        wondering why the gallery isn't infinite-scroll.

        `filters.railFooter` is the model for what earns a place — it also
        explains a design absence, but aimed at an adopter's real worry (does
        an old listing mean the animal is gone?) rather than at the
        interface's philosophy. It stays.
      */}
    </nav>
  );
}
