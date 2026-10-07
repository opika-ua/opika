import { apiErrors, type FeedCursor } from "@opika/contracts";
import { filtersFingerprint, NO_FILTERS } from "@opika/domain";
import { createORPCErrorConstructorMap } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppContext } from "../context";
import { encodeFeedCursor } from "../cursor";

/**
 * The real oRPC mechanism (O-20, 2026-09-10) that gives each thrown error
 * its declared `status`, not a stub — `feedList` no longer constructs
 * `ORPCError` itself, so a test double here would test nothing about
 * whether a thrown error carries the right status. None of the three tests
 * below throw, but the handler's own signature now requires this argument
 * either way.
 */
const errors = createORPCErrorConstructorMap({
  INVALID_CURSOR: apiErrors.INVALID_CURSOR,
  RATE_LIMITED: apiErrors.RATE_LIMITED,
});

const listMock = vi.fn();
const reachableCountMock = vi.fn();
const findByIdsMock = vi.fn();

vi.mock("@opika/db/repos", () => ({
  feedRepo: () => ({ list: listMock, reachableCount: reachableCountMock }),
  shelterRepo: () => ({ findByIds: findByIdsMock }),
}));

process.env.CURSOR_HMAC_SECRET = "test-secret";

const { feedList } = await import("./feed");

/**
 * Only `reachableCount`'s own wiring is under test here — the ternary in
 * `feed.ts` deciding when to call `feedRepo.reachableCount` at all, and
 * what it returns when it doesn't. `feedRepo.list` and `shelterRepo.findByIds`
 * are mocked to return nothing, so the item-mapping pipeline below that
 * ternary runs over an empty page rather than needing real fixtures — this
 * is deliberately not a full `feedList` behaviour test.
 */
describe("feedList — reachableCount wiring", () => {
  beforeEach(() => {
    listMock.mockReset().mockResolvedValue({ items: [], nextCursor: null });
    reachableCountMock.mockReset().mockResolvedValue(17);
    findByIdsMock.mockReset().mockResolvedValue([]);
  });

  function makeContext(adopterId: AppContext["adopterId"]): AppContext {
    return {
      db: {} as AppContext["db"],
      adopterId,
      tokenHash: null,
      now: new Date("2026-09-09T12:00:00Z"),
      setCookies: [],
    };
  }

  it("is null, and never counts, on a fresh fetch with no session", async () => {
    const result = await feedList(
      { filters: NO_FILTERS, cursor: null, limit: 10 },
      makeContext(null),
      errors,
    );

    expect(result.reachableCount).toBeNull();
    expect(reachableCountMock).not.toHaveBeenCalled();
  });

  it("counts, for these filters, and returns the count on a fresh fetch with a session", async () => {
    reachableCountMock.mockResolvedValue(17);
    const adopterId = "11111111-1111-1111-1111-111111111111" as AppContext["adopterId"] & string;

    const result = await feedList(
      { filters: NO_FILTERS, cursor: null, limit: 10 },
      makeContext(adopterId),
      errors,
    );

    expect(result.reachableCount).toBe(17);
    expect(reachableCountMock).toHaveBeenCalledWith({
      filters: NO_FILTERS,
      adopterId,
      now: new Date("2026-09-09T12:00:00Z"),
      seenSetPolicy: expect.objectContaining({ maxTracked: expect.any(Number) }),
    });
  });

  it("is null, and never counts, on a prefetch (non-null cursor) — the total is a snapshot", async () => {
    const adopterId = "11111111-1111-1111-1111-111111111111" as AppContext["adopterId"] & string;
    const fp = filtersFingerprint(NO_FILTERS);
    const cursor = encodeFeedCursor(
      { lastUpdatedAt: new Date("2026-09-01T00:00:00Z"), id: "some-animal-id" },
      fp,
      "test-secret",
    );

    const result = await feedList(
      { filters: NO_FILTERS, cursor: cursor as FeedCursor, limit: 10 },
      makeContext(adopterId),
      errors,
    );

    expect(result.reachableCount).toBeNull();
    expect(reachableCountMock).not.toHaveBeenCalled();
  });
});
