import { z } from "zod";

export const SizeBucketSchema = z.enum(["small", "medium", "large"]);
export type SizeBucket = z.infer<typeof SizeBucketSchema>;

export const SIZE_BUCKETS = ["small", "medium", "large"] as const satisfies readonly SizeBucket[];

/**
 * Guidance for whoever is filling in the listing, not a stored measurement.
 * Weight is never persisted: shelters rarely have a scale, an estimate recorded
 * as a number reads as a fact, and nothing in the product needs more resolution
 * than the bucket.
 *
 * `maxKg: null` on `large` because the bucket is open-ended.
 */
export const SIZE_BUCKET_WEIGHT_HINTS_KG: Record<
  SizeBucket,
  { minKg: number; maxKg: number | null }
> = {
  small: { minKg: 0, maxKg: 10 },
  medium: { minKg: 10, maxKg: 25 },
  large: { minKg: 25, maxKg: null },
};
