import {
  type AnimalSex,
  type GrammaticalGender,
  grammaticalGenderOf,
  type TemperamentTrait,
} from "@opika/domain";
import { uk } from "./messages/uk";

/**
 * A `Record` over the domain's own trait type, not a `switch` with a
 * `default`: a trait added to `TEMPERAMENT_TRAITS` without its words here is
 * a compile error, not a fallback string.
 */
const TEMPERAMENT_WORDS: Record<
  TemperamentTrait,
  { readonly masculine: string; readonly feminine: string; readonly plural: string }
> = uk.temperament;

/**
 * Chip on the pet card, and the kabinet checkbox label for the currently selected sex.
 * Reuses the same sex→gender mapping ageWordFor already uses: female → feminine,
 * male and "unknown" (not recorded) → masculine.
 */
export function temperamentLabelFor(trait: TemperamentTrait, sex: AnimalSex): string {
  const gender: GrammaticalGender = grammaticalGenderOf(sex);
  return TEMPERAMENT_WORDS[trait][gender];
}

/** Gallery filter option and the chip-link's accessible name — names the category, not one animal. */
export function temperamentFilterLabel(trait: TemperamentTrait): string {
  return TEMPERAMENT_WORDS[trait].plural;
}
