import { AGE_BUCKETS, SIZE_BUCKETS } from "@opika/domain";
import { describe, expect, it } from "vitest";
import {
  ageBucketLabel,
  ageWordFor,
  animalFactsParts,
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

const AGE_M = { baby: "малюк", young: "молодий", adult: "дорослий", senior: "літній" } as const;
const AGE_F = { baby: "малючка", young: "молода", adult: "доросла", senior: "літня" } as const;
const SIZE_M = { small: "малий", medium: "середній", large: "великий" } as const;
const SIZE_F = { small: "мала", medium: "середня", large: "велика" } as const;
const cap = (word: string) => word.charAt(0).toLocaleUpperCase("uk") + word.slice(1);

/** UX-2: every sex × age × size, with and without species, exact strings. */
describe("animalFactsParts", () => {
  const rows = (["male", "female", "unknown"] as const).flatMap((sex) =>
    AGE_BUCKETS.flatMap((age) => SIZE_BUCKETS.map((size) => ({ sex, age, size }))),
  );

  it.each(rows)("$sex $age $size, no species", ({ sex, age, size }) => {
    const f = sex === "female";
    const sexWord = sex === "male" ? ["Хлопчик"] : sex === "female" ? ["Дівчинка"] : [];
    const rest = [(f ? AGE_F : AGE_M)[age], (f ? SIZE_F : SIZE_M)[size]];
    const expected = [...sexWord, ...rest];
    expected[0] = cap(expected[0] as string);
    expect(animalFactsParts({ sex, ageBucket: age, size })).toEqual(expected);
  });

  it.each(rows)("$sex $age $size, with species", ({ sex, age, size }) => {
    const f = sex === "female";
    for (const [species, word] of [
      ["cat", "Кіт"],
      ["dog", "Собака"],
    ] as const) {
      const sexWord = sex === "male" ? ["хлопчик"] : sex === "female" ? ["дівчинка"] : [];
      expect(animalFactsParts({ species, sex, ageBucket: age, size })).toEqual([
        word,
        ...sexWord,
        (f ? AGE_F : AGE_M)[age],
        (f ? SIZE_F : SIZE_M)[size],
      ]);
    }
  });

  it("an unknown sex starts the line with the age, masculine throughout", () => {
    expect(
      animalFactsParts({ sex: "unknown", ageBucket: "young", size: "large" }).join(" · "),
    ).toBe("Молодий · великий");
  });

  it("leaves out a missing age or size (a kabinet draft)", () => {
    expect(animalFactsParts({ species: "dog", sex: "male", ageBucket: null, size: null })).toEqual([
      "Собака",
      "хлопчик",
    ]);
  });

  it("puts the caller's unknown-sex text in the sex slot, lowercase, only when asked", () => {
    const facts = { species: "cat", sex: "unknown", ageBucket: "adult", size: "small" } as const;
    expect(animalFactsParts({ ...facts, unknownSexText: "стать не вказана" })).toEqual([
      "Кіт",
      "стать не вказана",
      "дорослий",
      "малий",
    ]);
    expect(animalFactsParts(facts)).toEqual(["Кіт", "дорослий", "малий"]);
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
