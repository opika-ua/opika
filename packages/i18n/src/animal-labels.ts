import type { AgeBucket, SizeBucket } from "@opika/domain";
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
