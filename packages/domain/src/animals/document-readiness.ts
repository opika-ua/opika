import { z } from "zod";

/**
 * Independently tracked because the hard part of cross-border movement is the
 * ordering between items — chip before vaccination, titration a set interval
 * after it — and a single status field cannot express a dependency.
 *
 * `unknown` and `absent` are different claims and both are needed. "Nobody has
 * checked whether this dog is chipped" is not "this dog has no chip": the first
 * is a gap in our records, the second is a fact about the animal that blocks
 * travel and that someone had to establish. Without `unknown`, the moment an
 * animal moved to `tracked` every unexamined item would assert a fact nobody
 * held — in a product whose entire differentiator is being honest about missing
 * data.
 */
export const DocumentItemSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("unknown") }),
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

export const UNKNOWN_DOCUMENT_ITEM: DocumentItem = { kind: "unknown" };

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

export type TrackedDocumentReadiness = Extract<DocumentReadiness, { kind: "tracked" }>;

export const UNKNOWN_DOCUMENT_READINESS: DocumentReadiness = { kind: "unknown" };

/**
 * A `tracked` readiness in which nothing is claimed yet.
 *
 * Recording one document should not require a shelter to make three assertions
 * it has no basis for. Spreading `overrides` over an all-unknown baseline means
 * a shelter entering a chip number says exactly that and nothing more.
 */
export const trackedDocumentReadiness = (
  overrides: Partial<Omit<TrackedDocumentReadiness, "kind">> = {},
): TrackedDocumentReadiness => ({
  kind: "tracked",
  microchip: UNKNOWN_DOCUMENT_ITEM,
  rabiesVaccination: UNKNOWN_DOCUMENT_ITEM,
  rabiesTitration: UNKNOWN_DOCUMENT_ITEM,
  vetCertificate: UNKNOWN_DOCUMENT_ITEM,
  ...overrides,
});

/**
 * Whether anything is actually known about an animal's paperwork.
 *
 * A `tracked` readiness whose items are all unknown carries no more information
 * than `{ kind: "unknown" }`, so any surface deciding whether to show a
 * documents section should ask this rather than testing `kind` alone.
 */
export const hasAnyDocumentEvidence = (readiness: DocumentReadiness): boolean =>
  readiness.kind === "tracked" &&
  [
    readiness.microchip,
    readiness.rabiesVaccination,
    readiness.rabiesTitration,
    readiness.vetCertificate,
  ].some((item) => item.kind !== "unknown");
