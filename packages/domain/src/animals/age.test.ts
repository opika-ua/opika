import { describe, expect, it } from "vitest";
import {
  type AgeEstimate,
  ageAnchorOf,
  ageAnchorRange,
  ageBucketOf,
  isAgeEstimateUncertain,
} from "./age";

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

describe("isAgeEstimateUncertain", () => {
  it("flags a declared bucket whose possible age now spans two buckets", () => {
    const estimate: AgeEstimate = {
      kind: "declared_bucket",
      bucket: "baby",
      declaredAt: yearsBefore(2.5),
    };
    // Declared under a year old, two and a half years ago: now somewhere in
    // [2.5, 3.5) — young or adult, and the data cannot say which.
    expect(isAgeEstimateUncertain(estimate, NOW)).toBe(true);
    expect(ageBucketOf(estimate, NOW)).toBe("young");
  });

  it("does not flag a declaration that is still unambiguous", () => {
    // A baby declared exactly two years ago is 2 to 3 years old, which sits
    // entirely inside `young`. Carrying it forward is precise, not a guess.
    const estimate: AgeEstimate = {
      kind: "declared_bucket",
      bucket: "baby",
      declaredAt: yearsBefore(2),
    };
    expect(isAgeEstimateUncertain(estimate, NOW)).toBe(false);
    expect(ageBucketOf(estimate, NOW)).toBe("young");
  });

  it("does not flag a fresh declaration", () => {
    const estimate: AgeEstimate = { kind: "declared_bucket", bucket: "young", declaredAt: NOW };
    expect(isAgeEstimateUncertain(estimate, NOW)).toBe(false);
  });

  it("never flags a birth date, which cannot become ambiguous", () => {
    const estimate: AgeEstimate = {
      kind: "birth_date",
      date: yearsBefore(9),
      precision: "year",
    };
    expect(isAgeEstimateUncertain(estimate, NOW)).toBe(false);
  });

  it("never flags senior, which has no upper bound to cross", () => {
    const estimate: AgeEstimate = {
      kind: "declared_bucket",
      bucket: "senior",
      declaredAt: yearsBefore(20),
    };
    expect(isAgeEstimateUncertain(estimate, NOW)).toBe(false);
  });
});

describe("ageAnchorOf — the indexable form", () => {
  it("is the birth date itself for a known birth date", () => {
    const date = yearsBefore(4);
    expect(ageAnchorOf({ kind: "birth_date", date, precision: "day" })).toEqual(date);
  });

  it("agrees with ageBucketOf for every bucket at every elapsed time", () => {
    // This is the invariant that lets persistence store one derived column
    // without it ever drifting from the value the feed displays.
    for (const bucket of ["baby", "young", "adult", "senior"] as const) {
      for (const years of [0, 0.5, 1, 2.5, 5, 9, 20]) {
        const estimate: AgeEstimate = {
          kind: "declared_bucket",
          bucket,
          declaredAt: yearsBefore(years),
        };
        const viaAnchor = ageBucketOf(
          { kind: "birth_date", date: ageAnchorOf(estimate), precision: "day" },
          NOW,
        );
        expect(viaAnchor).toBe(ageBucketOf(estimate, NOW));
      }
    }
  });
});

describe("ageAnchorRange — the filter predicate", () => {
  it("selects exactly the animals in the bucket", () => {
    for (const bucket of ["baby", "young", "adult", "senior"] as const) {
      const range = ageAnchorRange(bucket, NOW);

      for (const years of [0, 0.5, 0.99, 1.5, 2.9, 4, 7.9, 8.5, 15]) {
        const anchor = yearsBefore(years);
        const inRange =
          (range.afterExclusive === null || anchor.getTime() > range.afterExclusive.getTime()) &&
          (range.atOrBefore === null || anchor.getTime() <= range.atOrBefore.getTime());

        const actual = ageBucketOf({ kind: "birth_date", date: anchor, precision: "day" }, NOW);
        expect(inRange).toBe(actual === bucket);
      }
    }
  });

  it("leaves senior unbounded below, since it is open-ended", () => {
    expect(ageAnchorRange("senior", NOW).afterExclusive).toBeNull();
  });
});
