import { z } from "zod";
import { LocalizedTextSchema } from "../primitives/localized-text";

/**
 * What the card says about an animal's character: a closed list of presets an
 * adopter can filter on, plus at most one entry in the shelter's own words
 * for what the list doesn't cover. Closed for the same reason as species and
 * coat (decisions 3 and 8): a filter over an open list is unenumerable, and a
 * new trait is an additive literal the exhaustiveness checks turn into a
 * guided edit.
 *
 * Never a listing fact and never a completeness or ranking input, like fur:
 * an animal whose character isn't recorded is complete as it stands, and
 * `/prytulkam` §3 names exactly what orders a card (commitment 1), which
 * character is not.
 */
export const TemperamentTraitSchema = z.enum([
  "playful",
  "calm",
  "affectionate",
  "energetic",
  "independent",
  "shy",
  "good_with_kids",
  "good_with_cats",
  "good_with_dogs",
]);
export type TemperamentTrait = z.infer<typeof TemperamentTraitSchema>;

export const TEMPERAMENT_TRAITS = [
  "playful",
  "calm",
  "affectionate",
  "energetic",
  "independent",
  "shy",
  "good_with_kids",
  "good_with_cats",
  "good_with_dogs",
] as const satisfies readonly TemperamentTrait[];

/** The custom entry is a chip on the card, not a paragraph: a few words, counted as a reader sees them. */
export const TEMPERAMENT_CUSTOM_MAX_CHARACTERS = 40;

export const TemperamentEntrySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("preset"), trait: TemperamentTraitSchema }),
  z.object({ kind: z.literal("custom"), text: LocalizedTextSchema }),
]);
export type TemperamentEntry = z.infer<typeof TemperamentEntrySchema>;

type PresetEntry = Extract<TemperamentEntry, { kind: "preset" }>;

const isPreset = (entry: TemperamentEntry): entry is PresetEntry => entry.kind === "preset";

const noRepeatedPreset = (entries: readonly TemperamentEntry[]): boolean => {
  const traits = entries.filter(isPreset).map((entry) => entry.trait);
  return new Set(traits).size === traits.length;
};

const customIsLastAndAlone = (entries: readonly TemperamentEntry[]): boolean =>
  entries.every((entry, index) => entry.kind === "preset" || index === entries.length - 1);

/**
 * `[]` is «Не записано», never a gap. At most one of each preset, and at most
 * one custom entry, which must be the last element: what the database stores
 * (the presets in order in `temperament_traits`, the custom text in its own
 * columns) then reads back as exactly this array, with nothing to reorder and
 * no second custom entry that one set of columns couldn't hold.
 *
 * The `max` is implied by the two refinements (nine presets, one custom); it
 * stays as the first, cheap line against an oversized input.
 */
export const TemperamentSchema = z
  .array(TemperamentEntrySchema)
  .max(TEMPERAMENT_TRAITS.length + 1)
  .refine(noRepeatedPreset, { message: "A temperament trait is listed more than once" })
  .refine(customIsLastAndAlone, {
    message: "A temperament carries at most one custom entry, and it comes last",
  })
  .readonly();
export type Temperament = z.infer<typeof TemperamentSchema>;

/** The filterable (preset-only) part of a temperament, in order: what `temperament_traits` stores. */
export const temperamentTraitsOf = (temperament: Temperament): readonly TemperamentTrait[] =>
  temperament.filter(isPreset).map((entry) => entry.trait);
