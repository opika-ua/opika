import { describe, expect, it } from "vitest";
import {
  type AnimalListingState,
  AnimalListingStateSchema,
  DISCOVERABLE_LISTING_KINDS,
  isDiscoverable,
  waitAnchorOf,
} from "./listing";

const AT = new Date("2026-08-05T00:00:00.000Z");
/** Four months before `AT` — the "has waited a long time" end of the range. */
const LONG_AGO = new Date("2026-04-05T00:00:00.000Z");

const states: readonly AnimalListingState[] = [
  { kind: "draft" },
  { kind: "published", publishedAt: AT },
  { kind: "reserved", since: AT, publishedAt: LONG_AGO },
  { kind: "adopted", adoptedAt: AT },
  { kind: "withdrawn", withdrawnAt: AT, reason: "deceased" },
];

describe("isDiscoverable", () => {
  it("publishes exactly published and reserved", () => {
    // A mutant that also published drafts passed the whole suite before this.
    expect(states.filter(isDiscoverable).map((s) => s.kind)).toEqual(["published", "reserved"]);
  });

  it("keeps reserved animals visible, which is a deliberate product choice", () => {
    // A reservation can fall through, and hiding it immediately would empty the
    // feed faster than shelters can refill it.
    expect(isDiscoverable({ kind: "reserved", since: AT, publishedAt: LONG_AGO })).toBe(true);
  });

  it("agrees with the constant the query layer will use", () => {
    for (const state of states) {
      expect(isDiscoverable(state)).toBe(
        (DISCOVERABLE_LISTING_KINDS as readonly string[]).includes(state.kind),
      );
    }
  });

  it("covers every variant the schema defines", () => {
    expect(states).toHaveLength(AnimalListingStateSchema.options.length);
  });
});

describe("waitAnchorOf", () => {
  it("is the publication instant for a published listing", () => {
    expect(waitAnchorOf({ kind: "published", publishedAt: LONG_AGO })).toEqual(LONG_AGO);
  });

  it("is continuous across published -> reserved", () => {
    // The defect this whole column exists to prevent: an animal that has waited
    // four months and was reserved today must not read as available-since-today.
    const published: AnimalListingState = { kind: "published", publishedAt: LONG_AGO };
    const reserved: AnimalListingState = { kind: "reserved", since: AT, publishedAt: LONG_AGO };

    expect(waitAnchorOf(reserved)).toEqual(waitAnchorOf(published));
  });

  it("never uses the reservation instant", () => {
    // A mutant returning `since` would satisfy "not null for reserved" and be
    // wrong in exactly the way that is invisible until the sort is inspected.
    expect(waitAnchorOf({ kind: "reserved", since: AT, publishedAt: LONG_AGO })).not.toEqual(AT);
  });

  it("is null for every listing kind an adopter cannot see", () => {
    const undiscoverable = states.filter((state) => !isDiscoverable(state));

    expect(undiscoverable).not.toHaveLength(0);
    for (const state of undiscoverable) {
      expect(waitAnchorOf(state), `${state.kind} should have no wait anchor`).toBeNull();
    }
  });

  it("is non-null for exactly the discoverable kinds", () => {
    for (const state of states) {
      expect(waitAnchorOf(state) !== null, state.kind).toBe(isDiscoverable(state));
    }
  });
});

describe("AnimalListingStateSchema", () => {
  it("requires a reason when withdrawing", () => {
    expect(AnimalListingStateSchema.safeParse({ kind: "withdrawn", withdrawnAt: AT }).success).toBe(
      false,
    );
  });

  it("requires a reserved listing to carry its publication instant", () => {
    // Pre-E0 shape. Accepting it would let a row reach persistence with no
    // wait anchor, which the schema cannot then distinguish from a draft.
    expect(AnimalListingStateSchema.safeParse({ kind: "reserved", since: AT }).success).toBe(false);
  });

  it("rejects a withdrawal reason outside the list", () => {
    expect(
      AnimalListingStateSchema.safeParse({ kind: "withdrawn", withdrawnAt: AT, reason: "bored" })
        .success,
    ).toBe(false);
  });
});
