import { z } from "zod";
import { AGE_BUCKETS, type AgeBucket } from "../core";
import {
  type CalendarDate,
  calendarDateYearsBefore,
  instantOfCalendarDate,
  kyivCalendarDateOf,
} from "../primitives/calendar-date";

export { AGE_BUCKETS, type AgeBucket };

export const AgeBucketSchema = z.enum(AGE_BUCKETS);

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

/** K3's six answers to "how old on that date" (owner, 2026-11-12), youngest first. */
export const DECLARED_AGE_RANGES = ["under_1", "1_2", "3_4", "5_7", "8_10", "10_plus"] as const;
export const DeclaredAgeRangeSchema = z.enum(DECLARED_AGE_RANGES);
export type DeclaredAgeRange = z.infer<typeof DeclaredAgeRangeSchema>;

/** Whole years at the declared date; `max: null` is open-ended. */
export const DECLARED_AGE_RANGE_YEARS: Record<
  DeclaredAgeRange,
  { readonly min: number; readonly max: number | null }
> = {
  under_1: { min: 0, max: 0 },
  "1_2": { min: 1, max: 2 },
  "3_4": { min: 3, max: 4 },
  "5_7": { min: 5, max: 7 },
  "8_10": { min: 8, max: 10 },
  "10_plus": { min: 10, max: null },
};

/**
 * `declared_bucket` exists because a shelter that took in a street dog often
 * genuinely knows only "adult". Forcing a birth date would record a fabricated
 * fact, which is worse data than an honest coarse one.
 *
 * `declaredAt` is what makes a coarse answer usable: an animal only gets older,
 * so a bucket declared two years ago can be carried forward rather than
 * repeated. `declared_range` is the same idea in finer steps; new ages use it,
 * and a stored bucket stays as it was.
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
  z.object({
    kind: z.literal("declared_range"),
    range: DeclaredAgeRangeSchema,
    declaredAt: z.date(),
  }),
]);
export type AgeEstimate = z.infer<typeof AgeEstimateSchema>;

/**
 * A declared range as the card states it today, in whole years: numbers only,
 * so the words stay in `packages/i18n`.
 */
