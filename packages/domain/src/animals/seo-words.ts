import type { AgeBucket, AnimalSex, AnimalSpecies } from "../core";

/** The noun a page title uses for one animal; the catalogue maps each key to its word. */
export type AnimalNounKey = "puppy" | "dog" | "kitten" | "tomcat" | "femaleCat";

/**
 * SEO handoff B1 (2026-11-18). A cat of unknown sex takes the male word, the same generic
 * masculine `grammaticalGenderOf` gives «Не записано».
 */
export function animalNoun(
  species: AnimalSpecies,
  sex: AnimalSex,
  ageBucket: AgeBucket,
): AnimalNounKey {
  switch (species) {
    case "dog":
      return ageBucket === "baby" ? "puppy" : "dog";
    case "cat":
      if (ageBucket === "baby") return "kitten";
      return sex === "female" ? "femaleCat" : "tomcat";
  }
}

export type SpeciesPhraseKey = "dogs" | "cats" | "dogsAndCats";

/** No species listed is its own answer: a page with nothing listed has no phrase to show. */
export type SpeciesPhrase = { kind: "none" } | { kind: "listed"; key: SpeciesPhraseKey };

/** The phrase for the species actually listed on a shelter or city page (handoff B2). */
export function speciesPhrase(species: readonly AnimalSpecies[]): SpeciesPhrase {
  const dogs = species.includes("dog");
  const cats = species.includes("cat");
  if (dogs && cats) return { kind: "listed", key: "dogsAndCats" };
  if (dogs) return { kind: "listed", key: "dogs" };
  if (cats) return { kind: "listed", key: "cats" };
  return { kind: "none" };
}
