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
  const fetchingRef = useRef(false);
  const swipedCountRef = useRef(0);
  const fingerprint = filtersFingerprint(filters);

  const fetchPage = useCallback(async (cursor: FeedCursor | null, mode: "replace" | "append") => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    const [error, result] = await safe(
      feedBrowserClient.feed.list({
        filters: filtersRef.current,
        cursor,
        limit: DEFAULT_PAGE_SIZE,
      }),
    );

    fetchingRef.current = false;

    if (error) {
      const reason: DeckErrorReason = !isDefinedError(error)
        ? "offline"
        : error.code === "INVALID_CURSOR"
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
    if (cursorRef.current === null) return;
    fetchPage(cursorRef.current, "append");
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
    cursorRef.current = null;
    swipedCountRef.current = 0;
    setState({ kind: "loading" });
    fetchPage(null, "replace");
  }, [fetchPage]);

  return { state, onSwipe, onPrefetch, onRetry };
}
