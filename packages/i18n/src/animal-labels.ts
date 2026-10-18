import {
  type AgeBucket,
  type AnimalSex,
  type GrammaticalGender,
  grammaticalGenderOf,
  type SizeBucket,
} from "@opika/domain";
import { uk } from "./messages/uk";

/**
 * Both maps are `Record`s over the domain's own bucket types, not a
 * `switch` with a `default` — a bucket added to `AGE_BUCKETS`/`SIZE_BUCKETS`
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

/** The age word that agrees with the animal (Q9). The masculine set is the card's long-standing words. */
export function ageBucketLabelFor(bucket: AgeBucket, gender: GrammaticalGender): string {
  return gender === "feminine" ? FEMININE_AGE_BUCKET_LABELS[bucket] : AGE_BUCKET_LABELS[bucket];
}

/**
 * The age word on one animal's card, meta line and page (Q9, Oleksii 2026-10-18): female →
 * «молода»; male and «Не записано» → «молодий». Never for filter chips, which name categories.
 */
export function ageWordFor(bucket: AgeBucket, sex: AnimalSex): string {
  return ageBucketLabelFor(bucket, grammaticalGenderOf(sex));
}
