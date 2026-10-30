import { AGE_BUCKETS, SIZE_BUCKETS } from "@opika/domain";
import { describe, expect, it } from "vitest";
import {
  ageBucketLabel,
  ageChipWordFor,
  ageWordFor,
  sexWordFor,
  sizeLabel,
  speciesWordFor,
} from "./animal-labels";

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

/** The pet card's chip: the same agreement as `ageWordFor`, capitalised. Every sex × bucket. */
describe("ageChipWordFor, each sex × bucket", () => {
  it.each([
    ["male", "baby", "Малюк"],
    ["male", "young", "Молодий"],
    ["male", "adult", "Дорослий"],
    ["male", "senior", "Літній"],
    ["female", "baby", "Малючка"],
    ["female", "young", "Молода"],
    ["female", "adult", "Доросла"],
    ["female", "senior", "Літня"],
    ["unknown", "baby", "Малюк"],
    ["unknown", "young", "Молодий"],
    ["unknown", "adult", "Дорослий"],
    ["unknown", "senior", "Літній"],
  ] as const)("%s, %s → «%s»", (sex, bucket, word) => {
    expect(ageChipWordFor(bucket, sex)).toBe(word);
  });
});

/** gallery-v3 (Figma `58:1617`): the redesigned card names sex as its own word. */
describe("sexWordFor", () => {
  it.each([
    ["male", "Хлопчик"],
    ["female", "Дівчинка"],
  ] as const)("%s → «%s»", (sex, word) => {
    expect(sexWordFor(sex)).toBe(word);
  });

  it("an unknown sex has no word - the caller omits it rather than guessing", () => {
    expect(sexWordFor("unknown")).toBeNull();
  });
});

/**
 * The animal page's meta description (PR B, the SEO review of page titles), owner's exact
 * wording: cat male «Кіт», female «Кішка»; dog male «Пес», female «Собака»; unknown sex takes
 * the masculine form, same convention `ageWordFor` above already uses.
 */
describe("speciesWordFor, each sex × species", () => {
  it.each([
    ["male", "cat", "Кіт"],
    ["female", "cat", "Кішка"],
    ["unknown", "cat", "Кіт"],
    ["male", "dog", "Пес"],
    ["female", "dog", "Собака"],
    ["unknown", "dog", "Пес"],
  ] as const)("%s, %s → «%s»", (sex, species, word) => {
    expect(speciesWordFor(species, sex)).toBe(word);
  });
});
