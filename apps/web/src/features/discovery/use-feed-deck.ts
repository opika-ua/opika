"use client";

import { DEFAULT_PAGE_SIZE, type FeedCursor } from "@opika/contracts";
import { type FeedFilters, filtersFingerprint } from "@opika/domain";
import { isDefinedError, safe } from "@orpc/client";
import { useCallback, useEffect, useRef, useState } from "react";
import { feedBrowserClient } from "../../api/browser-client";
import type { DeckErrorReason, DeckState } from "./SwipeDeck";

/**
 * Owns everything `SwipeDeck` itself has no way to know: the real
 * `feed.list` fetch, the opaque cursor between pages, and when a "ready"
 * deck has actually run out. `SwipeDeck` is presentation-only by design
 * (see its own file) — this is the piece `/discovery/page.tsx` used to
 * fake with `generateMockCards` and local `useState`.
 *
 * `filters` is a fresh object on every render of the caller (parsed straight
 * from `searchParams` each time) — `filtersFingerprint` is what already
 * exists to compare filter sets for equality (the same tool the cursor
 * itself is bound to), so it's the effect dependency, not `filters` by
 * reference. `filtersRef` carries the current value into `fetchPage`
 * without making that callback's identity depend on it.
 */
export function useFeedDeck(filters: FeedFilters) {
  const [state, setState] = useState<DeckState>({ kind: "loading" });
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const cursorRef = useRef<FeedCursor | null>(null);
  const swipedCountRef = useRef(0);
  const fingerprint = filtersFingerprint(filters);

  /**
   * Bumped by anything that starts a *new* feed from scratch (a filter
   * change, a retry) — not by prefetch, which extends the same feed rather
   * than replacing it. `fetchPage` captures the generation it was called
   * under and discards its own response if a newer one has already started
   * by the time it resolves, so a slow response to a filter that's no
   * longer current can't land cards (or a cursor) for the wrong feed.
   * Verified reachable, not theoretical: changing filters while a fetch is
   * in flight, then letting the stale one resolve, used to leave the deck
   * showing the *old* filters' cards under the *new* filters' header, with
   * no error and no way to notice.
   */
  const generationRef = useRef(0);
  /** Scoped to `onPrefetch` alone — a rapid double-trigger (two swipes
   * before the first prefetch resolves) must not issue two requests for
   * the same next page, but this must never block a fresh `fetchPage` call
   * from a filter change or retry, which is what sharing one flag across
   * every call used to do. */
  const prefetchInFlightRef = useRef(false);

  const fetchPage = useCallback(async (cursor: FeedCursor | null, mode: "replace" | "append") => {
    const generation = generationRef.current;

    const [error, result] = await safe(
      feedBrowserClient.feed.list({
        filters: filtersRef.current,
        cursor,
        limit: DEFAULT_PAGE_SIZE,
      }),
    );

    if (generation !== generationRef.current) return;

    if (error) {
      /**
       * `error instanceof TypeError` — not `!isDefinedError(error)` — is
       * the "offline" test. Confirmed necessary, not a style choice:
       * `isDefinedError` is true only for the two *declared* contract
       * errors, so an undeclared server-side failure, or the rate
       * limiter's raw `new Response("Too Many Requests", {status:429})`
       * (returned before oRPC's own handler ever runs, so it isn't a
       * well-formed oRPC response at all), both come back with
       * `isDefinedError === false` — landing on "offline" under the old
       * check even though the server responded and the user's network is
       * fine. A genuine network failure (no response reached at all) is a
       * `TypeError` at the fetch layer, per the Fetch API's own contract —
       * that's the actual signal "offline" should key on.
       */
      const reason: DeckErrorReason =
        error instanceof TypeError
          ? "offline"
          : isDefinedError(error) && error.code === "INVALID_CURSOR"
            ? "sessionExpired"
            : "loadFailed";
      setState({ kind: "error", reason });
      return;
    }

    cursorRef.current = result.nextCursor;
    setState((prev) => {
      const priorCards = mode === "append" && prev.kind === "ready" ? prev.cards : [];
      const cards = [...priorCards, ...result.items];
      if (cards.length === 0 && result.nextCursor === null) {
        return { kind: "exhausted", seenCount: swipedCountRef.current };
      }
      return { kind: "ready", cards };
    });
  }, []);

  useEffect(() => {
    generationRef.current += 1;
    cursorRef.current = null;
    swipedCountRef.current = 0;
    setState({ kind: "loading" });
    fetchPage(null, "replace");
    // fingerprint (not `filters`) is deliberate — see the doc comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint, fetchPage]);

  /**
   * Only called from within `SwipeDeck`'s own "ready" branch (see its
   * `handleCommit`), by which point at least one fetch has already
   * succeeded — a `null` cursor here means "this feed is exhausted for
   * these filters," never "hasn't loaded yet."
   */
  const onPrefetch = useCallback(() => {
    if (cursorRef.current === null || prefetchInFlightRef.current) return;
    prefetchInFlightRef.current = true;
    fetchPage(cursorRef.current, "append").finally(() => {
      prefetchInFlightRef.current = false;
    });
  }, [fetchPage]);

  /**
   * `cardId` is unused, matching the mock-data implementation this
   * replaces (`/discovery/page.tsx`, pre-redirect): the top card is always
   * `cards[0]`, and swipe *direction* isn't recorded anywhere yet — no
   * adopter session is wired into the deck this phase (see the PR body),
   * so there is nothing to persist a direction against. Dropping the top
   * card is the only real effect either direction has today.
   */
  const onSwipe = useCallback(() => {
    swipedCountRef.current += 1;
    setState((prev) => {
      if (prev.kind !== "ready") return prev;
      const remaining = prev.cards.slice(1);
      if (remaining.length === 0 && cursorRef.current === null) {
        return { kind: "exhausted", seenCount: swipedCountRef.current };
      }
      return { kind: "ready", cards: remaining };
    });
  }, []);

  /** Every reason restarts the feed from its first page — there is no
   * partial state worth preserving once the error card has replaced the
   * deck view, and `sessionExpired`'s own copy ("Ми почали стрічку
   * заново") specifically promises this. */
  const onRetry = useCallback(() => {
    generationRef.current += 1;
    cursorRef.current = null;
    swipedCountRef.current = 0;
    setState({ kind: "loading" });
    fetchPage(null, "replace");
  }, [fetchPage]);

  /**
   * How many cards this session has already swiped past — the deck
   * header's "6 з 34" position is `shownCount + 1` (the card on screen
   * right now, 1-indexed). Read straight off the ref rather than mirrored
   * into its own `useState`: it only ever changes inside `onSwipe`, which
   * already calls `setState` in the same tick, so any render that sees a
   * new `state` also sees the ref's already-updated value.
   */
  return { state, onSwipe, onPrefetch, onRetry, shownCount: swipedCountRef.current };
}