export const AgeSpanSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("under_one") }),
  z.object({ kind: z.literal("about"), years: z.int().min(1) }),
  z.object({ kind: z.literal("between"), from: z.int().min(0), to: z.int().min(1) }),
  z.object({ kind: z.literal("at_least"), from: z.int().min(0) }),
]);
export type AgeSpan = z.infer<typeof AgeSpanSchema>;

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
 * Postgres cannot combine with a keyset seek without sorting - which would put
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
    case "declared_range":
      return new Date(
        estimate.declaredAt.getTime() - DECLARED_AGE_RANGE_YEARS[estimate.range].min * MS_PER_YEAR,
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
 * with the declaration - the only claim the data actually supports. It does
 * mean a dog declared `adult` at seven can read as `adult` for some years after
 * it is genuinely `senior`, which is why `isAgeEstimateUncertain` exists:
 * rather than guessing an older bucket the data cannot justify, the listing is
 * marked uncertain and the shelter is asked. Inventing precision would be the
 * same dishonesty the freshness badge exists to prevent.
 */
export const ageBucketOf = (estimate: AgeEstimate, now: Date): AgeBucket =>
  bucketForYears(elapsedYears(ageAnchorOf(estimate), now));

/**
 * A range declared `wholeYearsSince` whole years ago, aged by that many years.
 * A one-year range (under_1) stays one number as it ages: «до 1 року», then 1, 2, …
 */
export const declaredRangeSpan = (range: DeclaredAgeRange, wholeYearsSince: number): AgeSpan => {
  const { min, max } = DECLARED_AGE_RANGE_YEARS[range];
  const from = min + wholeYearsSince;
  if (max === null) return { kind: "at_least", from };
  if (max === min) return from === 0 ? { kind: "under_one" } : { kind: "about", years: from };
  return { kind: "between", from, to: max + wholeYearsSince };
};

/**
 * The span a declared range states at `now`, or null for the two older kinds,
 * which keep the bucket word. It ages in the same 365.2425-day years as the
 * anchor, so its lower bound always lands in `ageBucketOf`'s bucket.
 */
export const ageSpanOf = (estimate: AgeEstimate, now: Date): AgeSpan | null =>
  estimate.kind === "declared_range"
    ? declaredRangeSpan(estimate.range, Math.floor(elapsedYears(estimate.declaredAt, now)))
    : null;

/**
 * True when the animal's possible age now spans more than one bucket, so the
 * displayed value is a floor rather than a fact.
 *
 * A birth date is never uncertain, and neither is a range: the card states the
 * range itself. A declared bucket becomes uncertain as soon as enough time
 * passes that its upper bound crosses into the next bucket.
 *
 * Note for whoever builds the confirm flow: re-declaring the *derived* bucket
 * resets the anchor and makes the animal younger again. Confirmation should
 * carry the existing anchor forward, or capture a real birth date.
 */
export const isAgeEstimateUncertain = (estimate: AgeEstimate, now: Date): boolean => {
  if (estimate.kind !== "declared_bucket") return false;

  const maxYears = AGE_BUCKET_MAX_YEARS[estimate.bucket];
  if (maxYears === null) return false;

  // The bucket's upper bound is exclusive, so the oldest attainable age is just
  // below it. Stepping back a day rather than an epsilon keeps this meaningful
  // at every magnitude - and without it a freshly declared bucket would read as
  // uncertain the instant it was recorded.
  const oldestPossibleYears = maxYears - ONE_DAY_IN_YEARS + elapsedYears(estimate.declaredAt, now);

  return bucketForYears(oldestPossibleYears) !== ageBucketOf(estimate, now);
};

/**
 * How far back K3's age dates may go (D3, Oleksii, verbatim: "keep the chosen
 * «Станом на» date. Refuse a date in the future (Kyiv) or older than 30
 * years."). Thirty years is past any dog's or cat's life, so an older date is
 * a typo (a wrong century, a birth year for the year of intake), not an
 * answer.
 */
export const AGE_DATE_MAX_YEARS_BACK = 30;

export type AgeDateProblem =
  | { readonly kind: "future" }
  | { readonly kind: "too_old"; readonly maxYearsBack: number };

/**
 * Whether a birth date or an «as of» date can be stored: not after today on
 * Kyiv's calendar, and not more than `AGE_DATE_MAX_YEARS_BACK` years before
 * it (exactly thirty years ago is still allowed). The form and the server ask
 * this same question, so the inline message and the server's refusal can't
 * disagree, except where the device clock does.
 */
export const ageDateProblem = (date: CalendarDate, now: Date): AgeDateProblem | null => {
  const today = kyivCalendarDateOf(now);
  if (date > today) return { kind: "future" };
  if (date < calendarDateYearsBefore(today, AGE_DATE_MAX_YEARS_BACK)) {
    return { kind: "too_old", maxYearsBack: AGE_DATE_MAX_YEARS_BACK };
  }
  return null;
};

/**
 * The instant a bucket declared «станом на» `asOf` is anchored at: the date's
 * stored instant (`instantOfCalendarDate`, UTC midnight), but never later than
 * `now`. For the first two or three hours of a Kyiv day, UTC midnight of that
 * day is still ahead of the clock, and `ageAnchorOf` subtracts the bucket's
 * minimum from the anchor, so a bucket declared "today" in that window read
 * one tier young («малюк» for «Молодий») on the form and on the card until
 * 03:00. A date in the past is unaffected; its Kyiv date is unchanged either
 * way, so `kyivCalendarDateOf` gives `asOf` back.
 */
export const declaredAtOfCalendarDate = (asOf: CalendarDate, now: Date): Date => {
  const instant = instantOfCalendarDate(asOf);
  return instant.getTime() > now.getTime() ? now : instant;
};
