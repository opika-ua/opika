"use client";

import { uk } from "@opika/i18n";
import { useCallback, useRef, useState } from "react";
import { generateMockCards } from "../../features/discovery/mock-data";
import { type DeckState, SwipeDeck } from "../../features/discovery/SwipeDeck";

/**
 * Discovery page — the swipe deck.
 *
 * Uses static mock data for now. The real oRPC client wiring is M4/M6.
 */
export default function DiscoveryPage() {
  const allCards = useRef(generateMockCards(30));
  const [deckState, setDeckState] = useState<DeckState>({
    kind: "ready",
    cards: allCards.current,
  });

  const handleSwipe = useCallback((_cardId: string, _direction: "left" | "right") => {
    setDeckState((prev) => {
      if (prev.kind !== "ready") return prev;
      const remaining = prev.cards.slice(1);
      if (remaining.length === 0) {
        return { kind: "exhausted", seenCount: allCards.current.length };
      }
      return { kind: "ready", cards: remaining };
    });
  }, []);

  const handlePrefetch = useCallback(() => {
    // No-op with mock data
  }, []);

  return (
    // max-w-97.5 (390px): without box-border the p-group padding is added
    // *outside* the width and the h-dvh height, so the deck would be
    // 422x876 in a 390x844 viewport. overflow-hidden: the deck is a fixed
    // surface, not a document — nothing here should scroll; if something no
    // longer fits, the harness should say so rather than a scrollbar quietly
    // appearing.
    // Page background only — the header below stays on old tokens
    // deliberately, it's E5's deck-chrome scope (docs/build-plan.md), not
    // V2's. The card/stack/actions below it are what V2 actually re-skins,
    // and they were chosen to read against rg-page (#ECECEA), not the old
    // cream bg-paper-alt (#F4ECDF) this wrapper was still carrying.
    <div className="max-w-97.5 mx-auto h-dvh bg-rg-page flex flex-col p-group box-border overflow-hidden font-sans">
      {/*
        Header. leading-[normal] on both text elements: neither had an
        explicit lineHeight before this migration. `text-xl` alone would
        carry Tailwind's own paired line-height (1.4); the filter button's
        13px text would otherwise inherit Preflight's 1.5 — a real, measured
        difference from the browser's UA "normal", not a cosmetic nit. See
        the longer note by SwipeCard's shelter-line spans.
      */}
      <div className="flex justify-between items-center min-h-11">
        <h1 className="font-serif text-xl leading-[normal] font-medium text-ink m-0">Бровари</h1>
        <button
          type="button"
          className="min-h-11 px-3.5 py-0 rounded-chip border border-line-strong bg-paper font-sans text-[13px] leading-[normal] text-ink-2 cursor-pointer"
        >
          {uk.feed.filtersLabel} · 2
        </button>
      </div>

      <SwipeDeck
        state={deckState}
        onSwipe={handleSwipe}
        onPrefetch={handlePrefetch}
        onRetry={() => setDeckState({ kind: "ready", cards: allCards.current })}
      />
    </div>
  );
}
