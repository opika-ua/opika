import type { AgeBucket, GrammaticalGender, SizeBucket } from "@opika/domain";
import { COPY_PENDING, uk } from "./messages/uk";

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

/**
 * The feminine age words for the card's meta line (follow-up Q9, K3-F1; Oleksii, 2026-10-17:
 * "Follow-up, not PR 4: sex-aware age words on the card (Q9)"). Pending his Ukrainian, so they
 * live here rather than in `uk`, and nothing renders them yet: `animal-labels.test.ts` fails if
 * anything outside this package imports `ageBucketLabelFor` while one of them is still pending.
 * The English in each placeholder is the sense, not a draft.
 */
export const PENDING_FEMININE_AGE_LABELS: Record<AgeBucket, string> = {
  baby: `${COPY_PENDING} feminine counterpart of «${uk.cardMeta.ageBaby}» (a female baby animal)`,
  young: `${COPY_PENDING} feminine counterpart of «${uk.cardMeta.ageYoung}»`,
  adult: `${COPY_PENDING} feminine counterpart of «${uk.cardMeta.ageAdult}»`,
  senior: `${COPY_PENDING} feminine counterpart of «${uk.cardMeta.ageSenior}»`,
};

/** The age word that agrees with the animal (Q9). The masculine set is today's card words. */
export function ageBucketLabelFor(bucket: AgeBucket, gender: GrammaticalGender): string {
  return gender === "feminine" ? PENDING_FEMININE_AGE_LABELS[bucket] : AGE_BUCKET_LABELS[bucket];
}
