import { type AnimalListingState, DISCOVERABLE_LISTING_KINDS } from "@opika/domain";
import { describe, expect, it } from "vitest";
import { discoverableListingKind } from "./discoverable-listing-kind";

const AT = new Date("2026-08-06T00:00:00Z");

/**
 * One representative listing per `AnimalListingState` variant, so the
 * non-discoverable half below is exhaustive by construction rather than by
 * whoever wrote the list remembering all five: adding a variant to the union
 * makes this record fail to compile.
 */
const LISTINGS: Record<AnimalListingState["kind"], AnimalListingState> = {
  draft: { kind: "draft" },
  published: { kind: "published", publishedAt: AT },
  reserved: { kind: "reserved", since: AT, publishedAt: AT },
  adopted: { kind: "adopted", adoptedAt: AT },
  withdrawn: { kind: "withdrawn", withdrawnAt: AT, reason: "adopted_elsewhere" },
};

describe("discoverableListingKind", () => {
  for (const kind of DISCOVERABLE_LISTING_KINDS) {
    it(`returns "${kind}" unchanged`, () => {
      expect(discoverableListingKind(LISTINGS[kind])).toBe(kind);
    });
  }

  /**
   * The throw branch, exercised rather than assumed. Without this the guard is
   * decoration: inverting its condition would leave every other test in the
   * repository green, since no query ever produces one of these today — which
   * is exactly the point, because the day one does is the day this has to fire.
   */
  const nonDiscoverable = (Object.keys(LISTINGS) as AnimalListingState["kind"][]).filter(
    (kind) => !(DISCOVERABLE_LISTING_KINDS as readonly string[]).includes(kind),
  );

  it("covers every remaining variant of the union, not an ad-hoc subset", () => {
    expect(nonDiscoverable.length).toBe(
      Object.keys(LISTINGS).length - DISCOVERABLE_LISTING_KINDS.length,
    );
  });

  for (const kind of nonDiscoverable) {
    it(`throws for "${kind}", naming the predicate gap that let it through`, () => {
      expect(() => discoverableListingKind(LISTINGS[kind])).toThrow(
        /query predicate that's supposed to prevent this has a gap/,
      );
    });
  }
});
