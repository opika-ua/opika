import { act, renderHook, waitFor } from "@testing-library/react";
import { NO_FILTERS } from "@opika/domain";
import { ORPCError } from "@orpc/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));

    expect(list).toHaveBeenLastCalledWith({
      filters: NO_FILTERS,
      cursor: "cursor-1",
      limit: 20,
    });
    expect(result.current.state).toEqual({
      kind: "ready",
      cards: [...firstPage, ...secondPage],
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
    // defaults to `defined: false` and would silently take the "offline"
    // branch instead, testing nothing.
    list.mockRejectedValueOnce(new ORPCError("INVALID_CURSOR", { defined: true }));

    const { result } = renderHook(() => useFeedDeck(NO_FILTERS));
    await waitFor(() =>
      expect(result.current.state).toEqual({ kind: "error", reason: "sessionExpired" }),
    );
  });

  it("retry after an error restarts from page one, not from the failed cursor", async () => {
    list
      .mockRejectedValueOnce(new ORPCError("RATE_LIMITED", { defined: true }))
      .mockResolvedValueOnce({ items: generateMockCards(1), nextCursor: null });

    const { result } = renderHook(() => useFeedDeck(NO_FILTERS));
    await waitFor(() => expect(result.current.state).toEqual({ kind: "error", reason: "loadFailed" }));

    act(() => result.current.onRetry());
    await waitFor(() => expect(result.current.state.kind).toBe("ready"));

    expect(list).toHaveBeenLastCalledWith({ filters: NO_FILTERS, cursor: null, limit: 20 });
  });
});
