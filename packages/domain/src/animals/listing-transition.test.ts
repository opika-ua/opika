import { describe, expect, it } from "vitest";
import { type AnimalListingState, AnimalListingStateSchema } from "./listing";
import {
  LISTING_EVENT_TYPES,
  LISTING_KINDS,
  type ListingEvent,
  ListingEventSchema,
  type ListingEventType,
  type ListingKind,
  type ListingTransitionResult,
  transitionListing,
  UNDO_SHOWN_MS,
  UNDO_WINDOW_MS,
} from "./listing-transition";

/** Every state's own instants are distinct, so carrying the wrong one forward is visible. */
const PUBLISHED_AT = new Date("2026-03-01T00:00:00.000Z");
const CONFIRMED_AT = new Date("2026-04-01T00:00:00.000Z");
const SINCE = new Date("2026-05-01T00:00:00.000Z");
const ENDED_AT = new Date("2026-05-15T00:00:00.000Z");
/** After every state's own instants. */
const T1 = new Date("2026-06-01T00:00:00.000Z");

const stateFor = (kind: ListingKind): AnimalListingState => {
  switch (kind) {
    case "draft":
      return { kind };
    case "published":
      return { kind, publishedAt: PUBLISHED_AT, confirmedAt: CONFIRMED_AT, undoable: null };
    case "reserved":
      return {
        kind,
        since: SINCE,
        publishedAt: PUBLISHED_AT,
        confirmedAt: CONFIRMED_AT,
        undoable: null,
      };
    case "adopted":
      return { kind, adoptedAt: ENDED_AT };
    case "withdrawn":
      return { kind, withdrawnAt: ENDED_AT, reason: { code: "listing_error", note: null } };
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
};

const eventFor = (type: ListingEventType, at: Date = T1): ListingEvent =>
  type === "withdraw" ? { type, at, reason: { code: "transferred", note: null } } : { type, at };

/** The expected next state for every legal pair; every pair absent here must be refused. */
const LEGAL: Partial<Record<ListingKind, Partial<Record<ListingEventType, AnimalListingState>>>> = {
  draft: {
    publish: { kind: "published", publishedAt: T1, confirmedAt: T1, undoable: null },
  },
  published: {
    reserve: {
      kind: "reserved",
      since: T1,
      publishedAt: PUBLISHED_AT,
      confirmedAt: CONFIRMED_AT,
      undoable: null,
    },
    adopt: { kind: "adopted", adoptedAt: T1 },
    withdraw: { kind: "withdrawn", withdrawnAt: T1, reason: { code: "transferred", note: null } },
    confirm: {
      kind: "published",
      publishedAt: PUBLISHED_AT,
      confirmedAt: T1,
      undoable: { previousConfirmedAt: CONFIRMED_AT, confirmedAt: T1 },
    },
  },
  reserved: {
    release: {
      kind: "published",
      publishedAt: PUBLISHED_AT,
      confirmedAt: CONFIRMED_AT,
      undoable: null,
    },
    adopt: { kind: "adopted", adoptedAt: T1 },
    withdraw: { kind: "withdrawn", withdrawnAt: T1, reason: { code: "transferred", note: null } },
    confirm: {
      kind: "reserved",
      since: SINCE,
      publishedAt: PUBLISHED_AT,
      confirmedAt: T1,
      undoable: { previousConfirmedAt: CONFIRMED_AT, confirmedAt: T1 },
    },
  },
  withdrawn: {
    restore_to_draft: { kind: "draft" },
  },
};

const expectOk = (result: ListingTransitionResult): AnimalListingState => {
  expect(result.kind, JSON.stringify(result)).toBe("ok");
  return (result as Extract<ListingTransitionResult, { kind: "ok" }>).next;
};

describe("listing transition table", () => {
  it("covers every (state, event) pair the schemas define", () => {
    expect(LISTING_KINDS.length).toBe(AnimalListingStateSchema.options.length);
    expect(LISTING_EVENT_TYPES.length).toBe(ListingEventSchema.options.length);
    expect(LISTING_KINDS.length * LISTING_EVENT_TYPES.length).toBe(40);
  });

  for (const kind of LISTING_KINDS) {
    for (const eventType of LISTING_EVENT_TYPES) {
      const expected = LEGAL[kind]?.[eventType];

      if (expected === undefined) {
        // On the two visible states the move exists but has nothing to undo
        // (stateFor carries `undoable: null`), which is its own answer.
        const visible = kind === "published" || kind === "reserved";
        const refusal =
          eventType === "undo_confirm" && visible
            ? { kind: "undo_expired" }
            : { kind: "illegal", from: kind, event: eventType };
        it(`refuses ${kind} --${eventType}--> (${refusal.kind})`, () => {
          expect(transitionListing(stateFor(kind), eventFor(eventType))).toEqual(refusal);
        });
        continue;
      }

      // The whole next state, not just its kind: `release` resetting
      // `publishedAt`, or `confirm` touching `since`, would pass a kind check.
      it(`allows ${kind} --${eventType}--> ${expected.kind}, carrying exactly the right instants`, () => {
        const next = expectOk(transitionListing(stateFor(kind), eventFor(eventType)));
        expect(next).toEqual(expected);
        expect(AnimalListingStateSchema.parse(next)).toEqual(expected);
      });
    }
  }
});

describe("the decisions the table encodes, named", () => {
  /** H2-7: a returned animal is a new listing, not this one reopened. */
  it("treats adopted as terminal - nothing leaves it", () => {
    for (const eventType of LISTING_EVENT_TYPES) {
      expect(transitionListing(stateFor("adopted"), eventFor(eventType)).kind).toBe("illegal");
    }
  });

  it("restarts the wait clock when a withdrawn listing is published again", () => {
    const draft = expectOk(transitionListing(stateFor("withdrawn"), eventFor("restore_to_draft")));
    const republished = expectOk(transitionListing(draft, eventFor("publish")));
    expect(republished).toEqual({
      kind: "published",
      publishedAt: T1,
      confirmedAt: T1,
      undoable: null,
    });
  });

  /** Decision #16: a reservation falling through doesn't move the animal in either ordering. */
  it("keeps both publishedAt and confirmedAt through a reservation and its release", () => {
    const reserved = expectOk(transitionListing(stateFor("published"), eventFor("reserve")));
    const released = expectOk(transitionListing(reserved, eventFor("release")));
    expect(released).toEqual(stateFor("published"));
  });
});

describe("ordering", () => {
  it("refuses a confirmation older than the last one", () => {
    const before = new Date(CONFIRMED_AT.getTime() - 1);
    expect(transitionListing(stateFor("published"), eventFor("confirm", before))).toEqual({
      kind: "non_monotonic",
      from: "published",
      stateTimestamp: CONFIRMED_AT,
      eventTimestamp: before,
    });
  });

  /** For a reservation the latest instant is `since`, which is after the last confirmation here. */
  it("refuses an adoption dated before the reservation it ends", () => {
    const between = new Date(SINCE.getTime() - 1);
    expect(transitionListing(stateFor("reserved"), eventFor("adopt", between))).toEqual({
      kind: "non_monotonic",
      from: "reserved",
      stateTimestamp: SINCE,
      eventTimestamp: between,
    });
  });

  it("checks legality before ordering", () => {
    const ancient = new Date("2000-01-01T00:00:00.000Z");
    expect(transitionListing(stateFor("adopted"), eventFor("confirm", ancient)).kind).toBe(
      "illegal",
    );
  });

  it("publishes a draft at any instant - a draft records none to be ordered against", () => {
    const ancient = new Date("2000-01-01T00:00:00.000Z");
    expect(expectOk(transitionListing(stateFor("draft"), eventFor("publish", ancient)))).toEqual({
      kind: "published",
      publishedAt: ancient,
      confirmedAt: ancient,
      undoable: null,
    });
  });
});

describe("withdrawing", () => {
  it("keeps the shelter's note on the withdrawn state", () => {
    const reason = { code: "other", note: "Забрали родичі волонтерки" } as const;
    expect(
      expectOk(transitionListing(stateFor("published"), { type: "withdraw", at: T1, reason })),
    ).toEqual({ kind: "withdrawn", withdrawnAt: T1, reason });
  });
});

/** H2-16 → B, S3-Q1 → A: undo restores the stored instant exactly, and only within the window. */
describe("undoing a confirmation", () => {
  const at = (ms: number) => new Date(T1.getTime() + ms);
  const confirmAt = (state: Parameters<typeof transitionListing>[0], when: Date) =>
    expectOk(transitionListing(state, { type: "confirm", at: when }));

  it("restores exactly the confirmation the confirm replaced", () => {
    const confirmedOnce = confirmAt(stateFor("published"), T1);
    expect(
      expectOk(transitionListing(confirmedOnce, { type: "undo_confirm", at: at(2_000) })),
    ).toEqual(stateFor("published"));
  });

  /** Oleksii's test, verbatim in sense: confirm, confirm, undo → the value before the first confirm. */
  it("after a double tap, undo still restores the value from before the first confirm", () => {
    const first = confirmAt(stateFor("published"), T1);
    const second = confirmAt(first, at(1_000));
    const undone = expectOk(transitionListing(second, { type: "undo_confirm", at: at(2_000) }));
    expect(undone.kind === "published" && undone.confirmedAt).toEqual(CONFIRMED_AT);
  });

  /**
   * The screen's «Скасувати · N с» must close before the server's window
   * does (review of #129, note 3): an undo tapped at the last shown second
   * still lands, with slack for the round trip, never refused while offered.
   */
  it("the screen shows its undo strictly inside the server's window, with slack", () => {
    expect(UNDO_SHOWN_MS).toBeGreaterThan(0);
    expect(UNDO_WINDOW_MS).toBeGreaterThan(UNDO_SHOWN_MS);
    const confirmedOnce = confirmAt(stateFor("published"), T1);
    expect(
      transitionListing(confirmedOnce, { type: "undo_confirm", at: at(UNDO_SHOWN_MS) }).kind,
    ).toBe("ok");
  });

  it("accepts an undo at the last instant of the window and refuses one just after", () => {
    const confirmedOnce = confirmAt(stateFor("reserved"), T1);
    expect(
      transitionListing(confirmedOnce, { type: "undo_confirm", at: at(UNDO_WINDOW_MS) }).kind,
    ).toBe("ok");
    expect(
      transitionListing(confirmedOnce, { type: "undo_confirm", at: at(UNDO_WINDOW_MS + 1) }),
    ).toEqual({ kind: "undo_expired" });
  });

  /** A confirm outside the window starts a new undo from the current value, not the stale one. */
  it("a confirm after the window has closed undoes only to the confirmation just before it", () => {
    const first = confirmAt(stateFor("published"), T1);
    const late = confirmAt(first, at(UNDO_WINDOW_MS + 1_000));
    const undone = expectOk(
      transitionListing(late, { type: "undo_confirm", at: at(UNDO_WINDOW_MS + 2_000) }),
    );
    expect(undone.kind === "published" && undone.confirmedAt).toEqual(T1);
  });

  it("can't undo once anything else has been written since", () => {
    const confirmedOnce = confirmAt(stateFor("published"), T1);
    const reserved = expectOk(transitionListing(confirmedOnce, { type: "reserve", at: at(1_000) }));
    expect(transitionListing(reserved, { type: "undo_confirm", at: at(2_000) })).toEqual({
      kind: "undo_expired",
    });
  });

  /**
   * `release` keeps `confirmedAt`, so the "same confirmation" check alone
   * wouldn't stop an undo here: only `release` clearing `undoable` does.
   */
  it("can't undo across a release, though release keeps the confirmation date", () => {
    const confirmedOnce = confirmAt(stateFor("reserved"), T1);
    const released = expectOk(transitionListing(confirmedOnce, { type: "release", at: at(1_000) }));
    expect(released.kind === "published" && released.confirmedAt).toEqual(T1);
    expect(transitionListing(released, { type: "undo_confirm", at: at(2_000) })).toEqual({
      kind: "undo_expired",
    });
  });

  /**
   * Every event this module emits clears `undoable` when it moves
   * `confirmedAt`, so only a write from outside it (a repository writing the
   * column directly, a future migration) can leave the two out of step. The
   * undo must still refuse rather than roll back that newer date.
   */
  it("refuses when the recorded confirmation isn't the current one", () => {
    const outOfStep = {
      kind: "published" as const,
      publishedAt: PUBLISHED_AT,
      confirmedAt: at(1_000),
      undoable: { previousConfirmedAt: CONFIRMED_AT, confirmedAt: T1 },
    };
    expect(transitionListing(outOfStep, { type: "undo_confirm", at: at(2_000) })).toEqual({
      kind: "undo_expired",
    });
  });

  it("can undo only once", () => {
    const confirmedOnce = confirmAt(stateFor("published"), T1);
    const undone = expectOk(
      transitionListing(confirmedOnce, { type: "undo_confirm", at: at(1_000) }),
    );
    expect(transitionListing(undone, { type: "undo_confirm", at: at(2_000) })).toEqual({
      kind: "undo_expired",
    });
  });
});
