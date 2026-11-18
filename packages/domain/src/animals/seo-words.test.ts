import { describe, expect, it } from "vitest";
import { AGE_BUCKETS, ANIMAL_SEXES, ANIMAL_SPECIES } from "../core";
import { animalNoun, speciesPhrase } from "./seo-words";

describe("animalNoun (SEO handoff B1)", () => {
  it.each([
    ["dog", "male", "baby", "puppy"],
    ["dog", "female", "baby", "puppy"],
    ["dog", "unknown", "baby", "puppy"],
    ["dog", "male", "young", "dog"],
    ["dog", "female", "adult", "dog"],
    ["dog", "unknown", "senior", "dog"],
    ["cat", "male", "baby", "kitten"],
    ["cat", "female", "baby", "kitten"],
    ["cat", "unknown", "baby", "kitten"],
    ["cat", "male", "young", "tomcat"],
    ["cat", "male", "senior", "tomcat"],
    ["cat", "female", "young", "femaleCat"],
    ["cat", "female", "adult", "femaleCat"],
    ["cat", "female", "senior", "femaleCat"],
    // No column in the table: the generic masculine, as `grammaticalGenderOf` does.
    ["cat", "unknown", "adult", "tomcat"],
  ] as const)("%s, %s, %s → %s", (species, sex, age, key) => {
    expect(animalNoun(species, sex, age)).toBe(key);
  });

  it("answers every species, sex and age combination", () => {
    for (const species of ANIMAL_SPECIES)
      for (const sex of ANIMAL_SEXES)
        for (const age of AGE_BUCKETS) {
          expect(["puppy", "dog", "kitten", "tomcat", "femaleCat"]).toContain(
            animalNoun(species, sex, age),
          );
        }
  });
});

describe("speciesPhrase (SEO handoff B2)", () => {
  it.each([
    [["dog"], { kind: "listed", key: "dogs" }],
    [["cat"], { kind: "listed", key: "cats" }],
    [["dog", "cat"], { kind: "listed", key: "dogsAndCats" }],
    [["cat", "dog"], { kind: "listed", key: "dogsAndCats" }],
    [["dog", "dog"], { kind: "listed", key: "dogs" }],
    [[], { kind: "none" }],
  ] as const)("%j → %j", (species, phrase) => {
    expect(speciesPhrase(species)).toEqual(phrase);
  });
});
