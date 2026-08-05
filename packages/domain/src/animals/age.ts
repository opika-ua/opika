import { z } from "zod";

export const AgeBucketSchema = z.enum(["baby", "young", "adult", "senior"]);
export type AgeBucket = z.infer<typeof AgeBucketSchema>;

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

const DAYS_PER_YEAR = 365.2425;
const MS_PER_DAY = 86_400_000;

/**
 * `declared_bucket` exists because a shelter that took in a street dog often
 * genuinely knows only "adult". Forcing a birth date would record a fabricated
 * fact, which is worse data than an honest coarse one.
 *
 * `declaredAt` is what makes a coarse answer usable: an animal only gets older,
 * so a bucket declared two years ago can be advanced rather than repeated.
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
  Math.max(0, (now.getTime() - from.getTime()) / (MS_PER_DAY * DAYS_PER_YEAR));

/**
 * The bucket is derived at read time rather than stored, so a puppy listed in
 * March is not still advertised as a puppy in December. Storing the bucket
 * would make the listing quietly untrue in exactly the way the freshness badge
 * exists to prevent elsewhere.
 *
 * For a declared bucket the derivation advances the bucket's *lower* bound by
 * the elapsed time. That only ever ages an animal, never rejuvenates it, which
 * is the safe direction to be wrong in: overstating age costs an adopter
 * nothing, understating it is a broken promise at the shelter door.
 */
export const ageBucketOf = (estimate: AgeEstimate, now: Date): AgeBucket => {
  switch (estimate.kind) {
    case "birth_date":
      return bucketForYears(elapsedYears(estimate.date, now));
    case "declared_bucket":
      return bucketForYears(
        AGE_BUCKET_MIN_YEARS[estimate.bucket] + elapsedYears(estimate.declaredAt, now),
      );
    default: {
      const unreachable: never = estimate;
      return unreachable;
    }
  }
};

/**
 * True when a declared bucket has been carried forward past its original
 * meaning, so the UI can invite the shelter to confirm rather than silently
 * showing a derived value.
 */
export const isAgeEstimateStale = (estimate: AgeEstimate, now: Date): boolean =>
  estimate.kind === "declared_bucket" && ageBucketOf(estimate, now) !== estimate.bucket;
