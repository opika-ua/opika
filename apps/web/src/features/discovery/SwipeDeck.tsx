"use client";

import type { FeedCardView } from "@opika/contracts";
import { useCallback, useState } from "react";
import { SwipeCard } from "./SwipeCard.js";
import { uk } from "./strings.uk.js";
import { color, layout, radius } from "./tokens.js";
import { useSwipeGesture } from "./use-swipe-gesture.js";

/** Number of cards remaining that triggers a prefetch. */
const PREFETCH_THRESHOLD = 5;

export type DeckState =
  | { kind: "loading" }
  | { kind: "ready"; cards: FeedCardView[] }
  | { kind: "exhausted"; seenCount: number }
  | { kind: "error"; message: string };

interface SwipeDeckProps {
  state: DeckState;
  onSwipe: (cardId: string, direction: "left" | "right") => void;
  onPrefetch: () => void;
  onCardTap?: ((cardId: string) => void) | undefined;
  onRetry?: (() => void) | undefined;
}

export function SwipeDeck({ state, onSwipe, onPrefetch, onCardTap, onRetry }: SwipeDeckProps) {
  const [dx, setDx] = useState(0);

  const handleCommit = useCallback(
    (direction: "left" | "right") => {
      if (state.kind !== "ready" || state.cards.length === 0) return;
      const topCard = state.cards[0];
      if (!topCard) return;
      onSwipe(topCard.id, direction);
      setDx(0);

      // Check if we need to prefetch
      if (state.cards.length - 1 <= PREFETCH_THRESHOLD) {
        onPrefetch();
      }
    },
    [state, onSwipe, onPrefetch],
  );

  const handleSnapBack = useCallback(() => {
    setDx(0);
  }, []);

  const { cardRef } = useSwipeGesture({
    onDrag: setDx,
    onCommit: handleCommit,
    onSnapBack: handleSnapBack,
  });

  if (state.kind === "loading") {
    return <LoadingState />;
  }

  if (state.kind === "error") {
    return <ErrorState onRetry={onRetry} />;
  }

  if (state.kind === "exhausted") {
    return <ExhaustedState seenCount={state.seenCount} />;
  }

  if (state.cards.length === 0) {
    return <ExhaustedState seenCount={0} />;
  }

  // Show up to 3 stack layers
  const visibleCards = state.cards.slice(0, layout.stackLayers);

  return (
    <div
      style={{
        position: "relative",
        flex: 1,
        marginTop: 16,
      }}
    >
      {/* Render back-to-front so the top card is last in DOM (highest z-index) */}
      {visibleCards
        .slice()
        .reverse()
        .map((card, reverseIdx) => {
          const stackIndex = visibleCards.length - 1 - reverseIdx;
          return (
            <SwipeCard
              key={card.id}
              card={card}
              gestureRef={stackIndex === 0 ? cardRef : () => {}}
              dx={stackIndex === 0 ? dx : 0}
              stackIndex={stackIndex}
              onTap={stackIndex === 0 ? () => onCardTap?.(card.id) : undefined}
            />
          );
        })}

      {/* Action buttons */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          display: "flex",
          gap: 8,
          zIndex: 10,
        }}
      >
        <ActionButton
          label={uk.actions.notNow}
          variant="outlined"
          style={{ flex: 1 }}
          onClick={() => handleCommit("left")}
        />
        <ActionButton
          label={uk.actions.next}
          variant="outlined"
          style={{ width: 52 }}
          onClick={() => handleCommit("left")}
        />
        <ActionButton
          label={uk.actions.write}
          variant="primary"
          style={{ flex: 1 }}
          onClick={() => handleCommit("right")}
        />
      </div>
    </div>
  );
}

// --- Sub-components ---

function ActionButton({
  label,
  variant,
  style,
  onClick,
}: {
  label: string;
  variant: "outlined" | "primary";
  style?: React.CSSProperties;
  onClick: () => void;
}) {
  const base: React.CSSProperties = {
    minHeight: layout.actionHeight,
    borderRadius: radius.button,
    fontFamily: "'Commissioner', sans-serif",
    fontSize: 14,
    lineHeight: "1",
    cursor: "pointer",
    border: "none",
    ...style,
  };

  if (variant === "primary") {
    return (
      <button
        type="button"
        style={{
          ...base,
          background: color.leaf,
          color: color.paper,
          fontWeight: 400,
        }}
        onClick={onClick}
      >
        {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      style={{
        ...base,
        background: color.paper,
        color: color.ink3,
        border: `1px solid ${color.lineStrong}`,
        fontWeight: 400,
      }}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function LoadingState() {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Commissioner', sans-serif",
        fontSize: 14,
        color: color.ink3,
      }}
    >
      {/* Simple loading indicator */}
      <div
        style={{
          width: 24,
          height: 24,
          borderRadius: "50%",
          border: `2px solid ${color.lineStrong}`,
          borderTopColor: color.leaf,
          animation: "spin 0.8s linear infinite",
        }}
      />
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry?: (() => void) | undefined }) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: 24,
      }}
    >
      <div
        style={{
          background: color.paper,
          borderRadius: radius.card,
          border: `1px solid ${color.lineStrong}`,
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          width: "100%",
          maxWidth: 358,
        }}
      >
        <div
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 11,
            letterSpacing: "0.12em",
            color: color.ink3,
            fontWeight: 500,
          }}
        >
          {uk.errors.loadFailed.eyebrow}
        </div>
        <div
          style={{
            fontFamily: "'Literata', serif",
            fontSize: 17,
            lineHeight: "24.65px",
            color: color.ink,
          }}
        >
          {uk.errors.loadFailed.title}
        </div>
        <div
          style={{
            fontFamily: "'Commissioner', sans-serif",
            fontSize: 13,
            color: color.ink2,
          }}
        >
          {uk.errors.loadFailed.body}
        </div>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            style={{
              minHeight: layout.minTouchTarget,
              borderRadius: radius.button,
              border: `1px solid ${color.lineStrong}`,
              background: color.paper,
              fontFamily: "'Commissioner', sans-serif",
              fontSize: 14,
              color: color.ink2,
              cursor: "pointer",
              marginTop: 8,
            }}
          >
            {uk.errors.loadFailed.action}
          </button>
        )}
      </div>
    </div>
  );
}

function ExhaustedState(_props: { seenCount: number }) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        padding: 24,
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: "'Literata', serif",
          fontWeight: 500,
          fontSize: 26,
          lineHeight: "30px",
          color: color.ink,
        }}
      >
        {uk.exhausted.title}
      </div>
      <div
        style={{
          fontFamily: "'Commissioner', sans-serif",
          fontSize: 15,
          lineHeight: "23px",
          color: color.ink2,
        }}
      >
        {uk.exhausted.body}
      </div>
      <div
        style={{
          fontFamily: "'Commissioner', sans-serif",
          fontSize: 14,
          color: color.ink3,
        }}
      >
        {uk.exhausted.newAnimals}
      </div>
    </div>
  );
}
