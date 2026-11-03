import { z } from "zod";
import { ReportCommentSchema } from "./kind";

/** What a reporter may say. The comment is required only for "other". */
export const ReportDraftSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("outdated"), comment: ReportCommentSchema.optional() }),
  z.strictObject({ kind: z.literal("photo"), comment: ReportCommentSchema.optional() }),
  z.strictObject({ kind: z.literal("scam"), comment: ReportCommentSchema.optional() }),
  z.strictObject({ kind: z.literal("wrongInfo"), comment: ReportCommentSchema.optional() }),
  z.strictObject({ kind: z.literal("other"), comment: ReportCommentSchema }),
]);
export type ReportDraft = z.infer<typeof ReportDraftSchema>;
