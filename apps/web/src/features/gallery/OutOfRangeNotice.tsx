import type { FeedFilters, GallerySort } from "@opika/domain";
import { uk } from "@opika/i18n";
import { Panel } from "../../ui/Panel";
import { Text } from "../../ui/Text";
import { TextLink } from "../../ui/TextLink";
import type { CitySlugsById } from "./filter-url";
import { galleryPageHref } from "./filter-url";

/**
 * E4, `docs/design/README.md`'s "Out-of-range page (P1/P2)": `?stor=50`
 * against a 10-page result set returns the last page with HTTP 200, not a
 * 404 or a silent redirect - this is the visible half of that decided
 * behaviour. `gallery.list`'s own clamp (E0, `packages/db/src/repos/
 * gallery-repo.ts`) already resolves the served page server-side; this
 * component only renders when the caller (`page.tsx`) detects the
 * requested page and the resolved page differ.
 *
 * An underlined text link (navigation, not an operation - a link, never a
 * `<button>`), and the layout split the mock's two frames don't share: P1 (desktop, `Opika Registry Frames.dc.html`) is a row -
 * `align-items: center; gap: 16px; padding: 16px 20px` - text block and
 * link side by side; P2 (mobile) is a column - `gap: 8px; padding: 16px`
 * - all three lines stacked, link included. Renders server-side, no
 * client component needed - this is the one E4 state that works with JS
 * disabled (`docs/gallery-contract-decisions.md`'s JS-only-paths note).
 */
export function OutOfRangeNotice({
  requestedPage,
  totalPages,
  filters,
  sort,
  citySlugs,
}: {
  requestedPage: number;
  totalPages: number;
  filters: FeedFilters;
  sort: GallerySort;
  citySlugs: CitySlugsById;
}) {
  return (
    <Panel
      tone="sunken"
      className="mb-4 flex flex-col gap-2 desktop:flex-row desktop:items-center desktop:gap-4"
    >
      <div
        role="status"
        aria-live="polite"
        data-testid="gallery-out-of-range-notice"
        className="flex flex-col gap-1 desktop:flex-1"
      >
        <Text as="span" look="label">
          {uk.outOfRangePage.notFound
            .replace("{requested}", String(requestedPage))
            .replace("{total}", String(totalPages))}
        </Text>
        <Text as="span" look="body" className="text-ink-2">
          {uk.outOfRangePage.showingLast.replace("{total}", String(totalPages))}
        </Text>
      </div>
      <TextLink href={galleryPageHref(filters, sort, 1, citySlugs)}>
        {uk.outOfRangePage.backToFirst}
      </TextLink>
    </Panel>
  );
}
