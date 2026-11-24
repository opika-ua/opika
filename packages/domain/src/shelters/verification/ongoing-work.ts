import { z } from "zod";
import {
  kyivCalendarDateOf,
  monthsBetween,
  type YearMonth,
  YearMonthSchema,
  yearMonthMonthsBefore,
  yearMonthOf,
} from "../../primitives/calendar-date";

/**
 * An initiative's documented ongoing work (owner, 2026-11-24): what the operator saw of the
 * documents, never the documents themselves. Kinds are his D2 list.
 */
export const ONGOING_WORK_DOCUMENT_KINDS = [
  "vet_receipt",
  "food_purchase",
  "transport",
  "other",
] as const;
export const OngoingWorkDocumentKindSchema = z.enum(ONGOING_WORK_DOCUMENT_KINDS);
export type OngoingWorkDocumentKind = z.infer<typeof OngoingWorkDocumentKindSchema>;

/** The longest issuer, on input and in the stored schema alike: every typed name's cap. */
export const ONGOING_WORK_ISSUER_MAX_LENGTH = 300;

/** `issuer` is the clinic or shop, never a person's name. */
export const OngoingWorkDocumentSchema = z.object({
  kind: OngoingWorkDocumentKindSchema,
  month: YearMonthSchema,
  issuer: z.string().min(1).max(ONGOING_WORK_ISSUER_MAX_LENGTH),
});
export type OngoingWorkDocument = z.infer<typeof OngoingWorkDocumentSchema>;

/** Documents from at least this many different months make one record (owner, 2026-11-24). */
export const ONGOING_WORK_MIN_MONTHS = 2;

/** No document older than this many months when recorded (owner, 2026-11-24, D3). */
export const ONGOING_WORK_MAX_AGE_MONTHS = 12;

/** The most documents one record lists. */
export const ONGOING_WORK_MAX_DOCUMENTS = 12;

export const distinctMonthCount = (documents: readonly { month: YearMonth }[]): number =>
  new Set(documents.map((document) => document.month)).size;

export type OngoingWorkProblem =
  | { kind: "too_few_months" }
  | { kind: "month_in_future"; month: YearMonth }
  | { kind: "month_too_old"; month: YearMonth };

/**
 * Why these documents can't make a record at `now`, or null. Months are Kyiv's calendar, as every
 * "not in the future" check here is. A month exactly 12 back is still accepted: in November 2026
 * the oldest is November 2025.
 */
export function ongoingWorkProblemOf(
  documents: readonly { month: YearMonth }[],
  now: Date,
): OngoingWorkProblem | null {
  const current = yearMonthOf(kyivCalendarDateOf(now));
  for (const { month } of documents) {
    const age = monthsBetween(month, current);
    if (age < 0) return { kind: "month_in_future", month };
    if (age > ONGOING_WORK_MAX_AGE_MONTHS) return { kind: "month_too_old", month };
  }
  if (distinctMonthCount(documents) < ONGOING_WORK_MIN_MONTHS) return { kind: "too_few_months" };
  return null;
}

/** Every month a document may be from at `now`, newest first: the form's choices. */
export const ongoingWorkMonthsAt = (now: Date): readonly YearMonth[] => {
  const current = yearMonthOf(kyivCalendarDateOf(now));
  return Array.from({ length: ONGOING_WORK_MAX_AGE_MONTHS + 1 }, (_, back) =>
    yearMonthMonthsBefore(current, back),
  );
};
