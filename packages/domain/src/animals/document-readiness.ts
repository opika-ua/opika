import { z } from "zod";

/**
 * Independently tracked because the hard part of cross-border movement is the
 * ordering between items — chip before vaccination, titration a set interval
 * after it — and a single status field cannot express a dependency.
 */
export const DocumentItemSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("absent") }),
  z.object({ kind: z.literal("pending"), since: z.date() }),
  z.object({
    kind: z.literal("present"),
    issuedAt: z.date(),
    expiresAt: z.date().nullable(),
    reference: z.string().min(1).nullable(),
  }),
]);
export type DocumentItem = z.infer<typeof DocumentItemSchema>;

/**
 * Every animal ships as `{ kind: "unknown" }`. The field *shape* exists now so
 * that tracking documents later is a feature rather than a migration across
 * every row, and so a shelter that happens to know a chip number today has
 * somewhere to put it.
 *
 * The date arithmetic that turns these items into an eligibility date is
 * deliberately not here — it belongs with the phase that needs it, and the
 * regulation it would encode is still moving.
 */
export const DocumentReadinessSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("unknown") }),
  z.object({
    kind: z.literal("tracked"),
    microchip: DocumentItemSchema,
    rabiesVaccination: DocumentItemSchema,
    rabiesTitration: DocumentItemSchema,
    vetCertificate: DocumentItemSchema,
  }),
]);
export type DocumentReadiness = z.infer<typeof DocumentReadinessSchema>;

export const UNKNOWN_DOCUMENT_READINESS: DocumentReadiness = { kind: "unknown" };
