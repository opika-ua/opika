"use client";

import type { FeedCardView } from "@opika/contracts";
import { useCallback, useState } from "react";
import { SwipeCard } from "./SwipeCard";
import { uk } from "./strings.uk";
import { layout } from "./tokens";
import { useSwipeGesture } from "./use-swipe-gesture";

/** Number of cards remaining that triggers a prefetch. */
const PREFETCH_THRESHOLD = 5;

/**
 * Placeholder ref for the non-interactive stack layers.
 *
 * Nothing is attached to it today: `SwipeCard` ignores `gestureRef` entirely
 * for `stackIndex > 0`, rendering those layers as an inert `aria-hidden` div.
 * It is module-level rather than an inline `() => {}` so that if a stack layer
 * ever does take a ref, its identity is already stable and it cannot turn into
 * the per-frame detach/re-attach churn the gesture hook was just fixed for.
 */
const noopRef = (): void => {};

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
    // A column: the card stack takes the space that is left, and the action
    // row sits beneath it. The row used to be `position: absolute; bottom: 0`
    // inside the stack container, which put it *on top of* the card and over
    // the shelter line — invisible to any check that reads the markup, since
    // both elements are present and correct in the DOM.
    <div className="flex-1 flex flex-col mt-group min-h-0">
      {/* min-h-0: flex items default to min-height:auto, which lets the stack
          refuse to shrink and push the action row back off the bottom of the
          screen. */}
      <div className="relative flex-1 min-h-0">
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
                gestureRef={stackIndex === 0 ? cardRef : noopRef}
                dx={stackIndex === 0 ? dx : 0}
                stackIndex={stackIndex}
                onTap={stackIndex === 0 ? () => onCardTap?.(card.id) : undefined}
              />
            );
          })}
      </div>

      {/* Action buttons */}
      <div data-testid="action-row" className="flex gap-row mt-group shrink-0">
        <ActionButton
          label={uk.actions.notNow}
          variant="outlined"
          className="flex-1"
          onClick={() => handleCommit("left")}
        />
        <ActionButton
          label={uk.actions.next}
          variant="outlined"
          className="w-13"
          onClick={() => handleCommit("left")}
        />
        <ActionButton
          label={uk.actions.write}
          variant="primary"
          className="flex-1"
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
  className,
  onClick,
}: {
  label: string;
  variant: "outlined" | "primary";
  className?: string;
  onClick: () => void;
}) {
  // No border utility here at all — Preflight zeroes border-width by
  // default, so the primary variant (which adds none) renders with no
  // visible border, exactly matching the original inline `border: "none"`.
  const base = "min-h-13 rounded-button font-sans text-sm leading-none cursor-pointer";

  if (variant === "primary") {
    return (
      <button
        type="button"
        className={`${base} bg-leaf text-paper font-normal ${className ?? ""}`}
        onClick={onClick}
      >
        {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`${base} bg-paper text-ink-3 border border-line-strong font-normal ${className ?? ""}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function LoadingState() {
  return (
    <div className="flex-1 flex items-center justify-center font-sans text-sm leading-[normal] text-ink-3">
      {/* Simple loading indicator. 0.8s, not Tailwind's built-in 1s
          `animate-spin` — see `--animate-spin-fast` in globals.css. */}
      <div className="size-6 rounded-full border-2 border-line-strong border-t-leaf animate-spin-fast" />
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry?: (() => void) | undefined }) {
  // `leading-[normal]` below (eyebrow, body, the retry button): none of
  // these three had an explicit `lineHeight` before this migration, so they
  // rendered at the browser's UA-computed "normal", not a specific pixel
  // value and not Tailwind Preflight's inherited `line-height: 1.5` either
  // — see the longer note by SwipeCard's shelter-line spans. Title keeps its
  // explicit 24.65px pairing; that one was pinned in the original too.
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-group p-section">
      <div className="bg-paper rounded-card border border-line-strong p-group flex flex-col gap-row w-full max-w-89.5">
        {/* font-sans, not font-mono: IBM Plex Mono was measured and
            dropped for costing 11.2% of the page's font payload to style
            one label on a screen most sessions never see — see fonts.ts.
            tracking-[0.12em] carries the "eyebrow" identity on its own;
            the source string is already uppercase. */}
        <div className="font-sans text-[11px] leading-[normal] tracking-[0.12em] text-ink-3 font-medium">
          {uk.errors.loadFailed.eyebrow}
        </div>
        <div className="font-serif text-[17px]/[24.65px] text-ink">
          {uk.errors.loadFailed.title}
        </div>
        <div className="font-sans text-[13px] leading-[normal] text-ink-2">
          {uk.errors.loadFailed.body}
        </div>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="min-h-11 rounded-button border border-line-strong bg-paper font-sans text-sm leading-[normal] text-ink-2 cursor-pointer mt-row"
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
    <div className="flex-1 flex flex-col items-center justify-center gap-section p-section text-center">
      <div className="font-serif font-medium text-[26px]/[30px] text-ink">{uk.exhausted.title}</div>
      <div className="font-sans text-[15px]/[23px] text-ink-2">{uk.exhausted.body}</div>
      <div className="font-sans text-sm leading-[normal] text-ink-3">{uk.exhausted.newAnimals}</div>
    </div>
  );
}
