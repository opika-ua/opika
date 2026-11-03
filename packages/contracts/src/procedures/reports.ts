import { AnimalIdSchema, ReportCommentSchema } from "@opika/domain";
import { oc } from "@orpc/contract";
import { z } from "zod";

// `website` is a honeypot: a human never sees it, a form-filling bot does.
// It has to travel in the JSON body, so it is declared here with a length cap.
const base = { animalId: AnimalIdSchema, website: z.string().max(200).optional() };
const optionalComment = ReportCommentSchema.optional();

/** The comment is required only for "other". Same rules as the domain draft. */
export const ReportsCreateInputSchema = z.discriminatedUnion("kind", [
  z.strictObject({ ...base, kind: z.literal("outdated"), comment: optionalComment }),
  z.strictObject({ ...base, kind: z.literal("photo"), comment: optionalComment }),
  z.strictObject({ ...base, kind: z.literal("scam"), comment: optionalComment }),
  z.strictObject({ ...base, kind: z.literal("wrongInfo"), comment: optionalComment }),
  z.strictObject({ ...base, kind: z.literal("other"), comment: ReportCommentSchema }),
]);

export const ReportsCreateOutputSchema = z.object({ ok: z.literal(true) });

/**
 * No declared errors: every refusal (limit, honeypot, unknown animal) answers
 * `{ ok: true }`, so the endpoint reveals nothing about why a report was dropped.
 */
export const reportsCreateContract = oc
  .input(ReportsCreateInputSchema)
  .output(ReportsCreateOutputSchema);
