"use client";

import { DEFAULT_GALLERY_SORT, type FeedFilters } from "@opika/domain";
import { uk } from "@opika/i18n";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { galleryHref } from "../gallery/filter-url";
import { consumeEnteredFromGalleryMarker } from "./deck-entry-marker";
import { SwipeDeck } from "./SwipeDeck";
import { useFeedDeck } from "./use-feed-deck";

/**
 * docs/design/README.md, "Gallery ↔ deck": "«До списку», Esc, or browser
 * back — all three identical." Literal history-back is what makes that
 * true for free, including "the gallery reopens on the same page and
 * scrolls instantly to the animal you stopped on" — the browser's own
 * scroll restoration already does that for a same-tab back navigation, no
 * manual scroll bookkeeping needed.
 *
 * `router.back()` is only safe when `consumeEnteredFromGalleryMarker()` says
 * this tab's history actually has the gallery one step behind — otherwise
 * it could leave the app entirely (whatever this tab's history held before
 * Opika ever loaded). The fallback is a freshly-built gallery link from the
 * filters this route was given; it can't restore a scroll position that
 * was never established in this tab to begin with, so it doesn't try to.
 */
function useDeckExit(filters: FeedFilters) {
  const router = useRouter();
  const [cameFromGallery, setCameFromGallery] = useState(false);

  useEffect(() => {
    if (consumeEnteredFromGalleryMarker()) setCameFromGallery(true);
  }, []);

  const exit = useCallback(() => {
    if (cameFromGallery) {
      router.back();
    } else {
      router.push(galleryHref(filters, DEFAULT_GALLERY_SORT));
    }
  }, [cameFromGallery, router, filters]);

  return exit;
}

export function DeckScreen({
  filters,
  total,
  filtersLabel,
}: {
  filters: FeedFilters;
  total: number | null;
  filtersLabel: string | null;
}) {
  const { state, onSwipe, onPrefetch, onRetry, shownCount } = useFeedDeck(filters);
  const exit = useDeckExit(filters);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") exit();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [exit]);

  const position = Math.min(shownCount + 1, total ?? Number.POSITIVE_INFINITY);
  // Only "ready" has a real card to number — during "loading" no fetch has
  // resolved yet (there is nothing to confirm position 1 even exists), and
  // "exhausted" has already told the user, in its own words, that there is
  // nothing left; numbering a card past the last one there is a genuine
  // off-by-one, not a rounding choice.
  const showPosition = total !== null && state.kind === "ready";

  /**
   * Frozen at mount, not derived from `position` — docs/design/README.md's
   * own announcement is specifically about *entering* the deck ("Режим по
   * одній. Тварина 1 з N"), not a running commentary. A live region whose
   * text changes on every swipe re-announces on every swipe (`aria-live`'s
   * whole contract), talking over `SwipeDeck`'s own focus/DOM changes on
   * commit — confirmed by rendering and swiping, not assumed. The lazy
   * initializer runs once; `total` from props is enough to write "1 з N"
   * without waiting for the first fetch to resolve.
   */
  const [entryAnnouncement] = useState(() =>
    total !== null
      ? uk.feed.deckEntryAnnouncement.replace("{position}", "1").replace("{total}", String(total))
      : null,
  );

  return (
    // Same outer shape as the /discovery wrapper it replaces (max-w-97.5,
    // h-dvh, p-group, box-border, overflow-hidden, font-sans) — the
    // discovery-layout/gesture harnesses were measured against exactly
    // this box and are migrated to this route, not rewritten, in the same
    // phase. font-rg is scoped to the new header below, not this wrapper,
    // so it can't shift the geometry those harnesses assert on.
    <div className="max-w-97.5 mx-auto h-dvh bg-rg-page flex flex-col p-group box-border overflow-hidden font-sans">
      <header className="font-rg flex items-center gap-3 min-h-11">
        <button
          type="button"
          onClick={exit}
          data-testid="deck-back-to-list"
          className="min-h-11 inline-flex items-center gap-2 shrink-0 rounded-rg-button bg-rg-fill px-4 text-[13px] font-medium text-rg-ink focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px]"
        >
          {uk.feed.backToList}
        </button>

        {filtersLabel && (
          <span
            data-testid="deck-filters-label"
            className="truncate text-[13px] leading-[normal] text-rg-ink-2"
          >
            {filtersLabel}
          </span>
        )}

        {showPosition && total !== null && (
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <span data-testid="deck-position" className="text-[12px] text-rg-ink-3">
              {position} з {total}
            </span>
            <div
              aria-hidden="true"
              className="h-1.5 w-20 overflow-hidden rounded-full bg-rg-fill-strong"
            >
              <div
                className="h-full bg-rg-ink"
                style={{ width: `${Math.min(100, (position / total) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </header>

      {/* docs/design/README.md's own polite announcement on entry — see
          `entryAnnouncement`'s own comment for why its text never changes
          after mount. */}
      {entryAnnouncement && (
        <span role="status" aria-live="polite" className="sr-only">
          {entryAnnouncement}
        </span>
      )}

      <SwipeDeck state={state} onSwipe={onSwipe} onPrefetch={onPrefetch} onRetry={onRetry} />
    </div>
  );
}
