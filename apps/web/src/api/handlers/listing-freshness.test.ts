import type { AnimalListingState } from "@opika/domain";
import { describe, expect, it } from "vitest";
import { listingFreshness } from "./listing-freshness";

const NOW = new Date("2026-10-07T12:00:00.000Z");
const daysBefore = (days: number): Date => new Date(NOW.getTime() - days * 86_400_000);

/**
 * Each instant on the listing is a different age, so measuring from the wrong
 * one gives a visibly different day count.
 */
const PUBLISHED: AnimalListingState = {
  kind: "published",
  publishedAt: daysBefore(90),
  confirmedAt: daysBefore(2),
};
const RESERVED: AnimalListingState = {
  kind: "reserved",
  since: daysBefore(1),
  publishedAt: daysBefore(90),
  confirmedAt: daysBefore(12),
};

describe("listingFreshness", () => {
  it("measures a published listing from its confirmation, not its publication", () => {
    expect(listingFreshness(PUBLISHED, NOW)).toMatchObject({
      ageDays: 2,
      updatedAt: daysBefore(2),
    });
  });

  /** Neither `since` (1 day) nor `publishedAt` (90) — the confirmation (12). */
  it("measures a reserved listing from its confirmation, not the reservation or publication", () => {
    expect(listingFreshness(RESERVED, NOW)).toMatchObject({
      ageDays: 12,
      updatedAt: daysBefore(12),
    });
  });

  /**
   * The state `== null` exists for: `rowToAnimal` doesn't Zod-parse, so a
   * discoverable row missing its `confirmedAt` key arrives as `undefined`.
   * It must hit the named failure, not a TypeError inside `freshnessOf`.
   */
  it("refuses a discoverable listing whose confirmedAt is missing at runtime", () => {
    const missing = {
      kind: "published",
      publishedAt: daysBefore(5),
    } as unknown as AnimalListingState;
    expect(() => listingFreshness(missing, NOW)).toThrow(/reached a freshness calculation/);
  });

  it.each([
    { kind: "draft" },
    { kind: "adopted", adoptedAt: daysBefore(3) },
    { kind: "withdrawn", withdrawnAt: daysBefore(3), reason: "deceased" },
  ] satisfies AnimalListingState[])("refuses a $kind listing loudly", (listing) => {
    expect(() => listingFreshness(listing, NOW)).toThrow(/reached a freshness calculation/);
  });
});
