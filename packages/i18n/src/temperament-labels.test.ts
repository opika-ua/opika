import { TEMPERAMENT_TRAITS } from "@opika/domain";
import { describe, expect, it } from "vitest";
import { temperamentFilterLabel, temperamentLabelFor } from "./temperament-labels";

/**
 * The owner-approved table (pet card redesign, Phase 0, 2026-10-26),
 * transcribed rather than read from `uk.ts`, so a changed word fails here.
 * The apostrophe is U+02BC.
 */
const WORDS = {
  playful: ["Грайливий", "Грайлива", "Грайливі"],
  calm: ["Спокійний", "Спокійна", "Спокійні"],
  affectionate: ["Ласкавий", "Ласкава", "Ласкаві"],
  energetic: ["Енергійний", "Енергійна", "Енергійні"],
  independent: ["Самостійний", "Самостійна", "Самостійні"],
  shy: ["Соромʼязливий", "Соромʼязлива", "Соромʼязливі"],
  good_with_kids: ["Ладнає з дітьми", "Ладнає з дітьми", "Ладнають з дітьми"],
  good_with_cats: ["Ладнає з котами", "Ладнає з котами", "Ладнають з котами"],
  good_with_dogs: ["Ладнає з собаками", "Ладнає з собаками", "Ладнають з собаками"],
} as const;

/** Every trait × sex: female → feminine; male and «Не записано» → masculine (as `ageWordFor`). */
describe("temperamentLabelFor, each trait × sex", () => {
  it.each(
    TEMPERAMENT_TRAITS.flatMap((trait) => {
      const [masculine, feminine] = WORDS[trait];
      return [
        [trait, "male", masculine],
        [trait, "female", feminine],
        [trait, "unknown", masculine],
      ] as const;
    }),
  )("%s, %s → «%s»", (trait, sex, word) => {
    expect(temperamentLabelFor(trait, sex)).toBe(word);
  });

  it("returns a distinct, non-empty masculine word for every trait", () => {
    const labels = TEMPERAMENT_TRAITS.map((trait) => temperamentLabelFor(trait, "male"));
    expect(labels.every((label) => label.length > 0)).toBe(true);
    expect(new Set(labels).size).toBe(TEMPERAMENT_TRAITS.length);
  });

  it("spells «соромʼязливий» with U+02BC, not a look-alike", () => {
    expect(temperamentLabelFor("shy", "female")).toContain(String.fromCodePoint(0x02bc));
    expect(temperamentLabelFor("shy", "female")).not.toMatch(/['’]/);
  });
});

describe("temperamentFilterLabel", () => {
  it.each(TEMPERAMENT_TRAITS.map((trait) => [trait, WORDS[trait][2]] as const))(
    "%s → «%s»",
    (trait, word) => {
      expect(temperamentFilterLabel(trait)).toBe(word);
    },
  );

  it("returns a distinct, non-empty plural word for every trait", () => {
    const labels = TEMPERAMENT_TRAITS.map(temperamentFilterLabel);
    expect(labels.every((label) => label.length > 0)).toBe(true);
    expect(new Set(labels).size).toBe(TEMPERAMENT_TRAITS.length);
  });

  it("ignores the animal's sex entirely: a filter names the category, always the plural", () => {
    for (const trait of TEMPERAMENT_TRAITS) {
      const plural = temperamentFilterLabel(trait);
      expect(plural).toBe(WORDS[trait][2]);
      // The plural is never the word a single animal of either sex gets.
      expect(plural).not.toBe(temperamentLabelFor(trait, "male"));
      expect(plural).not.toBe(temperamentLabelFor(trait, "female"));
    }
  });
});
