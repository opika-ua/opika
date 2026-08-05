import { describe, expect, it } from "vitest";
import { type AgeEstimate, ageBucketOf, isAgeEstimateStale } from "./age.js";

const NOW = new Date("2026-08-05T00:00:00.000Z");

const yearsBefore = (years: number): Date =>
  new Date(NOW.getTime() - years * 365.2425 * 86_400_000);

describe("ageBucketOf, from a birth date", () => {
  const cases: ReadonlyArray<[number, string]> = [
    [0, "baby"],
    [0.5, "baby"],
    [0.99, "baby"],
    [1.01, "young"],
    [2, "young"],
    [2.99, "young"],
    [3.01, "adult"],
    [5, "adult"],
    [7.99, "adult"],
    [8.01, "senior"],
    [15, "senior"],
  ];

  for (const [years, expected] of cases) {
    it(`places an animal born ${years}y ago in ${expected}`, () => {
      const estimate: AgeEstimate = {
        kind: "birth_date",
        date: yearsBefore(years),
        precision: "day",
      };
      expect(ageBucketOf(estimate, NOW)).toBe(expected);
    });
  }

  it("treats a birth date in the future as newborn rather than negative", () => {
    const estimate: AgeEstimate = {
      kind: "birth_date",
      date: new Date(NOW.getTime() + 86_400_000),
      precision: "day",
    };
    expect(ageBucketOf(estimate, NOW)).toBe("baby");
  });
});

describe("ageBucketOf, from a declared bucket", () => {
  it("returns the declared bucket when nothing has elapsed", () => {
    const estimate: AgeEstimate = { kind: "declared_bucket", bucket: "adult", declaredAt: NOW };
    expect(ageBucketOf(estimate, NOW)).toBe("adult");
  });

  it("ages a puppy declared two years ago out of the baby bucket", () => {
    // The listing must not still advertise a puppy. This is the failure the
    // derived bucket exists to prevent.
    const estimate: AgeEstimate = {
      kind: "declared_bucket",
      bucket: "baby",
      declaredAt: yearsBefore(2),
    };
    expect(ageBucketOf(estimate, NOW)).toBe("young");
  });

  it("carries an adult into senior after enough time", () => {
    const estimate: AgeEstimate = {
      kind: "declared_bucket",
      bucket: "adult",
      declaredAt: yearsBefore(6),
    };
    expect(ageBucketOf(estimate, NOW)).toBe("senior");
  });

  it("never reports an animal as younger than it was declared", () => {
    const buckets = ["baby", "young", "adult", "senior"] as const;
    const order = { baby: 0, young: 1, adult: 2, senior: 3 };

    for (const bucket of buckets) {
      for (const years of [0, 0.5, 1, 3, 10]) {
        const estimate: AgeEstimate = {
          kind: "declared_bucket",
          bucket,
          declaredAt: yearsBefore(years),
        };
        expect(order[ageBucketOf(estimate, NOW)]).toBeGreaterThanOrEqual(order[bucket]);
      }
    }
  });

  it("stays at senior, which has no upper bound", () => {
    const estimate: AgeEstimate = {
      kind: "declared_bucket",
      bucket: "senior",
      declaredAt: yearsBefore(20),
    };
    expect(ageBucketOf(estimate, NOW)).toBe("senior");
  });
});

describe("isAgeEstimateStale", () => {
  it("flags a declared bucket that has been carried past its meaning", () => {
    const estimate: AgeEstimate = {
      kind: "declared_bucket",
      bucket: "baby",
      declaredAt: yearsBefore(2),
    };
    expect(isAgeEstimateStale(estimate, NOW)).toBe(true);
  });

  it("does not flag a fresh declaration", () => {
    const estimate: AgeEstimate = { kind: "declared_bucket", bucket: "young", declaredAt: NOW };
    expect(isAgeEstimateStale(estimate, NOW)).toBe(false);
  });

  it("never flags a birth date, which cannot go stale", () => {
    const estimate: AgeEstimate = {
      kind: "birth_date",
      date: yearsBefore(9),
      precision: "year",
    };
    expect(isAgeEstimateStale(estimate, NOW)).toBe(false);
  });
});
