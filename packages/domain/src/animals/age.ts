import { z } from "zod";

export const AgeBucketSchema = z.enum(["baby", "young", "adult", "senior"]);
export type AgeBucket = z.infer<typeof AgeBucketSchema>;

/** Ordered youngest to oldest. The order is load-bearing for range queries. */
export const AGE_BUCKETS = [
  "baby",
  "young",
  "adult",
  "senior",
] as const satisfies readonly AgeBucket[];

/** Lower bound of each bucket, in years. baby <1, young 1-3, adult 3-8, senior 8+. */
export const AGE_BUCKET_MIN_YEARS: Record<AgeBucket, number> = {
  baby: 0,
  young: 1,
  adult: 3,
  senior: 8,
};

/** Exclusive upper bound. `null` on senior, which is open-ended. */
export const AGE_BUCKET_MAX_YEARS: Record<AgeBucket, number | null> = {
  baby: 1,
  young: 3,
  adult: 8,
  senior: null,
};

const DAYS_PER_YEAR = 365.2425;
const MS_PER_DAY = 86_400_000;
const MS_PER_YEAR = DAYS_PER_YEAR * MS_PER_DAY;
const ONE_DAY_IN_YEARS = 1 / DAYS_PER_YEAR;

/**
 * `declared_bucket` exists because a shelter that took in a street dog often
 * genuinely knows only "adult". Forcing a birth date would record a fabricated
 * fact, which is worse data than an honest coarse one.
 *
 * `declaredAt` is what makes a coarse answer usable: an animal only gets older,
 * so a bucket declared two years ago can be carried forward rather than
 * repeated.
 */
export const AgeEstimateSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("birth_date"),
    date: z.date(),
    precision: z.enum(["day", "month", "year"]),
  }),
  z.object({
    kind: z.literal("declared_bucket"),
    bucket: AgeBucketSchema,
    declaredAt: z.date(),
  }),
]);
export type AgeEstimate = z.infer<typeof AgeEstimateSchema>;

const bucketForYears = (years: number): AgeBucket => {
  if (years < AGE_BUCKET_MIN_YEARS.young) return "baby";
  if (years < AGE_BUCKET_MIN_YEARS.adult) return "young";
  if (years < AGE_BUCKET_MIN_YEARS.senior) return "adult";
  return "senior";
};

const elapsedYears = (from: Date, now: Date): number =>
  Math.max(0, (now.getTime() - from.getTime()) / MS_PER_YEAR);

/**
 * The single time-independent value both variants reduce to: the birth date an
 * estimate implies, or the earliest one consistent with a declared bucket.
 *
 * This exists so persistence has something sargable to index. Storing the union
 * faithfully makes an age filter a six-branch OR across two columns, which
 * Postgres cannot combine with a keyset seek without sorting — which would put
 * the feed query's "index scan, no sort" requirement out of reach. Stored as a
 * single derived column instead, the filter is one range predicate.
 *
 * `ageBucketOf` is defined in terms of this, so the indexed column and the
 * displayed bucket cannot disagree by construction.
 */
export const ageAnchorOf = (estimate: AgeEstimate): Date => {
  switch (estimate.kind) {
    case "birth_date":
      return estimate.date;
    case "declared_bucket":
      return new Date(
        estimate.declaredAt.getTime() - AGE_BUCKET_MIN_YEARS[estimate.bucket] * MS_PER_YEAR,
      );
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled variant; unreachable at runtime */
    default: {
      const unreachable: never = estimate;
      return unreachable;
    }
  }
};

/**
 * The anchor range an animal in `bucket` occupies at `now`, as a half-open
 * interval `(afterExclusive, atOrBefore]`. `null` means unbounded on that side.
 *
 * Contiguous bucket selections collapse into one range, so filtering on
 * young+adult is a single predicate rather than two.
 */
export const ageAnchorRange = (
  bucket: AgeBucket,
  now: Date,
): { afterExclusive: Date | null; atOrBefore: Date | null } => {
  const maxYears = AGE_BUCKET_MAX_YEARS[bucket];
  return {
    afterExclusive: maxYears === null ? null : new Date(now.getTime() - maxYears * MS_PER_YEAR),
    atOrBefore: new Date(now.getTime() - AGE_BUCKET_MIN_YEARS[bucket] * MS_PER_YEAR),
  };
};

/**
 * The bucket is derived at read time rather than stored, so a puppy listed in
 * March is not still advertised as a puppy in December.
 *
 * For a declared bucket this reports the *youngest* bucket still consistent
 * with the declaration — the only claim the data actually supports. It does
 * mean a dog declared `adult` at seven can read as `adult` for some years after
 * it is genuinely `senior`, which is why `isAgeEstimateUncertain` exists:
 * rather than guessing an older bucket the data cannot justify, the listing is
 * marked uncertain and the shelter is asked. Inventing precision would be the
 * same dishonesty the freshness badge exists to prevent.
 */
export const ageBucketOf = (estimate: AgeEstimate, now: Date): AgeBucket =>
  bucketForYears(elapsedYears(ageAnchorOf(estimate), now));

/**
 * True when the animal's possible age now spans more than one bucket, so the
 * displayed value is a floor rather than a fact.
 *
 * A birth date is never uncertain. A declared bucket becomes uncertain as soon
 * as enough time passes that its upper bound crosses into the next bucket.
 *
 * Note for whoever builds the confirm flow: re-declaring the *derived* bucket
 * resets the anchor and makes the animal younger again. Confirmation should
 * carry the existing anchor forward, or capture a real birth date.
 */
export const isAgeEstimateUncertain = (estimate: AgeEstimate, now: Date): boolean => {
  if (estimate.kind === "birth_date") return false;

  const maxYears = AGE_BUCKET_MAX_YEARS[estimate.bucket];
  if (maxYears === null) return false;

  // The bucket's upper bound is exclusive, so the oldest attainable age is just
  // below it. Stepping back a day rather than an epsilon keeps this meaningful
  // at every magnitude — and without it a freshly declared bucket would read as
  // uncertain the instant it was recorded.
  const oldestPossibleYears = maxYears - ONE_DAY_IN_YEARS + elapsedYears(estimate.declaredAt, now);

  return bucketForYears(oldestPossibleYears) !== ageBucketOf(estimate, now);
};
