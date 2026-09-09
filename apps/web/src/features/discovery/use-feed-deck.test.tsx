import { NO_FILTERS } from "@opika/domain";
import { ORPCError } from "@orpc/client";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withToggledSpecies } from "../gallery/filter-url";
import { generateMockCards } from "./mock-data";
import { useFeedDeck } from "./use-feed-deck";

const list = vi.fn();
const bootstrap = vi.fn();
const record = vi.fn();

vi.mock("../../api/browser-client", () => ({
  feedBrowserClient: {
    feed: { list: (...args: unknown[]) => list(...args) },
    session: { bootstrap: (...args: unknown[]) => bootstrap(...args) },
    swipes: { record: (...args: unknown[]) => record(...args) },
  },
}));

/**
 * `feedBrowserClient` is mocked at the module boundary rather than faking
 * `fetch` — this is a test of the hook's own cursor/prefetch/error-mapping
 * logic, not of the HTTP transport underneath it (that's what
 * `apps/web/test/harness` exercises against a real running server).
 */
describe("useFeedDeck", () => {
  beforeEach(() => {
    list.mockReset();
    bootstrap.mockReset().mockResolvedValue({});
    record.mockReset().mockResolvedValue({ recorded: true });
  });

  it("loads the first page on mount, with a null cursor", async () => {
    const cards = generateMockCards(3);
    list.mockResolvedValueOnce({ items: cards, nextCursor: "cursor-1" });

    const { result } = renderHook(() => useFeedDeck(NO_FILTERS));

    expect(result.current.state).toEqual({ kind: "loading" });
    await waitFor(() => expect(result.current.state.kind).toBe("ready"));

    // Second arg is the AbortController.signal the entry effect's cleanup
    // uses to cancel a superseded fetch (see use-feed-deck.ts) — a real
    // AbortSignal instance, not a literal to compare structurally against.
    expect(list).toHaveBeenCalledExactlyOnceWith(
      { filters: NO_FILTERS, cursor: null, limit: 20 },
      { signal: expect.any(AbortSignal) },
    );
    expect(result.current.state).toEqual({ kind: "ready", cards });
    expect(result.current.hasActiveSeenSet).toBe(false);
  });

  /**
   * Oleksii's resolution to R1's STOP (`docs/build-plan.md`, Phase R,
   * 2026-09-09): a *pre-existing* seen-set from an earlier visit — the
   * server telling this device it already has history — must suppress the
   * deck's own position counter, not just a seen-set built up during the
   * current page load (the next test covers that half).
   */
  it("exposes hasActiveSeenSet true when the entry fetch reports a pre-existing one", async () => {
    list.mockResolvedValueOnce({
      items: generateMockCards(3),
      nextCursor: null,
      hasActiveSeenSet: true,
    });

    const { result } = renderHook(() => useFeedDeck(NO_FILTERS));
    await waitFor(() => expect(result.current.state.kind).toBe("ready"));

    expect(result.current.hasActiveSeenSet).toBe(true);
  });

  /**
   * The server only ever computes a real `true`/`false` on a "replace"
   * call (the entry fetch or a retry-restart) — a prefetch response
   * carries `null` ("not computed for this call", never a real answer,
   * see `apps/web/src/api/handlers/feed.ts`'s and the contract's own
   * comments). This is the guarantee that a prefetch response can't
   * silently un-suppress a counter a "replace" call already confirmed
   * should stay hidden — checking `=== true` treats both `null` and
   * `false` as no-ops, so this holds regardless of which value a
   * prefetch actually carries.
   */
  it("does not let a prefetch's own null hasActiveSeenSet override an already-true value", async () => {
    list
      .mockResolvedValueOnce({
        items: generateMockCards(3),
        nextCursor: "cursor-1",
        hasActiveSeenSet: true,
      })
      .mockResolvedValueOnce({
        items: generateMockCards(2),
        nextCursor: null,
        hasActiveSeenSet: null,
      });

    const { result } = renderHook(() => useFeedDeck(NO_FILTERS));
    await waitFor(() => expect(result.current.state.kind).toBe("ready"));
    expect(result.current.hasActiveSeenSet).toBe(true);

    act(() => result.current.onPrefetch());
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));

    expect(result.current.hasActiveSeenSet).toBe(true);
  });

  /**
   * The hook marks the seen-set non-empty the instant a real swipe is
   * committed locally, without waiting for `swipes.record`'s own
   * fire-and-forget round trip to resolve — see `use-feed-deck.ts`'s own
   * comment on `onSwipe` for why this is deliberately optimistic (the
   * record call could still fail) rather than a certainty, and why that
   * trade-off is accepted anyway.
   */
  it("sets hasActiveSeenSet true the instant a real swipe commits, not after the record round trip", async () => {
    const [only] = generateMockCards(1);
    if (!only) throw new Error("generateMockCards(1) must return one card");
    list.mockResolvedValueOnce({ items: [only, ...generateMockCards(1)], nextCursor: null });

    const { result } = renderHook(() => useFeedDeck(NO_FILTERS));
    await waitFor(() => expect(result.current.state.kind).toBe("ready"));
    expect(result.current.hasActiveSeenSet).toBe(false);

    act(() => result.current.onSwipe(only.id, "left"));

    // Synchronous — no `waitFor`/await needed, confirming this doesn't wait
    // on `ensureSession`/`swipes.record`'s own async chain.
    expect(result.current.hasActiveSeenSet).toBe(true);
  });

  it("appends, not replaces, on prefetch — and carries the stored cursor forward", async () => {
    const firstPage = generateMockCards(3);
    const secondPage = generateMockCards(2);
    list
      .mockResolvedValueOnce({ items: firstPage, nextCursor: "cursor-1" })
      .mockResolvedValueOnce({ items: secondPage, nextCursor: "cursor-2" });

    const { result } = renderHook(() => useFeedDeck(NO_FILTERS));
    await waitFor(() => expect(result.current.state.kind).toBe("ready"));

    act(() => result.current.onPrefetch());
    // Waiting on the merged card count, not just "list was called twice" —
    // the second call's response still has to clear its own await/setState
    // before the merge is actually visible in `state`.
    await waitFor(() =>
      expect(result.current.state).toEqual({
        kind: "ready",
        cards: [...firstPage, ...secondPage],
      }),
    );

    // No signal for a prefetch ("append") call — only "replace" calls
    // (entry, retry) carry one; see use-feed-deck.ts's own comment.
    expect(list).toHaveBeenLastCalledWith(
      { filters: NO_FILTERS, cursor: "cursor-1", limit: 20 },
      undefined,
    );
  });

  it("does not prefetch once the feed's own cursor says it's exhausted", async () => {
    list.mockResolvedValueOnce({ items: generateMockCards(1), nextCursor: null });

    const { result } = renderHook(() => useFeedDeck(NO_FILTERS));
    await waitFor(() => expect(result.current.state.kind).toBe("ready"));

    act(() => result.current.onPrefetch());

    // No second call queued — a null cursor means nothing left to ask for,
    // not "hasn't loaded yet" (see the hook's own doc comment on this).
    await new Promise((r) => setTimeout(r, 0));
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("swiping the last card with an exhausted cursor moves straight to exhausted, seenCount included", async () => {
    const [only] = generateMockCards(1);
    if (!only) throw new Error("generateMockCards(1) must return one card");
    list.mockResolvedValueOnce({ items: [only], nextCursor: null });

    const { result } = renderHook(() => useFeedDeck(NO_FILTERS));
    await waitFor(() => expect(result.current.state.kind).toBe("ready"));

    act(() => result.current.onSwipe(only.id, "left"));

    expect(result.current.state).toEqual({ kind: "exhausted", seenCount: 1 });
  });

  /**
   * Caught on review: nothing pinned that mounting the deck alone — no
   * swipe yet — doesn't already mint a session. `session.bootstrap` only
   * fires from the first real swipe; a deck that bootstraps eagerly on
   * mount would set the `__Host-session` cookie for every visitor who
   * merely opens the deck and never decides on anything, which is a
   * materially different privacy posture than this row's own design
   * intends (see R0's cookie investigation, this same session).
   */
  it("does not bootstrap a session merely by loading the deck, before any swipe", async () => {
    list.mockResolvedValueOnce({ items: generateMockCards(3), nextCursor: null });

    const { result } = renderHook(() => useFeedDeck(NO_FILTERS));
    await waitFor(() => expect(result.current.state.kind).toBe("ready"));

    expect(bootstrap).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  /**
   * R1 (Phase R, 2026-09): the whole point of wiring this up — a skip or a
   * write-intent must reach `swipes.record` with the domain's own
   * direction vocabulary (`pass`/`interested`), not the deck UI's
   * `left`/`right`, which exists only because that's the gesture, not a
   * product concept. Bootstrap must resolve before record fires — a
   * `swipes.record` call with no session is a guaranteed
   * `UNAUTHENTICATED` (see `apps/web/src/api/handlers/swipes.ts`).
   */
  it.each([
    ["left", "pass"],
    ["right", "interested"],
  ] as const)(
    "a %s swipe records as direction=%s, after bootstrapping the session",
    async (uiDirection, domainDirection) => {
      const [only] = generateMockCards(1);
      if (!only) throw new Error("generateMockCards(1) must return one card");
      list.mockResolvedValueOnce({ items: [only], nextCursor: "cursor-1" });

      const { result } = renderHook(() => useFeedDeck(NO_FILTERS));
      await waitFor(() => expect(result.current.state.kind).toBe("ready"));

      act(() => result.current.onSwipe(only.id, uiDirection));

      await waitFor(() => expect(record).toHaveBeenCalledTimes(1));
      expect(bootstrap).toHaveBeenCalledTimes(1);
      expect(record).toHaveBeenCalledWith({
        animalId: only.id,
        direction: domainDirection,
        at: expect.any(Date),
      });
    },
  );

  /**
   * Mint-or-return makes a second `bootstrap` call harmless server-side,
   * but swiping is high-frequency — this is the guarantee that the
   * *client* never pays for a second round trip it doesn't need. Verified
   * by mutation: removing `sessionReadyRef`'s memoisation in
   * `use-feed-deck.ts` (calling `feedBrowserClient.session.bootstrap`
   * directly inside `onSwipe` instead of through `ensureSession`) turns
   * this from 1 call to 2.
   */
  it("bootstraps the session at most once across multiple swipes", async () => {
    const [first, second] = generateMockCards(2);
    if (!first || !second) throw new Error("generateMockCards(2) must return two cards");
    list.mockResolvedValueOnce({ items: [first, second], nextCursor: null });

    const { result } = renderHook(() => useFeedDeck(NO_FILTERS));
    await waitFor(() => expect(result.current.state.kind).toBe("ready"));

    act(() => result.current.onSwipe(first.id, "left"));
    act(() => result.current.onSwipe(second.id, "right"));

    await waitFor(() => expect(record).toHaveBeenCalledTimes(2));
    expect(bootstrap).toHaveBeenCalledTimes(1);
  });

  /**
   * Caught on review: the memoised promise pattern above caches a
   * *failed* bootstrap just as eagerly as a successful one — `??=` only
   * reassigns when the ref is null/undefined, and a resolved-false
   * promise is neither. A swipe made while briefly offline would
   * otherwise poison every later swipe in the same page load, silently,
   * even once the network returned. `ensureSession` clears the ref on
   * failure specifically so the next swipe gets a fresh attempt.
   */
  it("retries bootstrapping on a later swipe after an earlier bootstrap failed", async () => {
    const [first, second] = generateMockCards(2);
    if (!first || !second) throw new Error("generateMockCards(2) must return two cards");
    list.mockResolvedValueOnce({ items: [first, second], nextCursor: null });
    bootstrap.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({});

    const { result } = renderHook(() => useFeedDeck(NO_FILTERS));
    await waitFor(() => expect(result.current.state.kind).toBe("ready"));

    act(() => result.current.onSwipe(first.id, "left"));
    await waitFor(() => expect(bootstrap).toHaveBeenCalledTimes(1));
    // The failed bootstrap must not have recorded anything.
    expect(record).not.toHaveBeenCalled();

    act(() => result.current.onSwipe(second.id, "right"));
    await waitFor(() => expect(bootstrap).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(record).toHaveBeenCalledTimes(1));
    expect(record).toHaveBeenCalledWith({
      animalId: second.id,
      direction: "interested",
      at: expect.any(Date),
    });
  });

  /**
   * Decision #9 (`CLAUDE.md`): swipes are "best-effort and batchable" —
   * a device offline mid-swipe must not freeze or roll back the deck the
   * adopter is already looking at. The local advance (asserted below)
   * happens synchronously inside `onSwipe`, before the async
   * bootstrap/record chain even starts; this test's real job is
   * confirming a rejection in that chain has no visible effect at all,
   * not even a thrown/unhandled rejection.
   */
  it("a swipes.record failure does not block or roll back the deck's own advance", async () => {
    const [first, second] = generateMockCards(2);
    if (!first || !second) throw new Error("generateMockCards(2) must return two cards");
    list.mockResolvedValueOnce({ items: [first, second], nextCursor: null });
    record.mockRejectedValueOnce(new Error("network down"));

    const { result } = renderHook(() => useFeedDeck(NO_FILTERS));
    await waitFor(() => expect(result.current.state.kind).toBe("ready"));

    act(() => result.current.onSwipe(first.id, "left"));

    expect(result.current.state).toEqual({ kind: "ready", cards: [second] });
    await waitFor(() => expect(record).toHaveBeenCalledTimes(1));
  });

  it("a network failure (no oRPC response at all) maps to the offline reason", async () => {
    list.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const { result } = renderHook(() => useFeedDeck(NO_FILTERS));
    await waitFor(() => expect(result.current.state).toEqual({ kind: "error", reason: "offline" }));
  });

  it("an INVALID_CURSOR oRPC error maps to sessionExpired, not the generic loadFailed copy", async () => {
    // `defined: true` matters: it's what real contract-declared errors carry
    // once the client deserializes them, and what `isDefinedError` (the
    // hook's own check) actually keys on — a bare `new ORPCError(code)`
    // defaults to `defined: false` and would silently take the "loadFailed"
    // branch instead, testing nothing.
    list.mockRejectedValueOnce(new ORPCError("INVALID_CURSOR", { defined: true }));

    const { result } = renderHook(() => useFeedDeck(NO_FILTERS));
    await waitFor(() =>
      expect(result.current.state).toEqual({ kind: "error", reason: "sessionExpired" }),
    );
  });

  /**
   * The bug this guards: the rate limiter's raw `new Response("Too Many
   * Requests", {status:429})` (apps/web/src/app/api/rpc/[...rpc]/route.ts)
   * never reaches oRPC's own handler, so the client can't decode it as a
   * *defined* contract error — `isDefinedError` is false for it, same as
   * for any undeclared server-side failure. The hook used to key "offline"
   * off `!isDefinedError`, which put both of those on «БЕЗ ЗВ'ЯЗКУ — Зараз
   * немає інтернету» even though the server responded and the user's
   * network is fine. `error instanceof TypeError` is the real signal for
   * "the fetch never reached a server at all" — this is not that.
   */
  it("an undeclared server-side error is loadFailed, never offline — the network is fine", async () => {
    list.mockRejectedValueOnce(new ORPCError("INTERNAL_SERVER_ERROR", { defined: false }));

    const { result } = renderHook(() => useFeedDeck(NO_FILTERS));
    await waitFor(() =>
      expect(result.current.state).toEqual({ kind: "error", reason: "loadFailed" }),
    );
  });

  /**
   * A malformed, non-oRPC-shaped response (the raw 429 text body above is
   * exactly this in practice) doesn't necessarily deserialize as an
   * `ORPCError` at all — it can surface as a plain parse error. Still not
   * "offline": the server responded, it just didn't respond the way oRPC
   * expects.
   */
  it("a non-ORPCError, non-TypeError failure is loadFailed, not offline", async () => {
    list.mockRejectedValueOnce(
      new Error("Unexpected token 'T', \"Too Many...\" is not valid JSON"),
    );

    const { result } = renderHook(() => useFeedDeck(NO_FILTERS));
    await waitFor(() =>
      expect(result.current.state).toEqual({ kind: "error", reason: "loadFailed" }),
    );
  });

  /**
   * The bug this guards: filters changing while a fetch for the *old*
   * filters is still in flight used to let that stale response win once it
   * resolved — landing the old filters' cards, and its cursor, under the
   * new filters' header, silently. `renderHook`'s `rerender` changes the
   * hook's `filters` argument the same way a prop change would; the first
   * `list` call is left unresolved on purpose to simulate it losing the
   * race.
   */
  it("a stale response from a superseded filter set is discarded, not applied", async () => {
    let resolveStale:
      | ((value: { items: unknown[]; nextCursor: string | null }) => void)
      | undefined;
    const stale = new Promise((resolve) => {
      resolveStale = resolve;
    });
    list.mockReturnValueOnce(stale);
    const freshCards = generateMockCards(2);
    list.mockResolvedValueOnce({ items: freshCards, nextCursor: null });

    const OTHER_FILTERS = withToggledSpecies(NO_FILTERS, "dog");
    const { result, rerender } = renderHook(({ filters }) => useFeedDeck(filters), {
      initialProps: { filters: NO_FILTERS },
    });

    rerender({ filters: OTHER_FILTERS });
    await waitFor(() => expect(result.current.state.kind).toBe("ready"));
    expect(result.current.state).toEqual({ kind: "ready", cards: freshCards });

    // The stale request finally resolves — it must not overwrite the
    // already-settled, correct state above.
    resolveStale?.({ items: generateMockCards(9), nextCursor: "stale-cursor" });
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.state).toEqual({ kind: "ready", cards: freshCards });
  });

  /**
   * The generation check (above) discards a stale *response*; this is the
   * separate guarantee that a superseded fetch is also actually cancelled,
   * not just ignored — confirmed by mutation, not assumed: deleting the
   * entry effect's `return () => controller.abort()` in use-feed-deck.ts
   * leaves this test's `signal.aborted` false while every other test in
   * this file still passes, since none of the others can tell an aborted
   * request from an ignored one.
   */
  it("aborts the superseded fetch's own request when filters change mid-flight", async () => {
    let capturedSignal: AbortSignal | undefined;
    list.mockImplementationOnce((_input, options?: { signal?: AbortSignal }) => {
      capturedSignal = options?.signal;
      return new Promise(() => {}); // never resolves — only the abort matters
    });
    list.mockResolvedValueOnce({ items: generateMockCards(1), nextCursor: null });

    const OTHER_FILTERS = withToggledSpecies(NO_FILTERS, "dog");
    const { rerender } = renderHook(({ filters }) => useFeedDeck(filters), {
      initialProps: { filters: NO_FILTERS },
    });

    expect(capturedSignal?.aborted).toBe(false);
    rerender({ filters: OTHER_FILTERS });

    expect(capturedSignal?.aborted).toBe(true);
  });

  it("retry after an error restarts from page one, not from the failed cursor", async () => {
    list
      .mockRejectedValueOnce(new ORPCError("RATE_LIMITED", { defined: true }))
      .mockResolvedValueOnce({ items: generateMockCards(1), nextCursor: null });

    const { result } = renderHook(() => useFeedDeck(NO_FILTERS));
    await waitFor(() =>
      expect(result.current.state).toEqual({ kind: "error", reason: "loadFailed" }),
    );

    act(() => result.current.onRetry());
    await waitFor(() => expect(result.current.state.kind).toBe("ready"));

    expect(list).toHaveBeenLastCalledWith(
      { filters: NO_FILTERS, cursor: null, limit: 20 },
      { signal: expect.any(AbortSignal) },
    );
  });
});
