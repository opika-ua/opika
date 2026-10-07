"use client";

import { type CityId, DEFAULT_GALLERY_SORT, type FeedFilters } from "@opika/domain";
import { uk } from "@opika/i18n";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { REGISTRY_HAS_NO_REAL_SHELTERS } from "../../seo-flags";
import type { CitySlugsById } from "../gallery/filter-url";
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
function useDeckExit(filters: FeedFilters, citySlugs: CitySlugsById) {
  const router = useRouter();
  const [cameFromGallery, setCameFromGallery] = useState(false);

  useEffect(() => {
    if (consumeEnteredFromGalleryMarker()) setCameFromGallery(true);
  }, []);

  const exit = useCallback(() => {
    if (cameFromGallery) {
      router.back();
    } else {
      router.push(galleryHref(filters, DEFAULT_GALLERY_SORT, citySlugs));
    }
  }, [cameFromGallery, router, filters, citySlugs]);

  return exit;
}

export function DeckScreen({
  filters,
  total,
  filtersLabel,
  citySlugs,
  cityNames = {},
}: {
  filters: FeedFilters;
  total: number | null;
  filtersLabel: string | null;
  citySlugs: CitySlugsById;
  /**
   * R3 (Phase R, `docs/build-plan.md`): the same lookup `GortatyPage`
   * already builds for its own `filtersInWords` call, handed down so the
   * deck's own reveal (`SwipeDeck.tsx`) can name a real city instead of
   * omitting one. Optional, defaulting to empty — `ContactRevealDialog`
   * already degrades gracefully for a city it can't resolve, and most of
   * this component's own tests exercise something unrelated to city
   * names, so an empty lookup there is a deliberate "not this test's
   * concern," not a silently missing prop.
   */
  cityNames?: Record<CityId, string>;
}) {
  const { state, onSwipe, onPrefetch, onRetry, shownCount, reachableCount, ensureSession } =
    useFeedDeck(filters);
  const exit = useDeckExit(filters, citySlugs);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") exit();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [exit]);

  /**
   * The total this feed started with (R5). `feed.list`'s `reachableCount`
   * when the fetch that started the feed had a session — the seen-set
   * excluded, scoped to these filters. Otherwise the gallery's own `total`,
   * which is honest exactly then: with no session, nothing was excluded.
   * Either way a snapshot the header counts `shownCount` up toward, never
   * re-derived per swipe (`use-feed-deck.ts`'s `reachableCount` comment).
   */
  const effectiveTotal = reachableCount ?? total;
  const position = Math.min(shownCount + 1, effectiveTotal ?? Number.POSITIVE_INFINITY);
  // Only "ready" has a real card to number — during "loading" no fetch has
  // resolved yet (there is nothing to confirm position 1 even exists), and
  // "exhausted" has already told the user, in its own words, that there is
  // nothing left; numbering a card past the last one there is a genuine
  // off-by-one, not a rounding choice.
  //
  // A total of 0 alongside a card on screen is only reachable through the
  // count racing the page (two statements, not one snapshot — R5's drift
  // list); «0 з 0» and a NaN-width bar would be worse than no number.
  const showPosition = effectiveTotal !== null && effectiveTotal > 0 && state.kind === "ready";

  const showDemoBanner = REGISTRY_HAS_NO_REAL_SHELTERS;

  /**
   * Written once per mount, on the first "ready" state, and never again —
   * docs/design/README.md's own announcement is specifically about
   * *entering* the deck ("Режим по одній. Тварина 1 з N"), not a running
   * commentary. A live region whose text changes on every swipe
   * re-announces on every swipe (`aria-live`'s whole contract), talking over
   * `SwipeDeck`'s own focus/DOM changes on commit — confirmed by rendering
   * and swiping, not assumed.
   *
   * On the first "ready", not at mount (R5): the honest N is `effectiveTotal`,
   * which needs the first fetch. Written at mount from the gallery's total,
   * it promised a returning visitor a number their seen-set had already
   * made unreachable — the overstatement R1 removed from the header and
   * left in here. When there is no total, nothing is announced at all,
   * exactly as before — never a variant of the sentence without a number.
   */
  const [entryAnnouncement, setEntryAnnouncement] = useState<string | null>(null);
  const announcedRef = useRef(false);
  useEffect(() => {
    if (announcedRef.current || state.kind !== "ready") return;
    announcedRef.current = true;
    if (effectiveTotal !== null && effectiveTotal > 0) {
      setEntryAnnouncement(
        uk.feed.deckEntryAnnouncement
          .replace("{position}", "1")
          .replace("{total}", String(effectiveTotal)),
      );
    }
  }, [state.kind, effectiveTotal]);

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

        {showPosition && effectiveTotal !== null && (
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <span data-testid="deck-position" className="text-[12px] text-rg-ink-3">
              {position} з {effectiveTotal}
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
                style={{ width: `${Math.min(100, (position / effectiveTotal) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </header>

      {/* docs/design/README.md's own polite announcement on entry — see
          `entryAnnouncement`'s own comment for why its text is written once.
          The region itself is always present, empty until then: a live
          region inserted already holding its text is announced less
          reliably than one whose text arrives after it exists. */}
      <span role="status" aria-live="polite" className="sr-only">
        {entryAnnouncement}
      </span>

      <SwipeDeck
        state={state}
        onSwipe={onSwipe}
        onPrefetch={onPrefetch}
        onRetry={onRetry}
        ensureSession={ensureSession}
        cityNames={cityNames}
      />
    </div>
  );
}
