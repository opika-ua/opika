import { describe, expect, it } from "vitest";
import { DraftAnimalSchema, ListedAnimalSchema } from "./animal";
import {
  isPastGracePeriod,
  MAX_ANIMAL_PHOTOS,
  PHOTO_MAX_EDGE_PX,
  R2_CLEANUP_GRACE_PERIOD_DAYS,
} from "./photo";

const photo = (n: number) => ({
  storageKey: `animals/a0000000-0000-4000-8000-000000000000/p${n}`,
  width: 800,
  height: 1000,
  alt: null,
});

describe("the photo cap on the stored animal (K-Q11)", () => {
  // Literal values transcribed from Oleksii's answers, not the constants read back.
  it("is ten photos and 2000 px", () => {
    expect(MAX_ANIMAL_PHOTOS).toBe(10);
    expect(PHOTO_MAX_EDGE_PX).toBe(2000);
  });

  it("accepts ten photos and refuses eleven", () => {
    // Both halves of the animal union share the one photo field (`animalCoreShape`).
    for (const photos of [DraftAnimalSchema.shape.photos, ListedAnimalSchema.shape.photos]) {
      expect(photos.safeParse(Array.from({ length: 10 }, (_, i) => photo(i))).success).toBe(true);
      expect(photos.safeParse(Array.from({ length: 11 }, (_, i) => photo(i))).success).toBe(false);
    }
  });
});

describe("isPastGracePeriod (the R2 clean-up's grace period)", () => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const SEEN = new Date("2026-10-18T00:00:00.000Z");

  it("is 7 days, matching Neon's Launch-plan point-in-time-restore window", () => {
    expect(R2_CLEANUP_GRACE_PERIOD_DAYS).toBe(7);
  });

  it("is false one millisecond before the boundary, true exactly at it and after", () => {
    expect(isPastGracePeriod(SEEN, new Date(SEEN.getTime() + 7 * DAY_MS - 1))).toBe(false);
    expect(isPastGracePeriod(SEEN, new Date(SEEN.getTime() + 7 * DAY_MS))).toBe(true);
    expect(isPastGracePeriod(SEEN, new Date(SEEN.getTime() + 7 * DAY_MS + 1))).toBe(true);
  });

  it("takes a graceDays override, for the post-reset manual run", () => {
    expect(isPastGracePeriod(SEEN, new Date(SEEN.getTime() + 1), 0)).toBe(true);
    expect(isPastGracePeriod(SEEN, SEEN, 0)).toBe(true);
    expect(isPastGracePeriod(SEEN, new Date(SEEN.getTime() - 1), 0)).toBe(false);
  });
});
