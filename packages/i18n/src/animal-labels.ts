import {
  type AgeBucket,
  type AnimalSex,
  type AnimalSpecies,
  type GrammaticalGender,
  grammaticalGenderOf,
  type SizeBucket,
} from "@opika/domain";
import { ukPublic as uk } from "./messages/uk-public";

/**
 * Both maps are `Record`s over the domain's own bucket types, not a
 * `switch` with a `default` - a bucket added to `AGE_BUCKETS`/`SIZE_BUCKETS`
 * without a matching entry here is a compile error, not a fallback string.
 */
const AGE_BUCKET_LABELS: Record<AgeBucket, string> = {
  baby: uk.cardMeta.ageBaby,
  young: uk.cardMeta.ageYoung,
  adult: uk.cardMeta.ageAdult,
  senior: uk.cardMeta.ageSenior,
};

const SIZE_LABELS: Record<SizeBucket, string> = {
  small: uk.cardMeta.sizeSmall,
  medium: uk.cardMeta.sizeMedium,
  large: uk.cardMeta.sizeLarge,
};

/** The age word in a card's meta line, e.g. "молодий" in "молодий · мала". */
export function ageBucketLabel(bucket: AgeBucket): string {
  return AGE_BUCKET_LABELS[bucket];
}

/** The size word in a card's meta line, e.g. "мала" in "молодий · мала". */
export function sizeLabel(size: SizeBucket): string {
  return SIZE_LABELS[size];
}

const FEMININE_AGE_BUCKET_LABELS: Record<AgeBucket, string> = {
  baby: uk.cardMeta.ageBabyFemale,
  young: uk.cardMeta.ageYoungFemale,
  adult: uk.cardMeta.ageAdultFemale,
  senior: uk.cardMeta.ageSeniorFemale,
};

/**
 * The age word on one animal's card, meta line and page (Q9, Oleksii 2026-10-18): female →
 * «молода»; male and «Не записано» → «молодий». Never for filter chips, which name categories.
 */
export function ageWordFor(bucket: AgeBucket, sex: AnimalSex): string {
  const gender: GrammaticalGender = grammaticalGenderOf(sex);
  return gender === "feminine" ? FEMININE_AGE_BUCKET_LABELS[bucket] : AGE_BUCKET_LABELS[bucket];
}

/**
 * `ageWordFor` with a capital first letter, for the pet card's meta line and «Про мене» chip,
 * which are capitalised like the other chips («Доросла» for a girl, «Дорослий» otherwise).
 */
export function ageChipWordFor(bucket: AgeBucket, sex: AnimalSex): string {
  const word = ageWordFor(bucket, sex);
  return word.charAt(0).toLocaleUpperCase("uk") + word.slice(1);
}

const SPECIES_WORD_LABELS: Record<AnimalSpecies, string> = {
  dog: uk.detail.speciesDogMale,
  cat: uk.detail.speciesCat,
};
const FEMININE_SPECIES_WORD_LABELS: Record<AnimalSpecies, string> = {
  dog: uk.detail.speciesDog,
  cat: uk.detail.speciesCatFemale,
};

/**
 * The sex-aware species word for the animal page's meta description (PR B, the SEO
 * review of page titles; owner's exact wording): cat male «Кіт», female «Кішка»; dog
 * male «Пес», female «Собака»; unknown sex uses the masculine form via
 * `grammaticalGenderOf`, his words, "as everywhere else" - the same procedural
 * convention `ageWordFor` above already applies to its own unknown-sex case. Not a
 * claim that «Пес» reads as neutral for a dog: `speciesDog`'s own comment below calls
 * «Собака» the actual generic noun for either sex, which is why `FEMININE_SPECIES_WORD_LABELS`
 * reuses it as the *feminine* form here rather than treating it as neutral - this
 * function's unknown-sex case is the owner's stated convention, not a linguistic claim
 * that masculine is the neutral choice for a dog specifically.
 * Distinct from `detail-text.ts`'s `speciesLabel`, which stays sex-neutral at both its
 * callers (the subtitle line, the page's own `<title>`) and is unaffected by this.
 */
export function speciesWordFor(species: AnimalSpecies, sex: AnimalSex): string {
  const gender: GrammaticalGender = grammaticalGenderOf(sex);
  return gender === "feminine"
    ? FEMININE_SPECIES_WORD_LABELS[species]
    : SPECIES_WORD_LABELS[species];
}

/**
 * The gallery-v3 card's own sex word («Хлопчик»/«Дівчинка»), named as its own fact rather than
 * folded into the age word's grammatical gender the way `ageWordFor` above does. `null` for
 * `"unknown"` - unlike `ageWordFor`, which must always return *some* age word and so falls back
 * to the masculine form, there is no fallback sex word that would be true, so the caller omits
 * it instead of guessing.
 */
export function sexWordFor(sex: AnimalSex): string | null {
  switch (sex) {
    case "male":
      return uk.cardMeta.sexMale;
    case "female":
      return uk.cardMeta.sexFemale;
    case "unknown":
      return null;
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled variant; unreachable at runtime */
    default: {
      const unreachable: never = sex;
      return unreachable;
    }
  }
}
