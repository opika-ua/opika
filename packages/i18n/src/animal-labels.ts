import type { AgeSpan } from "@opika/domain";
import {
  type AgeBucket,
  type AnimalSex,
  type AnimalSpecies,
  type GrammaticalGender,
  grammaticalGenderOf,
  pluralizeUk,
  type SizeBucket,
} from "@opika/domain/core";
import { ukPublic as uk } from "./messages/uk-public";
import { fillTemplate } from "./template";

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

const MASCULINE_SIZE_CHIP_WORDS: Record<SizeBucket, string> = {
  small: uk.filters.sizeSmall,
  medium: uk.filters.sizeMedium,
  large: uk.filters.sizeLarge,
};

/** The age word in a card's meta line, e.g. "молодий" in "молодий · мала". */
export function ageBucketLabel(bucket: AgeBucket): string {
  return AGE_BUCKET_LABELS[bucket];
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

const integer = new Intl.NumberFormat("uk");

/** A declared range's words without «≈»: «до 1 року», «3–4 роки», «10+ років» (K3's chips). */
export function ageSpanWords(span: AgeSpan): string {
  switch (span.kind) {
    case "under_one":
      return uk.cardMeta.ageUnderOneYear;
    case "about":
      return fillTemplate(pluralizeUk(span.years, uk.cardMeta.ageYears), {
        count: integer.format(span.years),
      });
    case "between":
      return fillTemplate(pluralizeUk(span.to, uk.cardMeta.ageYearsBetween), {
        from: integer.format(span.from),
        count: integer.format(span.to),
      });
    case "at_least":
      return fillTemplate(uk.cardMeta.ageYearsAtLeast, { from: integer.format(span.from) });
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled variant; unreachable at runtime */
    default: {
      const unreachable: never = span;
      return unreachable;
    }
  }
}

/** One animal's declared age as the card and page print it: «≈ 3–4 роки», «≈ 2 роки», «10+ років», «до 1 року». */
export function ageSpanLabel(span: AgeSpan): string {
  const words = ageSpanWords(span);
  return span.kind === "about" || span.kind === "between"
    ? fillTemplate(uk.cardMeta.ageApprox, { age: words })
    : words;
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

const SPECIES_NEUTRAL_LABELS: Record<AnimalSpecies, string> = {
  dog: uk.detail.speciesDog,
  cat: uk.detail.speciesCat,
};

/** The size word agreeing with the animal's sex, lowercase-as-catalogued for the facts line. */
export function sizeWordFor(size: SizeBucket, sex: AnimalSex): string {
  return grammaticalGenderOf(sex) === "feminine"
    ? SIZE_LABELS[size]
    : MASCULINE_SIZE_CHIP_WORDS[size];
}

/**
 * The one facts line for every animal surface: [species] · sex · age · size, as separate parts.
 * Age and size agree with the sex (girl feminine, boy and unknown masculine); an unknown sex has
 * no word, so the line starts with the age, unless the caller passes `unknownSexText` (the
 * kabinet, where the shelter can fix the gap). Missing age or size (a kabinet draft) is left out.
 * A declared range's span replaces the bucket word. The first part is capitalised, the rest lowercase.
 */
export function animalFactsParts(facts: {
  species?: AnimalSpecies;
  sex: AnimalSex;
  ageBucket: AgeBucket | null;
  ageSpan?: AgeSpan | null;
  size: SizeBucket | null;
  unknownSexText?: string;
}): string[] {
  const { species, sex, ageBucket, ageSpan = null, size, unknownSexText } = facts;
  const parts = [
    species === undefined ? null : SPECIES_NEUTRAL_LABELS[species],
    sexWordFor(sex) ?? unknownSexText ?? null,
    ageSpan !== null
      ? ageSpanLabel(ageSpan)
      : ageBucket === null
        ? null
        : ageWordFor(ageBucket, sex),
    size === null ? null : sizeWordFor(size, sex),
  ]
    .filter((part): part is string => part !== null && part !== "")
    .map((part) => part.toLocaleLowerCase("uk"));
  return parts.map((part, index) =>
    index === 0 ? part.charAt(0).toLocaleUpperCase("uk") + part.slice(1) : part,
  );
}
