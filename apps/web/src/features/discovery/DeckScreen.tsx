"use client";

import type { FeedCardView } from "@opika/contracts";
import { DEFAULT_GALLERY_SORT, type FeedFilters } from "@opika/domain";
import { uk } from "@opika/i18n";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { REGISTRY_HAS_NO_REAL_SHELTERS } from "../../seo-flags";
import { galleryHref } from "../gallery/filter-url";
import { RevealDialog } from "../reveal/RevealDialog";
import { useRevealFlow } from "../reveal/use-reveal-flow";
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
  const { state, onSwipe, onPrefetch, onRetry, shownCount, hasActiveSeenSet } =
    useFeedDeck(filters);
  const exit = useDeckExit(filters);

  // Gesture parity's own trigger ref: there is no single button behind a
  // drag-committed reveal the way the detail page's `RevealFlow` has one,
  // so focus returns to the header's always-present "back to list" control
  // on close rather than nowhere. `useRevealFlow`'s `close()` no-ops on a
  // null ref regardless, so this degrades safely if the header is ever
  // restructured to drop it.
  const backToListRef = useRef<HTMLButtonElement | null>(null);
  const {
    state: revealState,
    isOpen: revealIsOpen,
    reveal,
    close: closeReveal,
    headingRef,
    dialogRef,
  } = useRevealFlow(backToListRef);
  // Captured at commit time, not read from `state.cards[0]`: `onSwipe`
  // (called the same tick as `onReveal` below) advances the deck
  // synchronously, so by the time the dialog renders the committed card is
  // already gone from `state`.
  const [revealTarget, setRevealTarget] = useState<{ id: FeedCardView["id"]; name: string } | null>(
    null,
  );
  const onReveal = useCallback(
    (card: FeedCardView) => {
      setRevealTarget({ id: card.id, name: card.name });
      reveal(card.id);
    },
    [reveal],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // The design's own keyboard table ("Esc — close the sheet, the
      // contact modal, or leave the deck") means one Esc closes whichever
      // is topmost, not all of them at once — with the reveal dialog open,
      // this handler must yield to `useRevealFlow`'s own Escape listener
      // rather than exiting the deck out from under it.
      if (event.key === "Escape" && !revealIsOpen) exit();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [exit, revealIsOpen]);

  const position = Math.min(shownCount + 1, total ?? Number.POSITIVE_INFINITY);
  // Only "ready" has a real card to number — during "loading" no fetch has
  // resolved yet (there is nothing to confirm position 1 even exists), and
  // "exhausted" has already told the user, in its own words, that there is
  // nothing left; numbering a card past the last one there is a genuine
  // off-by-one, not a rounding choice.
  //
  // `!hasActiveSeenSet` (Oleksii's resolution to R1's STOP,
  // `docs/build-plan.md`, Phase R, 2026-09-09): `total` comes from the
  // *gallery's* unfiltered count, which has no seen-set exclusion — once
  // this device has skipped or written about anything, the deck itself may
  // no longer be able to reach `total` cards, and a header still promising
  // it would be a number the deck can't honour. Suppressed only once
  // there's something to exclude, not for every visitor with a session —
  // a first-time visitor keeps the count the design specifies.
  const showPosition = total !== null && state.kind === "ready" && !hasActiveSeenSet;

  const showDemoBanner = REGISTRY_HAS_NO_REAL_SHELTERS;

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
      {/*
        `min-h-12` (48), not `min-h-11` (44): docs/design/README.md:200 sets 48
        as the minimum touch target *anywhere* and calls it a civic-trust
        metric rather than the WCAG floor. Phase T fixed the same defect on the
        detail page; a Phase D sweep found this one plus the gallery's mobile
        deck entry and the deck error state's retry button.

        Deliberately landed AFTER DECK-1 and as its own commit. Before DECK-1
        this cost 4px of a shelter-line margin that had none — it clipped 360
        outright. Now it costs 4px of photo, which is bounded, measured (the
        table in `SwipeCard.tsx`'s photo-area comment), and exactly what the
        elastic photo exists to absorb. Same 4px; the difference is what pays
        for it. The one frame where the photo cannot pay is 390x844, where it
        sits at its `max-h-99` ceiling — there the 4px comes off the
        shelter-line margin instead, 20 -> 16, still clear of that viewport's
        floor of 12.

        The header's own floor follows the button rather than leading it — a
        44px floor under a 48px child was already doing nothing.
      */}
      <header className="font-rg flex items-center gap-3 min-h-12">
        <button
          ref={backToListRef}
          type="button"
          onClick={exit}
          data-testid="deck-back-to-list"
          className="min-h-12 inline-flex items-center gap-2 shrink-0 rounded-rg-button bg-rg-fill px-4 text-[13px] font-medium text-rg-ink focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px]"
        >
          {uk.feed.backToList}
        </button>

        {/**
         * D-1 (Oleksii, Phase D decisions): the demo notice replaces only
         * `filtersLabel` — the position count stays, because demo mode is
         * the entire testing period and a deck missing the count for weeks
         * is not the deck being tested. The progress bar degrades instead
         * (see its own comment below) to give the short demo label the
         * width it needs. Same slot, same styling as the real
         * `filtersLabel` it stands in for.
         */}
        {showDemoBanner ? (
          <span
            data-testid="deck-demo-banner"
            className="truncate text-[13px] leading-[normal] text-rg-ink-2"
          >
            {uk.demo.deckLabel}
          </span>
        ) : (
          filtersLabel && (
            <span
              data-testid="deck-filters-label"
              className="truncate text-[13px] leading-[normal] text-rg-ink-2"
            >
              {filtersLabel}
            </span>
          )
        )}

        {showPosition && total !== null && (
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <span data-testid="deck-position" className="text-[12px] text-rg-ink-3">
              {position} з {total}
            </span>
            {/**
             * Degrade order (Oleksii, Phase D decisions): if the demo label
             * doesn't fit alongside the back link and the count, the bar
             * goes first — the count alone already answers
             * README.md:597-600's "otherwise invisible" argument, the bar
             * only duplicates it. Measured (not a fixed breakpoint,
             * deliberately): the bar's own 80px + gap costs more room than
             * any viewport in this app's supported range gains by being
             * wider, so keeping it at some widths and not others would cost
             * the banner *more* space at the wider ones, not less — hidden
             * unconditionally whenever the demo banner is showing, visible
             * whenever the real `filtersLabel` is (unaffected).
             */}
            <div
              aria-hidden="true"
              data-testid="deck-progress-bar"
              className={`h-1.5 w-20 overflow-hidden rounded-full bg-rg-fill-strong ${
                showDemoBanner ? "hidden" : "block"
              }`}
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

      <SwipeDeck
        state={state}
        onSwipe={onSwipe}
        onPrefetch={onPrefetch}
        onRetry={onRetry}
        onReveal={onReveal}
      />

      {revealIsOpen && revealTarget && (
        <RevealDialog
          state={revealState}
          animalName={revealTarget.name}
          // No resolved city name is available client-side here —
          // `FeedCardView.publicLocation` carries only a `cityId`, and the
          // deck has no city lookup the way the gallery's server-rendered
          // props do. Disclosed simplification, not an oversight:
          // `RevealDialog`'s own `cityName={null}` path already renders
          // correctly (the location line falls back to the meeting-place
          // sentence alone) rather than needing a special case here.
          cityName={null}
          headingRef={headingRef}
          dialogRef={dialogRef}
          onClose={closeReveal}
          onRetry={() => reveal(revealTarget.id)}
          showBackLink={false}
        />
      )}
    </div>
  );
}
