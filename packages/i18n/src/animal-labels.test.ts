import { AGE_BUCKETS, SIZE_BUCKETS } from "@opika/domain";
import { describe, expect, it } from "vitest";
import { ageBucketLabel, sizeLabel } from "./animal-labels";

describe("ageBucketLabel", () => {
  it("returns a distinct, non-empty word for every bucket", () => {
    const labels = AGE_BUCKETS.map(ageBucketLabel);
    expect(labels.every((label) => label.length > 0)).toBe(true);
    expect(new Set(labels).size).toBe(AGE_BUCKETS.length);
  });

  it("matches the card meta line's expected word for a known bucket", () => {
    expect(ageBucketLabel("young")).toBe("молодий");
  });
});

describe("sizeLabel", () => {
  it("returns a distinct, non-empty word for every bucket", () => {
    const labels = SIZE_BUCKETS.map(sizeLabel);
    expect(labels.every((label) => label.length > 0)).toBe(true);
    expect(new Set(labels).size).toBe(SIZE_BUCKETS.length);
  });

  it("matches the card meta line's expected word for a known bucket", () => {
    expect(sizeLabel("small")).toBe("мала");
  });
});
