import { z } from "zod";

/**
 * Two code lists rather than one shared enum: a shelter is rejected for reasons
 * about its application and suspended for reasons about its conduct. Merging
 * them would produce a list where most values are invalid in either context,
 * and an admin dropdown that offers nonsense.
 *
 * Codes carry no human-readable copy, so translation stays in the i18n layer
 * and no product naming leaks into this package.
 */
export const RejectionCodeSchema = z.enum([
  "insufficient_evidence",
  "identity_unverifiable",
  "duplicate_submission",
  "out_of_service_area",
  "spam",
  "other",
]);
export type RejectionCode = z.infer<typeof RejectionCodeSchema>;

/**
 * Every code here describes something the platform decided about a shelter.
 *
 * `shelter_requested` used to sit in this list, and its presence was the
 * clearest evidence that `paused` was missing: a shelter closing for the season
 * is not a moderation outcome, and recording it as one reads as punitive in the
 * admin UI and in any conversation with that shelter. It now lives in
 * `PauseCode`, on a state whose exit does not require a moderator.
 */
export const SuspensionCodeSchema = z.enum([
  "unresponsive",
  "complaint_upheld",
  "listing_quality",
  "suspected_fraud",
  "other",
]);
export type SuspensionCode = z.infer<typeof SuspensionCodeSchema>;

/**
 * Why a verified shelter is temporarily not taking adopters, by its own choice.
 *
 * A separate list from `SuspensionCode` for the same reason rejection and
 * suspension are separate: this is self-declared, that is imposed, and a merged
 * enum would offer nonsense in both dropdowns.
 */
export const PauseCodeSchema = z.enum([
  "seasonal_closure",
  "relocation",
  "capacity_reached",
  "staff_shortage",
  "other",
]);
export type PauseCode = z.infer<typeof PauseCodeSchema>;

/** `note` is the escape hatch that keeps `other` usable without reopening the enum. */
export const RejectionReasonSchema = z.object({
  code: RejectionCodeSchema,
  note: z.string().min(1).nullable(),
});
export type RejectionReason = z.infer<typeof RejectionReasonSchema>;

export const SuspensionReasonSchema = z.object({
  code: SuspensionCodeSchema,
  note: z.string().min(1).nullable(),
});
export type SuspensionReason = z.infer<typeof SuspensionReasonSchema>;

export const PauseReasonSchema = z.object({
  code: PauseCodeSchema,
  note: z.string().min(1).nullable(),
});
export type PauseReason = z.infer<typeof PauseReasonSchema>;
