import { describe, expect, it } from "vitest";
import {
  type AnimalListingState,
  AnimalListingStateSchema,
  DISCOVERABLE_LISTING_KINDS,
  isDiscoverable,
} from "./listing.js";

const AT = new Date("2026-08-05T00:00:00.000Z");

const states: readonly AnimalListingState[] = [
  { kind: "draft" },
  { kind: "published", publishedAt: AT },
  { kind: "reserved", since: AT },
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
    expect(isDiscoverable({ kind: "reserved", since: AT })).toBe(true);
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

describe("AnimalListingStateSchema", () => {
  it("requires a reason when withdrawing", () => {
    expect(AnimalListingStateSchema.safeParse({ kind: "withdrawn", withdrawnAt: AT }).success).toBe(
      false,
    );
  });

  it("rejects a withdrawal reason outside the list", () => {
    expect(
      AnimalListingStateSchema.safeParse({ kind: "withdrawn", withdrawnAt: AT, reason: "bored" })
        .success,
    ).toBe(false);
  });
});
