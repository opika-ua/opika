import { z } from "zod";
import { EdrpouSchema, ModeratorIdSchema } from "../../primitives/ids";
import { LocalizedTextSchema } from "../../primitives/localized-text";
import { ContactChannelSchema } from "../contact";

export const ReferenceRelationshipSchema = z.enum([
  "veterinary_clinic",
  "local_authority",
  "partner_organisation",
  "other",
]);
export type ReferenceRelationship = z.infer<typeof ReferenceRelationshipSchema>;

/**
 * `documentKey` is an object-storage key, never a URL and never file content.
 * The domain holds references; resolving them is somebody else's job.
 */
export const EvidenceItemSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("edrpou_registration"),
    edrpou: EdrpouSchema,
    documentKey: z.string().min(1).nullable(),
  }),
  z.object({
    kind: z.literal("bank_account_holder"),
    holderName: z.string().min(1),
    documentKey: z.string().min(1).nullable(),
  }),
  z.object({
    kind: z.literal("reference_contact"),
    name: z.string().min(1),
    channel: ContactChannelSchema,
    relationship: ReferenceRelationshipSchema,
  }),
  z.object({
    kind: z.literal("site_visit"),
    visitedAt: z.date(),
    visitedBy: ModeratorIdSchema,
    notes: z.string().min(1),
  }),
  z.object({
    kind: z.literal("supporting_document"),
    label: LocalizedTextSchema,
    documentKey: z.string().min(1),
  }),
]);
export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;
export type EvidenceKind = EvidenceItem["kind"];

/**
 * A list rather than a fixed record, because what a shelter can produce depends
 * on its legal form: a registered NGO has a registration code, a volunteer
 * group has references and a site visit. A fixed record would force nullable
 * fields everywhere and would quietly permit "verified with nothing attached".
 *
 * Keeping it a list means the requirement rule is a predicate over the items,
 * which is testable and tunable without touching the shape.
 */
export const VerificationEvidenceSchema = z.object({
  items: z.array(EvidenceItemSchema).readonly(),
  submittedAt: z.date(),
});
export type VerificationEvidence = z.infer<typeof VerificationEvidenceSchema>;

export const countEvidence = (evidence: VerificationEvidence, kind: EvidenceKind): number =>
  evidence.items.filter((item) => item.kind === kind).length;
