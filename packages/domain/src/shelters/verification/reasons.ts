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

export const SuspensionCodeSchema = z.enum([
  "unresponsive",
  "complaint_upheld",
  "listing_quality",
  "suspected_fraud",
  "shelter_requested",
  "other",
]);
export type SuspensionCode = z.infer<typeof SuspensionCodeSchema>;

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
