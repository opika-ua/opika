import type { FeedFilters, GallerySort } from "@opika/domain";
import { uk } from "@opika/i18n";
import Link from "next/link";
import { galleryPageHref } from "./filter-url";

/**
 * E4, `docs/design/README.md`'s "Out-of-range page (P1/P2)": `?stor=50`
 * against a 10-page result set returns the last page with HTTP 200, not a
 * 404 or a silent redirect — this is the visible half of that decided
 * behaviour. `gallery.list`'s own clamp (E0, `packages/db/src/repos/
 * gallery-repo.ts`) already resolves the served page server-side; this
 * component only renders when the caller (`page.tsx`) detects the
 * requested page and the resolved page differ.
 *
 * `#F2F2F0` fill / radius 16 / two 15px lines / an underlined text link
 * (navigation, not an operation — a `<Link>`, never a `<button>`) are the
 * mock's own literal values, and so is the layout split the frames don't
 * share: P1 (desktop, `Opika Registry Frames.dc.html`) is a row —
 * `align-items: center; gap: 16px; padding: 16px 20px` — text block and
 * link side by side; P2 (mobile) is a column — `gap: 8px; padding: 16px`
 * — all three lines stacked, link included. Renders server-side, no
 * client component needed — this is the one E4 state that works with JS
 * disabled (`docs/gallery-contract-decisions.md`'s JS-only-paths note).
 */
export function OutOfRangeNotice({
  requestedPage,
  totalPages,
  filters,
  sort,
}: {
  requestedPage: number;
  totalPages: number;
  filters: FeedFilters;
  sort: GallerySort;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="gallery-out-of-range-notice"
      className="font-rg bg-rg-fill rounded-rg-button p-4 desktop:py-4 desktop:px-5 flex flex-col gap-2 desktop:flex-row desktop:items-center desktop:gap-4 mb-4"
    >
      <div className="flex flex-col gap-1 desktop:flex-1">
        <span className="text-[15px]/[22px] font-medium text-rg-ink">
          {uk.outOfRangePage.notFound
            .replace("{requested}", String(requestedPage))
            .replace("{total}", String(totalPages))}
        </span>
        <span className="text-[15px]/[22px] text-rg-ink-2">
          {uk.outOfRangePage.showingLast.replace("{total}", String(totalPages))}
        </span>
      </div>
      <Link
        href={galleryPageHref(filters, sort, 1)}
        className="text-[15px] text-rg-ink underline underline-offset-2 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px]"
      >
        {uk.outOfRangePage.backToFirst}
      </Link>
    </div>
  );
}
