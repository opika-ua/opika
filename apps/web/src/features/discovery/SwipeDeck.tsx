"use client";

import type { FeedCardView } from "@opika/contracts";
import type { AnimalId, CityId } from "@opika/domain";
import { uk } from "@opika/i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import { cardCityId } from "../gallery/card-text";
import { ContactRevealDialog } from "../reveal/ContactRevealDialog";
import { useReveal } from "../reveal/useReveal";
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

/**
 * R2 (Phase R, `docs/build-plan.md`): two directions, not three. «Далі»/↓
 * — a low-emphasis "skip visually, decide nothing" utility distinct from
 * «Не зараз» — existed only as an interim fix for R1's own transition: it
 * used to share `handleCommit("left")` with the real skip button, which
 * cost nothing before R1 wired `swipes.record`, but once a `"left"`
 * commit persists a 30-day exclusion, that reuse would have silently
 * recorded a real product decision the adopter never made. A third,
 * temporary `"advance"` direction closed that gap for one row; this row
 * removes the button, the direction, and the gap it was patched around,
 * all together.
 */
export type CommitDirection = "left" | "right";

interface SwipeDeckProps {
  state: DeckState;
  onSwipe: (cardId: AnimalId, direction: CommitDirection) => void;
  onPrefetch: () => void;
  onCardTap?: ((cardId: string) => void) | undefined;
  onRetry?: (() => void) | undefined;
  /**
   * R3 (Phase R, `docs/build-plan.md`): the deck's own reveal
   * (`useReveal`, below) shares this exact memoised session-bootstrap
   * promise from `use-feed-deck.ts`, rather than minting its own —
   * required, not optional, since two independent, concurrent,
   * cookie-less `session.bootstrap` calls can't tell the server they're
   * the same visitor and each mint their own adopter and session, only
   * one of which survives as the browser's actual cookie. Caught on
   * review.
   */
  ensureSession: () => Promise<boolean>;
  /** R3 (Phase R, `docs/build-plan.md`): the deck's own reveal names the
   * swiped animal's real city — see `handleCommit`'s own comment.
   * Optional, defaulting to empty: most of this component's own tests
   * exercise something unrelated to city names, and `ContactRevealDialog`
   * already degrades gracefully for a city it can't resolve. */
  cityNames?: Record<CityId, string>;
}

