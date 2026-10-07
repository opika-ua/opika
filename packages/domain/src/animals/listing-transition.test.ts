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
  publishGaps,
  transitionListing,
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
      return { kind, publishedAt: PUBLISHED_AT, confirmedAt: CONFIRMED_AT };
    case "reserved":
      return { kind, since: SINCE, publishedAt: PUBLISHED_AT, confirmedAt: CONFIRMED_AT };
    case "adopted":
      return { kind, adoptedAt: ENDED_AT };
    case "withdrawn":
      return { kind, withdrawnAt: ENDED_AT, reason: "listing_error" };
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
};

const eventFor = (type: ListingEventType, at: Date = T1): ListingEvent =>
  type === "withdraw" ? { type, at, reason: "transferred" } : { type, at };

/** The expected next state for every legal pair; every pair absent here must be refused. */
const LEGAL: Partial<Record<ListingKind, Partial<Record<ListingEventType, AnimalListingState>>>> = {
  draft: {
    publish: { kind: "published", publishedAt: T1, confirmedAt: T1 },
  },
  published: {
    reserve: { kind: "reserved", since: T1, publishedAt: PUBLISHED_AT, confirmedAt: CONFIRMED_AT },
    adopt: { kind: "adopted", adoptedAt: T1 },
    withdraw: { kind: "withdrawn", withdrawnAt: T1, reason: "transferred" },
    confirm: { kind: "published", publishedAt: PUBLISHED_AT, confirmedAt: T1 },
  },
  reserved: {
    release: { kind: "published", publishedAt: PUBLISHED_AT, confirmedAt: CONFIRMED_AT },
    adopt: { kind: "adopted", adoptedAt: T1 },
    withdraw: { kind: "withdrawn", withdrawnAt: T1, reason: "transferred" },
    confirm: { kind: "reserved", since: SINCE, publishedAt: PUBLISHED_AT, confirmedAt: T1 },
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
    expect(LISTING_KINDS.length * LISTING_EVENT_TYPES.length).toBe(35);
  });

  for (const kind of LISTING_KINDS) {
    for (const eventType of LISTING_EVENT_TYPES) {
      const expected = LEGAL[kind]?.[eventType];

      if (expected === undefined) {
        it(`refuses ${kind} --${eventType}-->`, () => {
          expect(transitionListing(stateFor(kind), eventFor(eventType))).toEqual({
            kind: "illegal",
            from: kind,
            event: eventType,
          });
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
  it("treats adopted as terminal — nothing leaves it", () => {
    for (const eventType of LISTING_EVENT_TYPES) {
      expect(transitionListing(stateFor("adopted"), eventFor(eventType)).kind).toBe("illegal");
    }
  });

  it("restarts the wait clock when a withdrawn listing is published again", () => {
    const draft = expectOk(transitionListing(stateFor("withdrawn"), eventFor("restore_to_draft")));
    const republished = expectOk(transitionListing(draft, eventFor("publish")));
    expect(republished).toEqual({ kind: "published", publishedAt: T1, confirmedAt: T1 });
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

  it("publishes a draft at any instant — a draft records none to be ordered against", () => {
    const ancient = new Date("2000-01-01T00:00:00.000Z");
    expect(expectOk(transitionListing(stateFor("draft"), eventFor("publish", ancient)))).toEqual({
      kind: "published",
      publishedAt: ancient,
      confirmedAt: ancient,
    });
  });
});

describe("publishGaps", () => {
  it("names the missing photo", () => {
    expect(publishGaps({ photos: [] })).toEqual([{ kind: "photo" }]);
  });

  it("is empty once there is a photo", () => {
    expect(
      publishGaps({ photos: [{ storageKey: "k", width: 800, height: 1000, alt: null }] }),
    ).toEqual([]);
  });
});
