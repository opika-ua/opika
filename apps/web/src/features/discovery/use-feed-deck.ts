"use client";

import { DEFAULT_PAGE_SIZE, type FeedCursor } from "@opika/contracts";
import { type AnimalId, type FeedFilters, filtersFingerprint } from "@opika/domain";
import { isDefinedError, safe } from "@orpc/client";
import { useCallback, useEffect, useRef, useState } from "react";
import { feedBrowserClient } from "../../api/browser-client";
import type { CommitDirection, DeckErrorReason, DeckState } from "./SwipeDeck";

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
   * The deck's total as of the start of the current feed (R5): `feed.list`'s
   * `reachableCount` from the fresh fetch that started it — a number when
   * that fetch had a session, `null` when it didn't (nothing could be
   * excluded, so the gallery's own total, which `DeckScreen` already has,
   * is the honest one).
   *
   * Taken from the fresh fetch only, and never updated by a prefetch or by
   * this session's own swipes: the header counts `shownCount` up toward
   * it, and the snapshot already includes the cards those swipes leave
   * behind. Reset with everything else whenever a new feed starts (a filter
   * change or a retry), together with `swipedCountRef`, so the pair stays
   * consistent there too. This replaces R1's `hasActiveSeenSet`, which
   * could only hide the counter, and hid it on a first-time visitor's very
   * first swipe.
   */
  const [reachableCount, setReachableCount] = useState<number | null>(null);

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
  /** Scoped to `onRetry` alone, same reasoning as `prefetchInFlightRef` —
   * see that ref's own comment. */
  const retryAbortRef = useRef<AbortController | null>(null);

  const fetchPage = useCallback(
    async (cursor: FeedCursor | null, mode: "replace" | "append", signal?: AbortSignal) => {
      const generation = generationRef.current;

      const [error, result] = await safe(
        feedBrowserClient.feed.list(
          { filters: filtersRef.current, cursor, limit: DEFAULT_PAGE_SIZE },
          signal ? { signal } : undefined,
        ),
      );

      // An aborted request's rejection lands here too (the entry effect's
      // cleanup and `onRetry` both abort a still-in-flight *previous*
      // "replace" call before starting a new one) — no special-casing
      // needed, since aborting only ever happens alongside a generation
      // bump, so the check above already discards it.
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

      // Only the fetch that starts a feed defines its total; a prefetch's own
      // `reachableCount` is always `null` ("not computed") and must not
      // overwrite it. Same tick as `setState` above, so a render never sees
      // the new cards with the previous feed's total.
      if (mode === "replace") {
        setReachableCount(result.reachableCount);
      }
    },
    [],
  );

  useEffect(() => {
    generationRef.current += 1;
    cursorRef.current = null;
    swipedCountRef.current = 0;
    setReachableCount(null);
    setState({ kind: "loading" });

    /**
     * The cleanup aborts this fetch if the effect tears down before it
     * resolves — including React Strict Mode's dev-only mount → cleanup →
     * mount simulation, which otherwise sends this same request twice
     * (measured: 1 request became 2 once the generation token replaced the
     * old blanket in-flight guard, since discarding a stale *response* by
     * generation doesn't stop the stale *request* from having been sent).
     * A real filter change tearing this down mid-flight is exactly the
     * same case — the old fetch is for filters nobody wants an answer for
     * anymore, so cancelling it outright is strictly better than letting
     * it finish and discarding the result.
     */
    const controller = new AbortController();
    fetchPage(null, "replace", controller.signal);
    return () => controller.abort();
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
   * Bootstraps the anonymous session at most once per page load, not once
   * per swipe. `session.bootstrap` is mint-or-return (idempotent), so
   * calling it again would be safe, but swiping is high-frequency (unlike
   * the detail page's one-shot reveal) — re-bootstrapping before every
   * single swipe would double every swipe's round trip for nothing, since
   * the cookie it sets is what every later `feed.list`/`swipes.record`
   * call already carries automatically. `sessionReadyRef` is a memoised
   * promise, not a boolean, so concurrent swipes before the first
   * bootstrap resolves share the same in-flight request rather than each
   * firing their own.
   *
   * Caught on review: memoising with `??=` alone caches a *failed*
   * attempt forever, just as eagerly as a successful one — a swipe made
   * while briefly offline would poison every later swipe in the same page
   * load, silently, with no retry, even once the network returned. The
   * ref is cleared on failure specifically so the next swipe gets a fresh
   * attempt; only a successful bootstrap stays cached.
   */
  const sessionReadyRef = useRef<Promise<boolean> | null>(null);
  const ensureSession = useCallback(async (): Promise<boolean> => {
    sessionReadyRef.current ??= safe(feedBrowserClient.session.bootstrap({})).then(
      ([error]) => !error,
    );
    const ready = await sessionReadyRef.current;
    if (!ready) sessionReadyRef.current = null;
    return ready;
  }, []);

  /**
   * R1 (Phase R, 2026-09): records the swipe against the anonymous
   * session so `feed.list`'s existing seen-set exclusion
   * (`buildSeenExclusion`, built at M2) has something to exclude — see
   * `docs/build-plan.md`'s Phase R for why no new exclusion logic lives
   * here. Fire-and-forget, after the local state update below, not
   * awaited before it: decision #9 (`CLAUDE.md`) calls swipes
   * "best-effort and batchable" specifically so a dropped connection
   * never blocks the deck's own advance, which the `setState` call
   * already guarantees regardless of whether the record below succeeds.
   */
  const onSwipe = useCallback(
    (cardId: AnimalId, direction: CommitDirection) => {
      swipedCountRef.current += 1;
      setState((prev) => {
        if (prev.kind !== "ready") return prev;
        const remaining = prev.cards.slice(1);
        if (remaining.length === 0 && cursorRef.current === null) {
          return { kind: "exhausted", seenCount: swipedCountRef.current };
        }
        return { kind: "ready", cards: remaining };
      });

      void (async () => {
        const ready = await ensureSession();
        if (!ready) return;
        await safe(
          feedBrowserClient.swipes.record({
            animalId: cardId,
            direction: direction === "left" ? "pass" : "interested",
            at: new Date(),
          }),
        );
      })();
    },
    [ensureSession],
  );

  /** Every reason restarts the feed from its first page — there is no
   * partial state worth preserving once the error card has replaced the
   * deck view, and `sessionExpired`'s own copy ("Ми почали стрічку
   * заново") specifically promises this. */
  const onRetry = useCallback(() => {
    generationRef.current += 1;
    cursorRef.current = null;
    swipedCountRef.current = 0;
    setReachableCount(null);
    setState({ kind: "loading" });

    // A double-clicked retry aborts its own predecessor rather than
    // letting both requests run — no `useEffect` cleanup to lean on here
    // (a click handler, not an effect), so this ref does the same job
    // the entry effect's cleanup does above.
    retryAbortRef.current?.abort();
    const controller = new AbortController();
    retryAbortRef.current = controller;
    fetchPage(null, "replace", controller.signal);
  }, [fetchPage]);

  /**
   * How many cards this session has already swiped past — the deck
   * header's "6 з 34" position is `shownCount + 1` (the card on screen
   * right now, 1-indexed). Read straight off the ref rather than mirrored
   * into its own `useState`: it only ever changes inside `onSwipe`, which
   * already calls `setState` in the same tick, so any render that sees a
   * new `state` also sees the ref's already-updated value.
   */
  return {
    state,
    onSwipe,
    onPrefetch,
    onRetry,
    shownCount: swipedCountRef.current,
    reachableCount,
    /**
     * R3 (Phase R, `docs/build-plan.md`) — exposed so `SwipeDeck.tsx`'s own
     * reveal (`useReveal.ts`) can share this exact memoised bootstrap
     * rather than calling `session.bootstrap` a second, independent time.
     * Caught on review: a swipe-right used to fire `onSwipe`'s own
     * `ensureSession` (above) and the reveal's `session.bootstrap` call
     * concurrently, both with no cookie yet to prove they're the same
     * visitor — the server has no way to tell they're one caller and mints
     * two adopters, two sessions, and the browser keeps only one cookie,
     * silently discarding whichever swipe or reveal landed under the lost
     * identity. One shared promise closes the race by construction: the
     * second caller always awaits the first's already-in-flight request
     * instead of starting its own.
     */
    ensureSession,
  };
}
