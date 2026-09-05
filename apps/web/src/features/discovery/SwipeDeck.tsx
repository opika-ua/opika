"use client";

import type { FeedCardView } from "@opika/contracts";
import { uk } from "@opika/i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import { SwipeCard } from "./SwipeCard";
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

/**
 * `reason` names one of the three failure copies `packages/i18n` already
 * carries (`uk.errors.offline` / `.loadFailed` / `.sessionExpired`) —
 * pre-written for exactly this deck, never wired to a real caller until
 * E5. `offline`: the fetch itself never reached the server (no network,
 * not an oRPC response). `sessionExpired`: the feed's cursor was rejected
 * (`INVALID_CURSOR` — signed and bound to this filter set, so a mismatch
 * means resuming a stale cursor, not a user mistake); retrying restarts the
 * feed from its first page, matching the copy's own "Ми почали стрічку
 * заново." `loadFailed`: anything else — a real server-side failure, or an
 * oRPC-defined error (e.g. `RATE_LIMITED`) with no dedicated copy of its
 * own.
 */
export type DeckErrorReason = "offline" | "loadFailed" | "sessionExpired";

export type DeckState =
  | { kind: "loading" }
  | { kind: "ready"; cards: FeedCardView[] }
  | { kind: "exhausted"; seenCount: number }
  | { kind: "error"; reason: DeckErrorReason };

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

  /**
   * "Focus lands on the top card" (docs/design/README.md, "Gallery → deck")
   * — on entering the deck, and again on recovering into it from an error
   * (retry): when the error card unmounts, its own focused heading goes
   * with it, and with no explicit re-focus a keyboard user would land on
   * `<body>` with no sense of where they are — worse than "focus moved
   * again," not better. Deliberately NOT guarded against re-firing on
   * every swipe: `state.kind` stays `"ready"` across swipes (only the
   * `cards` array changes), so this effect's own `[state.kind]` dependency
   * already skips it without an extra ref — verified by mutation, not
   * assumed (`SwipeDeck.test.tsx`'s "does not steal focus back to the card
   * on a later swipe"). `topCardNodeRef` is a second callback ref on the
   * same element `cardRef` already attaches to; `useSwipeGesture` doesn't
   * expose its own internal node reference, so this is the plain way to
   * also get a handle on it without changing that hook's contract.
   */
  const topCardNodeRef = useRef<HTMLElement | null>(null);
  const setTopCardNode = useCallback(
    (node: HTMLElement | null) => {
      topCardNodeRef.current = node;
      cardRef(node);
    },
    [cardRef],
  );

  useEffect(() => {
    if (state.kind === "ready") {
      topCardNodeRef.current?.focus();
    }
  }, [state.kind]);

  if (state.kind === "loading") {
    return <LoadingState />;
  }

  if (state.kind === "error") {
    return <ErrorState reason={state.reason} onRetry={onRetry} />;
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
                gestureRef={stackIndex === 0 ? setTopCardNode : noopRef}
                dx={stackIndex === 0 ? dx : 0}
                stackIndex={stackIndex}
                onTap={stackIndex === 0 ? () => onCardTap?.(card.id) : undefined}
              />
            );
          })}
      </div>

      {/* Action buttons — docs/design/README.md, "The deck": "gap: 8, all
        56, radius 16: «Не зараз» (flex: 1, white) · «↓» (56 wide, white) ·
        «Написати» (flex: 1, #101112)." */}
      <div data-testid="action-row" className="font-rg flex gap-2 mt-group shrink-0">
        <ActionButton
          label={uk.actions.notNow}
          variant="outlined"
          className="flex-1"
          onClick={() => handleCommit("left")}
        />
        <ActionButton
          label={uk.actions.next}
          variant="quiet"
          className="w-14"
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
  /**
   * Three, not two — the mock's own "↓" button is visually distinct from
   * "Не зараз" even though both are a plain white fill: `#101112`/500
   * ("Не зараз") vs `#45484B`, no weight override ("↓") — a lower-emphasis
   * utility action next to a real choice, not a second copy of the same
   * button (`Opika Registry System.dc.html`'s B7 frame).
   */
  variant: "outlined" | "quiet" | "primary";
  className?: string;
  onClick: () => void;
}) {
  // No border on any variant — "the single structural move that does most
  // of the work: borders are gone" (docs/design/README.md).
  const base = "min-h-14 rounded-rg-button text-[15px] leading-none cursor-pointer";

  if (variant === "primary") {
    return (
      <button
        type="button"
        className={`${base} bg-rg-ink text-rg-surface font-medium ${className ?? ""}`}
        onClick={onClick}
      >
        {label}
      </button>
    );
  }

  if (variant === "quiet") {
    return (
      <button
        type="button"
        className={`${base} bg-rg-surface text-rg-ink-2 ${className ?? ""}`}
        onClick={onClick}
      >
        {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`${base} bg-rg-surface text-rg-ink font-medium ${className ?? ""}`}
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

function ErrorState({
  reason,
  onRetry,
}: {
  reason: DeckErrorReason;
  onRetry?: (() => void) | undefined;
}) {
  // `loadFailed` is the only one of the three with a `body` line — `offline`
  // and `sessionExpired` are short enough without one.
  const copy = uk.errors[reason];

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
          {copy.eyebrow}
        </div>
        <div className="font-serif text-[17px]/[24.65px] text-ink">{copy.title}</div>
        {"body" in copy && (
          <div className="font-sans text-[13px] leading-[normal] text-ink-2">{copy.body}</div>
        )}
        {/*
          Two fixes on the retry button below, and one thing deliberately left
          alone.

          Fixed: 48px, not 44 (README:200), and a real focus-visible ring —
          this button previously had *no* focus styling at all, which
          `docs/standing-constraints.md`'s "an interactive element ships with
          its focus-visible styling and a test" rules out outright. A keyboard
          user reaching the retry on a failed deck had no way to see where they
          were. Both halves are asserted in
          `discovery-layout.harness.ts`'s "/tvaryny/gortaty error state",
          which reaches this state by refusing the deck's own `feed.list`
          request — the state had no harness coverage of any kind before, which
          is how a 44px target with no focus ring survived every gate.

          NOT fixed, reported instead: every other token on this element is
          pre-V2 (`rounded-button`, `border-line-strong`, `bg-paper`,
          `text-ink-2`, `mt-row`) where the rest of the app uses `rg-*`. That is
          a visual migration this state never got, not a touch-target or a11y
          defect, and restyling it silently inside Phase D would be a design
          change wearing a bug-fix label. The ring uses `rg-registry`
          regardless, because that is the ring every other focusable element in
          the app has and the one the harness asserts against.
        */}
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            data-testid="deck-error-retry"
            className="min-h-12 rounded-button border border-line-strong bg-paper font-sans text-sm leading-[normal] text-ink-2 cursor-pointer mt-row focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px]"
          >
            {copy.action}
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
