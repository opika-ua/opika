import { describe, expect, it } from "vitest";
import { AdopterIdSchema, AnimalIdSchema } from "../primitives/ids";
import {
  DEFAULT_SEEN_SET_POLICY,
  excludedAnimalIds,
  type Swipe,
  type SwipeDirection,
  stillExcludes,
} from "./seen-set";

const NOW = new Date("2026-08-05T00:00:00.000Z");
const ADOPTER = AdopterIdSchema.parse("11111111-1111-4111-8111-111111111111");

const daysAgo = (days: number): Date => new Date(NOW.getTime() - days * 86_400_000);

const animalId = (index: number) =>
  AnimalIdSchema.parse(`cccccccc-cccc-4ccc-8ccc-${String(index).padStart(12, "0")}`);

const swipe = (index: number, direction: SwipeDirection, days: number): Swipe => ({
  adopterId: ADOPTER,
  animalId: animalId(index),
  direction,
  at: daysAgo(days),
});

describe("stillExcludes", () => {
  it("keeps an interested animal out of the feed permanently", () => {
    // The adopter already acted on it; showing it again reads as a bug.
    expect(stillExcludes(swipe(1, "interested", 3650), NOW, DEFAULT_SEEN_SET_POLICY)).toBe(true);
  });

  it("lets a passed animal return once the window elapses", () => {
    expect(stillExcludes(swipe(1, "pass", 5), NOW, DEFAULT_SEEN_SET_POLICY)).toBe(true);
    expect(stillExcludes(swipe(1, "pass", 31), NOW, DEFAULT_SEEN_SET_POLICY)).toBe(false);
  });

  it("excludes passes forever when the window is null", () => {
    const policy = { ...DEFAULT_SEEN_SET_POLICY, reshowAfterDays: null };
    expect(stillExcludes(swipe(1, "pass", 3650), NOW, policy)).toBe(true);
  });
});

describe("excludedAnimalIds", () => {
  it("drops expired passes but keeps interested ones", () => {
    const result = excludedAnimalIds(
      [swipe(1, "pass", 60), swipe(2, "interested", 60), swipe(3, "pass", 2)],
      NOW,
      DEFAULT_SEEN_SET_POLICY,
    );

    expect(result).toEqual([animalId(3), animalId(2)]);
  });

  it("caps the set, because it becomes a query parameter on every request", () => {
    // An unbounded array shipped into each feed query is the failure to design
    // out before the deck exists rather than after.
    const swipes = Array.from({ length: 50 }, (_, index) => swipe(index, "interested", index));
    const result = excludedAnimalIds(swipes, NOW, {
      ...DEFAULT_SEEN_SET_POLICY,
      maxTracked: 10,
    });

    expect(result).toHaveLength(10);
  });

  it("keeps the newest when it has to drop some", () => {
    const swipes = [swipe(1, "interested", 100), swipe(2, "interested", 1)];
    const result = excludedAnimalIds(swipes, NOW, { ...DEFAULT_SEEN_SET_POLICY, maxTracked: 1 });
    expect(result).toEqual([animalId(2)]);
  });

  it("de-duplicates an animal swiped more than once", () => {
    const result = excludedAnimalIds(
      [swipe(1, "pass", 5), swipe(1, "interested", 1)],
      NOW,
      DEFAULT_SEEN_SET_POLICY,
    );
    expect(result).toEqual([animalId(1)]);
  });

  it("returns nothing when every pass has expired", () => {
    expect(excludedAnimalIds([swipe(1, "pass", 90)], NOW, DEFAULT_SEEN_SET_POLICY)).toEqual([]);
  });
});
