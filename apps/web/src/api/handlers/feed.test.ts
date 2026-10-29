import { apiErrors, type FeedCursor } from "@opika/contracts";
import { filtersFingerprint, NO_FILTERS } from "@opika/domain";
import { createORPCErrorConstructorMap } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppContext } from "../context";
import { encodeFeedCursor } from "../cursor";

/**
 * The real oRPC mechanism (O-20, 2026-09-10) that gives each thrown error
 * its declared `status`, not a stub - `feedList` no longer constructs
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
 * Only `reachableCount`'s own wiring is under test here - the ternary in
 * `feed.ts` deciding when to call `feedRepo.reachableCount` at all, and
 * what it returns when it doesn't. `feedRepo.list` and `shelterRepo.findByIds`
 * are mocked to return nothing, so the item-mapping pipeline below that
 * ternary runs over an empty page rather than needing real fixtures - this
 * is deliberately not a full `feedList` behaviour test.
 */
describe("feedList - reachableCount wiring", () => {
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
      caller: { kind: "in_process" },
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

  it("is null, and never counts, on a prefetch (non-null cursor) - the total is a snapshot", async () => {
    const adopterId = "11111111-1111-1111-1111-111111111111" as AppContext["adopterId"] & string;
    const fp = filtersFingerprint(NO_FILTERS);
    const cursor = encodeFeedCursor(
      { at: new Date("2026-09-01T00:00:00Z"), id: "some-animal-id" },
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

/**
 * A cursor binds to the exact filter set it was issued under
 * (`filtersFingerprint`, `packages/domain`): a stale fingerprint shape (from
 * before a dimension existed, or from one since removed) must be refused as
 * `INVALID_CURSOR` (the deck restarts from the first page), never decoded
 * into a page of a differently filtered feed. Originally written against
 * fur (DR1, S2), then temperament/colour (pet card PR 1b) - both removed by
 * the gallery filter restructure, which is why this now exercises age and
 * sex instead; the invariant itself is dimension-agnostic.
 */
describe("feedList - a cursor is refused outside the exact filters it was issued under", () => {
  beforeEach(() => {
    listMock.mockReset().mockResolvedValue({ items: [], nextCursor: null });
    reachableCountMock.mockReset().mockResolvedValue(0);
    findByIdsMock.mockReset().mockResolvedValue([]);
  });

  const context: AppContext = {
    db: {} as AppContext["db"],
    adopterId: null,
    tokenHash: null,
    now: new Date("2026-10-20T12:00:00Z"),
    caller: { kind: "in_process" },
    setCookies: [],
  };
  const position = { at: new Date("2026-10-01T00:00:00Z"), id: "some-animal-id" };
  // Fur, temperament and colour (the dimensions this describe block originally
  // exercised) are gone, gallery filter restructure; sex and ages are the
  // current stand-ins for "two real, closed-universe dimensions", same shape.
  const youngOnly = { ...NO_FILTERS, ages: { kind: "oneOf", values: ["young"] } } as const;
  const seniorOnly = { ...NO_FILTERS, ages: { kind: "oneOf", values: ["senior"] } } as const;
  const male = { ...NO_FILTERS, sexes: { kind: "oneOf", values: ["male"] } } as const;

  async function codeOf(promise: Promise<unknown>): Promise<string | null> {
    try {
      await promise;
      return null;
    } catch (error) {
      return (error as { code?: string }).code ?? "thrown without a code";
    }
  }

  it("refuses a cursor signed with a stale fingerprint shape, and never queries a page for it", async () => {
    // A fingerprint with a segment count that cannot match the current
    // function's output - stands in for "a cursor issued before a dimension
    // existed," the thing this test has always guarded, without needing a
    // real dimension from the past to reproduce it.
    const legacy = encodeFeedCursor(position, "*|*|*", "test-secret") as FeedCursor;
    expect(
      await codeOf(feedList({ filters: NO_FILTERS, cursor: legacy, limit: 10 }, context, errors)),
    ).toBe("INVALID_CURSOR");
    expect(listMock).not.toHaveBeenCalled();
  });

  it("refuses a cursor issued for one age bucket and replayed under another, or with sex added", async () => {
    const issued = encodeFeedCursor(
      position,
      filtersFingerprint(youngOnly),
      "test-secret",
    ) as FeedCursor;
    for (const filters of [seniorOnly, { ...youngOnly, sexes: male.sexes }, NO_FILTERS]) {
      expect(
        await codeOf(feedList({ filters, cursor: issued, limit: 10 }, context, errors)),
        JSON.stringify(filters),
      ).toBe("INVALID_CURSOR");
    }
    expect(listMock).not.toHaveBeenCalled();
  });

  it("accepts a cursor issued for the same filters, age and sex together", async () => {
    const both = { ...youngOnly, sexes: male.sexes };
    const issued = encodeFeedCursor(
      position,
      filtersFingerprint(both),
      "test-secret",
    ) as FeedCursor;
    expect(
      await codeOf(feedList({ filters: both, cursor: issued, limit: 10 }, context, errors)),
    ).toBeNull();
    expect(listMock).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: both,
        cursor: { confirmedAt: position.at, id: position.id },
      }),
    );
  });
});
