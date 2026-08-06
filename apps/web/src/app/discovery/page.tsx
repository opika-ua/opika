"use client";

import { useCallback, useRef, useState } from "react";
import { generateMockCards } from "../../features/discovery/mock-data";
import { type DeckState, SwipeDeck } from "../../features/discovery/SwipeDeck";
import { uk } from "../../features/discovery/strings.uk";
import { color } from "../../features/discovery/tokens";

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
    <div
      style={{
        maxWidth: 390,
        margin: "0 auto",
        height: "100dvh",
        background: color.paperAlt,
        display: "flex",
        flexDirection: "column",
        padding: 16,
        // Without this the 16px padding is added *outside* the 390px width and
        // the 100dvh height, so the deck is 422x876 in a 390x844 viewport.
        boxSizing: "border-box",
        // The deck is a fixed surface, not a document. Nothing here should
        // scroll; if something no longer fits, the harness should say so
        // rather than a scrollbar quietly appearing.
        overflow: "hidden",
        fontFamily: "'Commissioner', sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          minHeight: 44,
        }}
      >
        <h1
          style={{
            fontFamily: "'Literata', serif",
            fontSize: 20,
            fontWeight: 500,
            color: color.ink,
            margin: 0,
          }}
        >
          Бровари
        </h1>
        <button
          type="button"
          style={{
            minHeight: 44,
            padding: "0 14px",
            borderRadius: 999,
            border: `1px solid ${color.lineStrong}`,
            background: color.paper,
            fontFamily: "'Commissioner', sans-serif",
            fontSize: 13,
            color: color.ink2,
            cursor: "pointer",
          }}
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