export function SwipeDeck({
  state,
  onSwipe,
  onPrefetch,
  onCardTap,
  onRetry,
  ensureSession,
  cityNames = {},
}: SwipeDeckProps) {
  const [dx, setDx] = useState(0);
  const { state: revealState, open: openReveal, close: closeReveal } = useReveal(ensureSession);
  const writeButtonRef = useRef<HTMLButtonElement | null>(null);

  // Focus back on «Написати» when the reveal closes — the same
  // "close returns focus to whatever opened this" contract
  // `RevealFlow.tsx` already keeps for the detail page, missing here
  // until caught on review: without it, closing left focus nowhere in
  // particular (a keyboard user's next Tab would restart from the header).
  //
  // Known residual gap, found on review, not closed here: a right-swipe
  // on the *last* card opens the reveal and exhausts the deck in the same
  // tick, unmounting «Написати» (and this ref along with it) while the
  // dialog is still open — closing it then lands on `writeButtonRef.current
  // === null`, and `?.focus()` silently no-ops rather than throwing, so
  // focus falls back to whatever the browser does by default (`<body>`
  // in practice). No single stable element exists to fall back to here
  // (`ExhaustedState` renders no focusable control of its own), so fixing
  // this properly is its own small follow-up, not a one-line patch.
  const closeRevealAndRefocus = useCallback(() => {
    closeReveal();
    writeButtonRef.current?.focus();
  }, [closeReveal]);

  /**
   * R3 (Phase R, `docs/build-plan.md`): «Написати» — the button and the
   * equivalent right-drag gesture, both funnelled through this same
   * `handleCommit("right")` branch (docs/design/README.md's "Every gesture
   * has a button" — the two are meant to be indistinguishable outcomes,
   * not a button-only feature; gesture parity confirmed by Oleksii,
   * 2026-09-12, in direct answer to "should dragging a card to the right do
   * exactly what «Написати» does, including spending one unit of the
   * reveal budget?" — yes; see `docs/decisions-pending-review.md`).
   * Snapshots `topCard.id`/`.name` *before* `onSwipe` runs, not after:
   * `onSwipe` advances `state.cards` in the same tick, so reading from
   * `state` after calling it would already be looking at the next card, or
   * at nothing if the deck just exhausted.
   *
   * City name resolved the same way the gallery's own cards already do
   * (`cardCityId`, `../gallery/card-text.ts` — fostered animal's own city,
   * else the shelter's) against `cityNames`, the exact lookup
   * `GortatyPage`'s server component already builds for `filtersInWords`
   * and hands down as a prop — caught on review: an earlier version of
   * this row passed `cityName: null` unconditionally on the stated reason
   * that no such lookup existed anywhere in the deck, which was false; the
   * lookup already existed one component up and was simply being
   * discarded after its first use. `?? null` only for a city genuinely
   * missing from the lookup (a data gap, not a design choice) —
   * `ContactRevealDialog` already degrades gracefully for that case.
   *
   * No re-entrancy guard here for a reveal already in flight — that guard
   * has to run *before* a right-drag's exit animation starts, not inside
   * this function, which only ever runs after the card has already
   * finished sliding off-screen (see `canCommit`, passed to
   * `useSwipeGesture` below, and its own comment on
   * `SwipeGestureCallbacks`). The button's own `disabled` prop covers the
   * button half by never calling this function to begin with.
   */
  const handleCommit = useCallback(
    (direction: CommitDirection) => {
      if (state.kind !== "ready" || state.cards.length === 0) return;
      const topCard = state.cards[0];
      if (!topCard) return;
      if (direction === "right") {
        void openReveal({
          animalId: topCard.id,
          animalName: topCard.name,
          cityName: cityNames[cardCityId(topCard)] ?? null,
        });
      }
      onSwipe(topCard.id, direction);
      setDx(0);

      // Check if we need to prefetch
      if (state.cards.length - 1 <= PREFETCH_THRESHOLD) {
        onPrefetch();
      }
    },
    [state, onSwipe, onPrefetch, openReveal, cityNames],
  );

  const handleSnapBack = useCallback(() => {
    setDx(0);
  }, []);

  // Refuses a right-drag's commit while a reveal from the *previous* card is
  // still in flight — checked before the exit animation starts, so a refused
  // drag springs back to centre exactly like an under-threshold one, rather
  // than sliding off-screen and getting stuck there. See `canCommit`'s own
  // comment on `SwipeGestureCallbacks` for why this can't live inside
  // `handleCommit`/`onCommit` instead.
  const canCommit = useCallback(
    (direction: CommitDirection) => !(direction === "right" && revealState.kind === "loading"),
    [revealState.kind],
  );

  const { cardRef } = useSwipeGesture({
    onDrag: setDx,
    onCommit: handleCommit,
    onSnapBack: handleSnapBack,
    canCommit,
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

  let content: React.ReactNode;

  if (state.kind === "loading") {
    content = <LoadingState />;
  } else if (state.kind === "error") {
    content = <ErrorState reason={state.reason} onRetry={onRetry} />;
  } else if (state.kind === "exhausted") {
    content = <ExhaustedState seenCount={state.seenCount} />;
  } else if (state.cards.length === 0) {
    content = <ExhaustedState seenCount={0} />;
  } else {
    // Show up to 3 stack layers
    const visibleCards = state.cards.slice(0, layout.stackLayers);

    content = (
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

        {/* Action buttons — docs/design/README.md, "The deck": originally
          three ("«Не зараз» (flex: 1, white) · «↓» (56 wide, white) ·
          «Написати» (flex: 1, #101112)"). R2 (Phase R, `docs/build-plan.md`)
          drops the middle one — see `CommitDirection`'s own comment for why
          it existed only as an interim fix, never a permanent third
          direction — leaving the two real decisions the design's mock
          frame never itself updated to show. */}
        <div data-testid="action-row" className="font-rg flex gap-2 mt-row shrink-0">
          <ActionButton
            label={uk.actions.notNow}
            variant="outlined"
            className="flex-1"
            onClick={() => handleCommit("left")}
          />
          <ActionButton
            ref={writeButtonRef}
            label={uk.actions.write}
            variant="primary"
            className="flex-1"
            onClick={() => handleCommit("right")}
            // Disabled while a reveal is in flight — matches
            // `RevealFlow.tsx`'s own trigger. Closes the button half of
            // the re-entrancy gap a second commit could otherwise open
            // (two reveals in flight is the "stale response overwrites a
            // newer one" race `useReveal.ts`'s own generation guard
            // exists to make merely wasted, not visibly wrong). The drag
            // half is closed too, by `canCommit` (passed to
            // `useSwipeGesture`, above) — gesture parity (Oleksii,
            // 2026-09-12) means the drag needs the identical outcome, not
            // a separate mechanism; see `canCommit`'s own comment on
            // `SwipeGestureCallbacks` for why it isn't this same `disabled`
            // check reused, though.
            disabled={revealState.kind === "loading"}
          />
        </div>

        {/*
          R2's other half: the deck's own permanent home for
          `docs/standing-constraints.md`'s "The swipe is filtering, not
          judging" — previously only stated on the detail page
          (`AnimalDetailScreen.tsx`), marked interim there specifically
          because the deck had nowhere to put it without squeezing the
          header (`docs/design/README.md`'s Phase D deviation note). Same
          typography and text as that interim placement — recovered copy,
          not redrafted. `mt-label` (4px), not `mt-group` (16px) or even
          `mt-row` (8px): this is a secondary disclaimer under two
          already-labelled buttons, not a new content block, and the deck's
          vertical budget is genuinely tight (`SwipeCard.tsx`'s own
          elastic-photo comment) — the card stack above is `flex-1 min-h-0`,
          so this shrink-0 line's height comes out of the photo's own
          elastic slack, the same mechanism that already absorbs the action
          row's height.

          `hidden min-[360px]:block`, measured, not guessed: at 320px
          (`NARROW_PHONE`, its own doc comment calls it "the narrowest width
          still worth calling a real device," not this product's stated
          target) the shelter line's own bottom margin measured a real 12px
          before this notice existed — 4px above its 8px floor — with 18px
          of further slack in the photo above its own floor
          (`MIN_PHOTO_HEIGHT_PX`). Not nothing, but not enough: at this
          width the Ukrainian sentence wraps to two lines, costing ~40px
          (36px of text plus its own margin), 18px more than the 22px this
          viewport actually had left to give — a genuine clip
          (measured: -10px against the 8px floor), not mere erosion.
          360px (`ANDROID_PHONE`, `docs/stack-decision.md`'s actual stated
          target — "budget Android hardware") fits the sentence on one line
          and measured clean with real slack once this line existed — see
          `discovery-layout.harness.ts`'s own coverage of both. The
          shelter's words are never what gives; a secondary
          disclaimer, at the one width narrower than this product's stated
          audience, is.
        */}
        <span
          data-testid="not-a-judgement-notice"
          className="hidden min-[360px]:block font-sans text-[13px]/[18px] text-rg-ink-3 text-center mt-label shrink-0"
        >
          {uk.actions.notAJudgementNotice}
        </span>
      </div>
    );
  }

  return (
    <>
      {content}
      {/*
        R3 (Phase R, `docs/build-plan.md`): "the deck session must survive a
        reveal — no exit back to the gallery." Rendered here, as a sibling
        of `content` rather than nested inside the "ready" branch above, on
        purpose: a swipe-right that exhausts the deck (the last card) still
        needs the dialog to keep showing over whatever `content` becomes
        next (`ExhaustedState`) — nesting it inside the "ready" branch would
        have unmounted the dialog the instant `state.kind` changed
        underneath it, mid-reveal. No `secondaryAction` — the dialog's own
        ✕ and Esc are the only ways out, and both stay on the deck.
      */}
      {(revealState.kind === "error" || revealState.kind === "open") && (
        <ContactRevealDialog
          state={revealState}
          onClose={closeRevealAndRefocus}
          onRetry={() =>
            openReveal({
              animalId: revealState.animalId,
              animalName: revealState.animalName,
              cityName: revealState.cityName,
            })
          }
        />
      )}
    </>
  );
}

// --- Sub-components ---

function ActionButton({
  ref,
  label,
  variant,
  className,
  onClick,
  disabled,
}: {
  /** React 19's ref-as-prop, no `forwardRef` needed — R3's own reveal
   * uses it to refocus «Написати» when the dialog closes. */
  ref?: React.Ref<HTMLButtonElement>;
  label: string;
  /** Two, since R2 dropped the mock's third "↓" button — see
   * `CommitDirection`'s own comment. */
  variant: "outlined" | "primary";
  className?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  // No border on any variant — "the single structural move that does most
  // of the work: borders are gone" (docs/design/README.md). Focus-visible
  // outline is the same ring every other focusable control in this app
  // carries (see the error state's retry button, below) — missing here
  // until caught alongside R2's own rewrite of this component's variant
  // union: `docs/standing-constraints.md`'s "an interactive element ships
  // with its focus-visible styling and a test" rules out shipping either
  // without the other.
  const base =
    "min-h-14 rounded-rg-button text-[15px] leading-none cursor-pointer disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px] disabled:opacity-60";

  if (variant === "primary") {
    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        className={`${base} bg-rg-ink text-rg-surface font-medium ${className ?? ""}`}
        onClick={onClick}
      >
        {label}
      </button>
    );
  }

  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
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
