import {
  type AnimalSex,
  type GrammaticalGender,
  grammaticalGenderOf,
  type TemperamentTrait,
} from "@opika/domain";
import { ukPublic as uk } from "./messages/uk-public";

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

/**
 * The plural, category-naming form - not one animal's. No production caller
 * since the gallery filter restructure removed temperament as a filter
 * dimension; left in place (not deleted) because `temperament-labels.test.ts`
 * is the test Oleksii explicitly asked for, covering every form including
 * this one. A candidate for deletion in a later cleanup, not this PR.
 */
export function temperamentFilterLabel(trait: TemperamentTrait): string {
  return TEMPERAMENT_WORDS[trait].plural;
}
