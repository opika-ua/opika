import { NO_FILTERS } from "@opika/domain";
import { ORPCError } from "@orpc/client";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withToggledSpecies } from "../gallery/filter-url";
import { generateMockCards } from "./mock-data";
import { useFeedDeck } from "./use-feed-deck";

const list = vi.fn();

vi.mock("../../api/browser-client", () => ({
  feedBrowserClient: { feed: { list: (...args: unknown[]) => list(...args) } },
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
  });

  it("loads the first page on mount, with a null cursor", async () => {
    const cards = generateMockCards(3);
    list.mockResolvedValueOnce({ items: cards, nextCursor: "cursor-1" });

    const { result } = renderHook(() => useFeedDeck(NO_FILTERS));

    expect(result.current.state).toEqual({ kind: "loading" });
    await waitFor(() => expect(result.current.state.kind).toBe("ready"));

    expect(list).toHaveBeenCalledExactlyOnceWith({
      filters: NO_FILTERS,
      cursor: null,
      limit: 20,
    });
    expect(result.current.state).toEqual({ kind: "ready", cards });
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

    expect(list).toHaveBeenLastCalledWith({
      filters: NO_FILTERS,
      cursor: "cursor-1",
      limit: 20,
    });
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
    list.mockResolvedValueOnce({ items: [only], nextCursor: null });

    const { result } = renderHook(() => useFeedDeck(NO_FILTERS));
    await waitFor(() => expect(result.current.state.kind).toBe("ready"));

    act(() => result.current.onSwipe());

    expect(result.current.state).toEqual({ kind: "exhausted", seenCount: 1 });
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

    expect(list).toHaveBeenLastCalledWith({ filters: NO_FILTERS, cursor: null, limit: 20 });
  });
});
