import { AGE_BUCKETS, SIZE_BUCKETS } from "@opika/domain";
import { describe, expect, it } from "vitest";
import { ageBucketLabel, ageWordFor, sizeLabel } from "./animal-labels";

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

/** Q9 (Oleksii, 2026-10-18): "add a test for each sex × bucket". His words, transcribed. */
describe("ageWordFor, each sex × bucket", () => {
  it.each([
    ["male", "baby", "малюк"],
    ["male", "young", "молодий"],
    ["male", "adult", "дорослий"],
    ["male", "senior", "літній"],
    ["female", "baby", "малючка"],
    ["female", "young", "молода"],
    ["female", "adult", "доросла"],
    ["female", "senior", "літня"],
    ["unknown", "baby", "малюк"],
    ["unknown", "young", "молодий"],
    ["unknown", "adult", "дорослий"],
    ["unknown", "senior", "літній"],
  ] as const)("%s, %s → «%s»", (sex, bucket, word) => {
    expect(ageWordFor(bucket, sex)).toBe(word);
  });

  it("the masculine words are the card's long-standing ones, unchanged", () => {
    expect(AGE_BUCKETS.map(ageBucketLabel)).toEqual(["малюк", "молодий", "дорослий", "літній"]);
  });
});
