import { z } from "zod";

export const REPORT_KINDS = ["outdated", "photo", "scam", "wrongInfo", "other"] as const;
export const ReportKindSchema = z.enum(REPORT_KINDS);
export type ReportKind = z.infer<typeof ReportKindSchema>;

export const REPORT_COMMENT_MAX = 500;

/** Trimmed, then required: a blank box means "no comment", not an empty one. */
export const ReportCommentSchema = z.string().trim().min(1).max(REPORT_COMMENT_MAX);

/** A comment is erased this long after the operator decides the report. */
export const REPORT_COMMENT_RETENTION_DAYS = 90;

/**
 * Backstop for reports nobody decides: a comment is erased at most this long
 * after it was written, decided or not.
 */
export const REPORT_COMMENT_BACKSTOP_DAYS = 180;
