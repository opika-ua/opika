import { describe, expect, it } from "vitest";
import {
  calendarDateYearsBefore,
  instantOfCalendarDate,
  kyivCalendarDateOf,
} from "../primitives/calendar-date";
import {
  AGE_DATE_MAX_YEARS_BACK,
  type AgeBucket,
  type AgeEstimate,
  AgeEstimateSchema,
  type AgeSpan,
  ageAnchorOf,
  ageAnchorRange,
  ageBucketOf,
  ageDateProblem,
  ageSpanOf,
  DECLARED_AGE_RANGE_YEARS,
  DECLARED_AGE_RANGES,
  type DeclaredAgeRange,
  declaredAtOfCalendarDate,
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
    // [2.5, 3.5) - young or adult, and the data cannot say which.
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

describe("ageAnchorOf - the indexable form", () => {
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

describe("ageAnchorRange - the filter predicate", () => {
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

/**
 * D3 (Oleksii, verbatim: "Refuse a date in the future (Kyiv) or older than 30
 * years."). Boundaries on Kyiv's calendar, at the instants where it differs
 * from UTC's, and on the floor's own day.
 */
describe("ageDateProblem", () => {
  // 2026-10-16T22:30Z is 01:30 on the 17th in Kyiv (UTC+3 until 25 October).
  const kyivJustAfterMidnight = new Date("2026-10-16T22:30:00.000Z");

  it("allows Kyiv's today even while UTC's date is still yesterday", () => {
    expect(ageDateProblem("2026-10-17", kyivJustAfterMidnight)).toBeNull();
  });

  it("refuses Kyiv's tomorrow as the future", () => {
    expect(ageDateProblem("2026-10-18", kyivJustAfterMidnight)).toEqual({ kind: "future" });
  });

  it("uses winter time after the clocks change (UTC+2)", () => {
    // 2026-12-31T22:30Z is 00:30 on 1 January 2027 in Kyiv.
    const newYearInKyiv = new Date("2026-12-31T22:30:00.000Z");
    expect(ageDateProblem("2027-01-01", newYearInKyiv)).toBeNull();
    expect(ageDateProblem("2027-01-02", newYearInKyiv)).toEqual({ kind: "future" });
    // 21:30Z is 23:30 in Kyiv: still the 31st, so the 1st is tomorrow.
    expect(ageDateProblem("2027-01-01", new Date("2026-12-31T21:30:00.000Z"))).toEqual({
      kind: "future",
    });
  });

  it("allows exactly thirty years ago and refuses the day before", () => {
    expect(ageDateProblem("1996-10-17", kyivJustAfterMidnight)).toBeNull();
    expect(ageDateProblem("1996-10-16", kyivJustAfterMidnight)).toEqual({
      kind: "too_old",
      maxYearsBack: 30,
    });
    // The literal thirty, transcribed from his answer, not the constant read back.
    expect(AGE_DATE_MAX_YEARS_BACK).toBe(30);
  });

  it("bounds a 29 February with no counterpart thirty years earlier", () => {
    const leapDay = new Date("2028-02-29T09:00:00.000Z");
    expect(ageDateProblem("1998-03-01", leapDay)).toBeNull();
    expect(ageDateProblem("1998-02-28", leapDay)).toEqual({ kind: "too_old", maxYearsBack: 30 });
  });
});

describe("calendar dates", () => {
  it("stores a date as UTC midnight and reads the same date back on Kyiv's calendar", () => {
    for (const date of ["2026-01-15", "2026-07-15", "1996-10-17"]) {
      expect(instantOfCalendarDate(date).toISOString()).toBe(`${date}T00:00:00.000Z`);
      expect(kyivCalendarDateOf(instantOfCalendarDate(date))).toBe(date);
    }
  });

  it("subtracts whole years on the calendar", () => {
    expect(calendarDateYearsBefore("2026-10-17", 30)).toBe("1996-10-17");
  });
});

describe("declaredAtOfCalendarDate (a bucket declared «станом на» today, in Kyiv's first hours)", () => {
  // 00:35 Kyiv on 18 October = 21:35 UTC on the 17th: UTC midnight of the 18th is still ahead.
  const kyivJustAfterMidnight = new Date("2026-10-17T21:35:00.000Z");

  it("anchors a date that is today in Kyiv at now, not at the future UTC midnight", () => {
    expect(declaredAtOfCalendarDate("2026-10-18", kyivJustAfterMidnight)).toEqual(
      kyivJustAfterMidnight,
    );
  });

  it("so «Молодий» declared today reads «молодий», not one tier young", () => {
    const declaredAt = declaredAtOfCalendarDate("2026-10-18", kyivJustAfterMidnight);
    expect(
      ageBucketOf({ kind: "declared_bucket", bucket: "young", declaredAt }, kyivJustAfterMidnight),
    ).toBe("young");
  });

  it("leaves a past date at its UTC midnight, the stored convention", () => {
    expect(declaredAtOfCalendarDate("2026-10-01", kyivJustAfterMidnight)).toEqual(
      new Date("2026-10-01T00:00:00.000Z"),
    );
  });
});

/**
 * Age as a declared range (owner, 2026-11-12): six ranges, aged in whole
 * 365.2425-day years from the declared date. The table is the approved
 * shape's §1, transcribed: the span and the filter bucket after n whole years.
 */
describe("declared ranges", () => {
  const YEAR_MS = 365.2425 * 86_400_000;
  const DECLARED = new Date("2026-11-12T00:00:00.000Z");
  const range = (r: DeclaredAgeRange, declaredAt: Date = DECLARED): AgeEstimate => ({
    kind: "declared_range",
    range: r,
    declaredAt,
  });
  const after = (years: number, from: Date = DECLARED) =>
    new Date(from.getTime() + years * YEAR_MS);
  const BUCKET_ORDER = { baby: 0, young: 1, adult: 2, senior: 3 } as const;

  describe("the schema", () => {
    it("accepts each of the six ranges with a declared date", () => {
      const six = ["under_1", "1_2", "3_4", "5_7", "8_10", "10_plus"] as const;
      expect(DECLARED_AGE_RANGES).toEqual(six);
      for (const r of six) expect(AgeEstimateSchema.safeParse(range(r)).success, r).toBe(true);
    });

    it("refuses a range that isn't one of the six, and a range with no declared date", () => {
      expect(
        AgeEstimateSchema.safeParse({ kind: "declared_range", range: "2_3", declaredAt: DECLARED })
          .success,
      ).toBe(false);
      expect(AgeEstimateSchema.safeParse({ kind: "declared_range", range: "3_4" }).success).toBe(
        false,
      );
    });
  });

  const TABLE: ReadonlyArray<[DeclaredAgeRange, number, AgeSpan, AgeBucket]> = [
    ["under_1", 0, { kind: "under_one" }, "baby"],
    ["under_1", 1, { kind: "about", years: 1 }, "young"],
    ["under_1", 2, { kind: "about", years: 2 }, "young"],
    ["under_1", 5, { kind: "about", years: 5 }, "adult"],
    ["1_2", 0, { kind: "between", from: 1, to: 2 }, "young"],
    ["1_2", 1, { kind: "between", from: 2, to: 3 }, "young"],
    ["1_2", 2, { kind: "between", from: 3, to: 4 }, "adult"],
    ["1_2", 5, { kind: "between", from: 6, to: 7 }, "adult"],
    ["3_4", 0, { kind: "between", from: 3, to: 4 }, "adult"],
    ["3_4", 1, { kind: "between", from: 4, to: 5 }, "adult"],
    ["3_4", 2, { kind: "between", from: 5, to: 6 }, "adult"],
    ["3_4", 5, { kind: "between", from: 8, to: 9 }, "senior"],
    ["5_7", 0, { kind: "between", from: 5, to: 7 }, "adult"],
    ["5_7", 1, { kind: "between", from: 6, to: 8 }, "adult"],
    ["5_7", 2, { kind: "between", from: 7, to: 9 }, "adult"],
    ["5_7", 5, { kind: "between", from: 10, to: 12 }, "senior"],
    ["8_10", 0, { kind: "between", from: 8, to: 10 }, "senior"],
    ["8_10", 1, { kind: "between", from: 9, to: 11 }, "senior"],
    ["8_10", 2, { kind: "between", from: 10, to: 12 }, "senior"],
    ["8_10", 5, { kind: "between", from: 13, to: 15 }, "senior"],
    ["10_plus", 0, { kind: "at_least", from: 10 }, "senior"],
    ["10_plus", 1, { kind: "at_least", from: 11 }, "senior"],
    ["10_plus", 2, { kind: "at_least", from: 12 }, "senior"],
    ["10_plus", 5, { kind: "at_least", from: 15 }, "senior"],
  ];

  it.each(TABLE)("%s after %i whole years: %o, filtered as %s", (r, n, span, bucket) => {
    for (const now of [after(n), after(n + 0.5)]) {
      expect(ageSpanOf(range(r), now)).toEqual(span);
      expect(ageBucketOf(range(r), now)).toBe(bucket);
    }
  });

  it("anchors at the declared date minus the range's lower bound, inside its bucket's filter", () => {
    for (const r of DECLARED_AGE_RANGES) {
      const estimate = range(r);
      const anchor = ageAnchorOf(estimate);
      expect(anchor.getTime()).toBe(DECLARED.getTime() - DECLARED_AGE_RANGE_YEARS[r].min * YEAR_MS);
      for (const n of [0, 1, 2, 5, 12]) {
        const now = after(n + 0.3);
        const filter = ageAnchorRange(ageBucketOf(estimate, now), now);
        expect(filter.afterExclusive === null || anchor > filter.afterExclusive, r).toBe(true);
        expect(filter.atOrBefore === null || anchor <= filter.atOrBefore, r).toBe(true);
      }
    }
  });

  describe("the tick: one ms before, and exactly at, k × 365.2425 days", () => {
    const cases: ReadonlyArray<[DeclaredAgeRange, number, AgeSpan, AgeSpan, AgeBucket, AgeBucket]> =
      [
        ["under_1", 1, { kind: "under_one" }, { kind: "about", years: 1 }, "baby", "young"],
        [
          "1_2",
          2,
          { kind: "between", from: 2, to: 3 },
          { kind: "between", from: 3, to: 4 },
          "young",
          "adult",
        ],
        [
          "3_4",
          5,
          { kind: "between", from: 7, to: 8 },
          { kind: "between", from: 8, to: 9 },
          "adult",
          "senior",
        ],
        [
          "5_7",
          3,
          { kind: "between", from: 7, to: 9 },
          { kind: "between", from: 8, to: 10 },
          "adult",
          "senior",
        ],
        [
          "10_plus",
          1,
          { kind: "at_least", from: 10 },
          { kind: "at_least", from: 11 },
          "senior",
          "senior",
        ],
      ];

    it.each(cases)("%s at k = %i", (r, k, spanBefore, spanAt, bucketBefore, bucketAt) => {
      const tick = after(k);
      const justBefore = new Date(tick.getTime() - 1);
      expect(ageSpanOf(range(r), justBefore)).toEqual(spanBefore);
      expect(ageBucketOf(range(r), justBefore)).toBe(bucketBefore);
      expect(ageSpanOf(range(r), tick)).toEqual(spanAt);
      expect(ageBucketOf(range(r), tick)).toBe(bucketAt);
    });
  });

  it("a 29 February «as of» reads back as itself and ticks on 28 February at 05:49:12Z", () => {
    const declaredAt = declaredAtOfCalendarDate("2028-02-29", new Date("2028-06-01T00:00:00Z"));
    expect(kyivCalendarDateOf(declaredAt)).toBe("2028-02-29");
    const tick = new Date("2029-02-28T05:49:12.000Z");
    expect(ageSpanOf(range("3_4", declaredAt), new Date(tick.getTime() - 1))).toEqual({
      kind: "between",
      from: 3,
      to: 4,
    });
    expect(ageSpanOf(range("3_4", declaredAt), tick)).toEqual({ kind: "between", from: 4, to: 5 });
  });

  it("declared «as of» today before 03:00 Kyiv, 1–2 reads 1–2 and young, never baby", () => {
    // 01:00 Kyiv on 12 November = 23:00 UTC on the 11th: UTC midnight of the 12th is still ahead.
    const now = new Date("2026-11-11T23:00:00.000Z");
    const declaredAt = declaredAtOfCalendarDate("2026-11-12", now);
    expect(ageSpanOf(range("1_2", declaredAt), now)).toEqual({ kind: "between", from: 1, to: 2 });
    expect(ageBucketOf(range("1_2", declaredAt), now)).toBe("young");
  });

  const lowerBoundOf = (span: AgeSpan): number => {
    switch (span.kind) {
      case "under_one":
        return 0;
      case "about":
        return span.years;
      case "between":
      case "at_least":
        return span.from;
    }
  };

  it("the span's lower bound and the filter bucket agree around every tick up to 40 years, and never get younger", () => {
    for (const r of DECLARED_AGE_RANGES) {
      let previous = -1;
      for (let k = 0; k <= 40; k += 1) {
        for (const now of [new Date(after(k).getTime() - 1), after(k), after(k + 0.5)]) {
          if (now < DECLARED) continue;
          const span = ageSpanOf(range(r), now);
          if (span === null) throw new Error("a range always has a span");
          const lower = lowerBoundOf(span);
          const bucket = ageBucketOf(range(r), now);
          const bornLowerYearsAgo: AgeEstimate = {
            kind: "birth_date",
            date: new Date(now.getTime() - lower * YEAR_MS),
            precision: "day",
          };
          expect(ageBucketOf(bornLowerYearsAgo, now), `${r} at ${now.toISOString()}`).toBe(bucket);
          expect(BUCKET_ORDER[bucket]).toBeGreaterThanOrEqual(previous);
          previous = BUCKET_ORDER[bucket];
        }
      }
    }
  });

  it("an older range is never in a younger bucket, at any moment", () => {
    for (let k = 0; k <= 40; k += 1) {
      for (const now of [after(k), after(k + 0.5)]) {
        const buckets = DECLARED_AGE_RANGES.map((r) => BUCKET_ORDER[ageBucketOf(range(r), now)]);
        expect(buckets).toEqual([...buckets].sort((a, b) => a - b));
      }
    }
  });

  it("the older kinds have no span, and a range is never uncertain", () => {
    const bucket: AgeEstimate = { kind: "declared_bucket", bucket: "adult", declaredAt: DECLARED };
    expect(ageSpanOf(bucket, after(1))).toBeNull();
    expect(
      ageSpanOf({ kind: "birth_date", date: DECLARED, precision: "day" }, after(1)),
    ).toBeNull();
    for (const r of DECLARED_AGE_RANGES) {
      for (const n of [0, 0.99, 1, 2.5, 7]) {
        expect(isAgeEstimateUncertain(range(r), after(n))).toBe(false);
      }
    }
  });
});
