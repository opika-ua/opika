import { describe, expect, it } from "vitest";
import { SIZE_BUCKET_WEIGHT_HINTS_KG, SIZE_BUCKETS } from "./size";

describe("SIZE_BUCKET_WEIGHT_HINTS_KG", () => {
  it("keeps the dog scale and gives cats their own", () => {
    const edges = (species: "dog" | "cat") =>
      SIZE_BUCKETS.map((b) => SIZE_BUCKET_WEIGHT_HINTS_KG[species][b]);
    expect(edges("dog")).toEqual([
      { minKg: 0, maxKg: 10 },
      { minKg: 10, maxKg: 25 },
      { minKg: 25, maxKg: null },
    ]);
    expect(edges("cat")).toEqual([
      { minKg: 0, maxKg: 3 },
      { minKg: 3, maxKg: 5 },
      { minKg: 5, maxKg: null },
    ]);
  });

  it("is contiguous for each species: a bucket starts where the previous ends", () => {
    for (const scale of Object.values(SIZE_BUCKET_WEIGHT_HINTS_KG)) {
      expect(scale.small.maxKg).toBe(scale.medium.minKg);
      expect(scale.medium.maxKg).toBe(scale.large.minKg);
    }
  });
});
