import type { AnimalSpecies } from "@opika/domain";

/** A species filter or a shelter's species as the views carry them: everything, or a chosen set. */
export type SpeciesSelection =
  | { kind: "any" }
  | { kind: "oneOf"; values: readonly AnimalSpecies[] };

/** Dog-only views get the dog; cat-only and mixed views get the cat (the brand's lead mascot). */
export function mascotKindFor(selection: SpeciesSelection): AnimalSpecies {
  if (selection.kind === "any" || selection.values.length === 0) return "cat";
  return selection.values.every((species) => species === "dog") ? "dog" : "cat";
}
