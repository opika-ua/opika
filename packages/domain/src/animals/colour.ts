import { z } from "zod";
import { LocalizedTextSchema } from "../primitives/localized-text";

/**
 * A coat colour as an adopter would filter on it: a closed list of what the
 * eye sees, not breed terms, closed for the reasons species and coat length
 * are (decisions 3 and 8). A colour the list doesn't name goes in the
 * shelter's own words instead (`AnimalColour`'s `custom`), which is shown but
 * never filtered on.
 *
 * Like fur: never a listing fact and never a completeness or ranking input.
 */
export const CoatColourSchema = z.enum([
  "black",
  "white",
  "grey",
  "ginger",
  "brown",
  "cream",
  "black_white",
  "tricolour",
  "tabby",
  "spotted",
]);
export type CoatColour = z.infer<typeof CoatColourSchema>;

export const COAT_COLOURS = [
  "black",
  "white",
  "grey",
  "ginger",
  "brown",
  "cream",
  "black_white",
  "tricolour",
  "tabby",
  "spotted",
] as const satisfies readonly CoatColour[];

/** Shorter than temperament's: a colour in words is a phrase on one chip. */
export const COAT_COLOUR_CUSTOM_MAX_CHARACTERS = 30;

/**
 * One colour per animal, a preset or the shelter's words, never both: two
 * would leave a card with two answers to one question, and the database
 * refuses that pair too (`animals_coat_colour_one_kind_check`). Nullable on
 * the animal, «Не вказано» like fur.
 */
export const AnimalColourSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("preset"), colour: CoatColourSchema }),
  z.object({ kind: z.literal("custom"), text: LocalizedTextSchema }),
]);
export type AnimalColour = z.infer<typeof AnimalColourSchema>;
