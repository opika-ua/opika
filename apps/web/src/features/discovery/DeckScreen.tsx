"use client";

import { DEFAULT_GALLERY_SORT, type FeedFilters } from "@opika/domain";
import { uk } from "@opika/i18n";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { galleryHref } from "../gallery/filter-url";
import { SwipeDeck } from "./SwipeDeck";
import { useFeedDeck } from "./use-feed-deck";

/**
 * Set by the gallery's own entry link (`page.tsx`'s "Гортати по одні"/
 * "Гортати") right before it navigates — read once here to tell "the user
 * just came from the gallery, in this tab" apart from "this route was
 * reached directly" (a reload, a bookmark, a shared link). `sessionStorage`,
 * not a URL param: it needs to survive exactly one navigation and be gone
 * after, which a query string doesn't do on its own.
 */
const FROM_GALLERY_KEY = "opika:deck-entered-from-gallery";

export function markEnteringFromGallery(): void {
  sessionStorage.setItem(FROM_GALLERY_KEY, "1");
}

/**
 * docs/design/README.md, "Gallery ↔ deck": "«До списку», Esc, or browser
 * back — all three identical." Literal history-back is what makes that
 * true for free, including "the gallery reopens on the same page and
 * scrolls instantly to the animal you stopped on" — the browser's own
 * scroll restoration already does that for a same-tab back navigation, no
 * manual scroll bookkeeping needed.
 *
 * `router.back()` is only safe when `FROM_GALLERY_KEY` says this tab's
 * history actually has the gallery one step behind — otherwise it could
 * leave the app entirely (whatever this tab's history held before Opika
 * ever loaded). The fallback is a freshly-built gallery link from the
 * filters this route was given; it can't restore a scroll position that
 * was never established in this tab to begin with, so it doesn't try to.
 */
function useDeckExit(filters: FeedFilters) {
  const router = useRouter();
  const [cameFromGallery, setCameFromGallery] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(FROM_GALLERY_KEY)) {
      sessionStorage.removeItem(FROM_GALLERY_KEY);
      setCameFromGallery(true);
    }
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
  const showPosition = total !== null && state.kind !== "error";

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

        {showPosition && (
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <span data-testid="deck-position" className="text-[12px] text-rg-ink-3">
              {total !== null ? `${position} з ${total}` : position}
            </span>
            <div
              aria-hidden="true"
              className="h-1.5 w-20 overflow-hidden rounded-full bg-rg-fill-strong"
            >
              <div
                className="h-full bg-rg-ink"
                style={{ width: `${total ? Math.min(100, (position / total) * 100) : 0}%` }}
              />
            </div>
          </div>
        )}
      </header>

      {/* docs/design/README.md's own polite announcement on entry — fires
          once per mount, not per swipe (SwipeDeck's action buttons already
          move focus/DOM in a way a live region re-announcing every card
          would talk over). */}
      {total !== null && (
        <span role="status" aria-live="polite" className="sr-only">
          {uk.feed.deckEntryAnnouncement
            .replace("{position}", String(position))
            .replace("{total}", String(total))}
        </span>
      )}

      <SwipeDeck state={state} onSwipe={onSwipe} onPrefetch={onPrefetch} onRetry={onRetry} />
    </div>
  );
}
