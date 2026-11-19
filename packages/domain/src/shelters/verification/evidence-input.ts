import { z } from "zod";
import {
  type CalendarDate,
  instantOfCalendarDate,
  kyivCalendarDateOf,
} from "../../primitives/calendar-date";
import { EdrpouSchema, type ModeratorId } from "../../primitives/ids";
import { CONTACT_INPUT_MAX_LENGTH, ContactChannelInputSchema } from "../contact";
import {
  type EvidenceItem,
  ReferenceRelationshipSchema,
  type VerificationEvidence,
} from "./evidence";

/**
 * Evidence as an operator enters it: the operator script's JSON input file
 * today, the kabinet's S2 evidence step next. One schema for both, so an
 * evidence set assembled in either place is interchangeable with the other
 * (decisions §4).
 *
 * What it leaves out is the point: no `ModeratorId`, no `visitedBy`, no
 * `submittedAt`. Those are facts about who is recording the evidence and
 * when, which an operator never types; the caller supplies them as an
 * `EvidenceAttribution`.
 *
 * `documentKey` defaults to `null` where the domain allows one to be absent,
 * so an input file that has no document to attach doesn't have to spell
 * that out. Accepting a key from a kabinet form is a trust boundary: the
 * handler must accept only keys it issued itself, in the private evidence
 * bucket (H2-6), never an arbitrary string.
 */
/** Upper bounds on operator-typed evidence text, so one item cannot carry a megabyte into the record. */
export const EVIDENCE_NAME_MAX_LENGTH = 300;
export const EVIDENCE_NOTES_MAX_LENGTH = 2000;
export const EVIDENCE_LABEL_MAX_LENGTH = 200;
export const EVIDENCE_DOCUMENT_KEY_MAX_LENGTH = 200;
export const EVIDENCE_ADDRESS_MAX_LENGTH = 300;
/** The most pages one open-sources check lists. */
export const OPEN_SOURCES_MAX_PAGES = 10;

/**
 * A page as stored: the parsed URL's own `href`, so `https:example.com` is kept as
 * `https://example.com/`, never as typed (which a browser would resolve against our origin).
 * Null unless it parses with the https protocol and a host.
 */
export const canonicalHttpsPage = (raw: string): string | null => {
  try {
    const url = new URL(raw.trim());
    return url.protocol === "https:" && url.hostname !== "" ? url.href : null;
  } catch {
    return null;
  }
};

export const EvidenceItemInputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("edrpou_registration"),
    edrpou: EdrpouSchema,
    registeredName: z.string().min(1).max(EVIDENCE_NAME_MAX_LENGTH),
    documentKey: z.string().min(1).max(EVIDENCE_DOCUMENT_KEY_MAX_LENGTH).nullable().default(null),
  }),
  z.object({
    kind: z.literal("bank_account_holder"),
    holderName: z.string().min(1).max(EVIDENCE_NAME_MAX_LENGTH),
    documentKey: z.string().min(1).max(EVIDENCE_DOCUMENT_KEY_MAX_LENGTH).nullable().default(null),
  }),
  z.object({
    kind: z.literal("reference_contact"),
    name: z.string().min(1).max(EVIDENCE_NAME_MAX_LENGTH),
    channel: ContactChannelInputSchema,
    relationship: ReferenceRelationshipSchema,
  }),
  /**
   * `visitedOn` is required (H2-9): stamping the visit with the moment it is
   * *recorded* is false whenever the visit happened before the data entry,
   * which is almost always. A calendar date, not an instant - the operator
   * knows the day they went, not the minute.
   */
  z.object({
    kind: z.literal("site_visit"),
    visitedOn: z.iso.date(),
    notes: z.string().min(1).max(EVIDENCE_NOTES_MAX_LENGTH),
  }),
  /**
   * `checkedOn` is the day checked, a calendar date like `visitedOn` (H2-9). `registry` is all
   * three ЄДР facts or none (an initiative has no entry).
   */
  z.object({
    kind: z.literal("open_sources_review"),
    registry: z
      .object({
        edrpou: EdrpouSchema,
        registeredName: z.string().min(1).max(EVIDENCE_NAME_MAX_LENGTH),
        registeredAddress: z.string().min(1).max(EVIDENCE_ADDRESS_MAX_LENGTH),
      })
      .nullable()
      .default(null),
    pages: z
      .array(
        z
          .string()
          .max(CONTACT_INPUT_MAX_LENGTH)
          .transform((raw, ctx) => {
            const href = canonicalHttpsPage(raw);
            if (href === null) ctx.addIssue({ code: "custom", message: "Not an https page." });
            return href ?? raw;
          })
          .pipe(z.url({ protocol: /^https$/ })),
      )
      .min(1)
      .max(OPEN_SOURCES_MAX_PAGES)
      .readonly(),
    reviews: z.string().min(1).max(EVIDENCE_NOTES_MAX_LENGTH).nullable().default(null),
    notes: z.string().min(1).max(EVIDENCE_NOTES_MAX_LENGTH),
    checkedOn: z.iso.date(),
  }),
  z.object({
    kind: z.literal("supporting_document"),
    labelUk: z.string().min(1).max(EVIDENCE_LABEL_MAX_LENGTH),
    documentKey: z.string().min(1).max(EVIDENCE_DOCUMENT_KEY_MAX_LENGTH),
  }),
]);
export type EvidenceItemInput = z.infer<typeof EvidenceItemInputSchema>;

/**
 * Who is recording this evidence, and when. The operator script passes its
 * founder stand-in (it has no login); the kabinet passes the authenticated
 * operator. Same signature for both, so neither is a special case of the
 * other.
 */
export type EvidenceAttribution = {
  readonly recordedBy: ModeratorId;
  readonly recordedAt: Date;
};

export const toEvidenceItem = (input: EvidenceItemInput, by: EvidenceAttribution): EvidenceItem => {
  switch (input.kind) {
    case "edrpou_registration":
      return {
        kind: "edrpou_registration",
        edrpou: input.edrpou,
        registeredName: input.registeredName,
        documentKey: input.documentKey,
      };
    case "bank_account_holder":
      return {
        kind: "bank_account_holder",
        holderName: input.holderName,
        documentKey: input.documentKey,
      };
    case "reference_contact":
      return {
        kind: "reference_contact",
        name: input.name,
        channel: input.channel,
        relationship: input.relationship,
      };
    case "site_visit":
      return {
        kind: "site_visit",
        // Stored as UTC midnight of that date, how the domain stores days.
        visitedAt: instantOfCalendarDate(input.visitedOn),
        // Whoever is recording the evidence is the operator who vouches for
        // the visit: never a typed field, never a picker (decisions §4).
        visitedBy: by.recordedBy,
        notes: input.notes,
      };
    case "open_sources_review":
      return {
        kind: "open_sources_review",
        registry: input.registry,
        pages: input.pages,
        reviews: input.reviews,
        notes: input.notes,
        checkedAt: instantOfCalendarDate(input.checkedOn),
        // As with a visit: whoever records the check vouches for it.
        checkedBy: by.recordedBy,
      };
    case "supporting_document":
      return {
        kind: "supporting_document",
        label: { uk: input.labelUk, en: null },
        documentKey: input.documentKey,
      };
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled variant; unreachable at runtime */
    default: {
      const unreachable: never = input;
      return unreachable;
    }
  }
};

export type EvidenceInputResult =
  | { kind: "ok"; evidence: VerificationEvidence }
  | { kind: "site_visit_in_future"; visitedOn: string }
  | { kind: "open_sources_check_in_future"; checkedOn: string };

/**
 * Whether a visit dated `visitedOn` lies after the day `recordedAt` falls on
 * in Kyiv. Kyiv's calendar, not UTC's (Oleksii, 2026-10-17, verbatim: "the
 * site-visit "not in the future" check uses the Kyiv calendar date, not
 * UTC"): the operator and every shelter are in Ukraine, so a visit made
 * today and entered at 01:00 local time is today's, although UTC's date is
 * still yesterday. Comparing ISO date strings compares the dates they name.
 * Exported so S2's form warns on the same rule the server refuses on.
 */
export const isSiteVisitInFuture = (visitedOn: CalendarDate, recordedAt: Date): boolean =>
  visitedOn > kyivCalendarDateOf(recordedAt);

/**
 * The whole evidence bundle, stamped with when it was recorded.
 *
 * Refuses a site visit or an open-sources check dated after the day it is
 * recorded (`isSiteVisitInFuture`): that is a typo, not a fact, and it would
 * let a reviewer approve on a check that hasn't happened. A result rather than a
 * throw, as in the verification FSM, so every caller handles the refusal.
 */
export const toVerificationEvidence = (
  inputs: readonly EvidenceItemInput[],
  by: EvidenceAttribution,
): EvidenceInputResult => {
  for (const input of inputs) {
    if (input.kind === "site_visit" && isSiteVisitInFuture(input.visitedOn, by.recordedAt)) {
      return { kind: "site_visit_in_future", visitedOn: input.visitedOn };
    }
    if (
      input.kind === "open_sources_review" &&
      isSiteVisitInFuture(input.checkedOn, by.recordedAt)
    ) {
      return { kind: "open_sources_check_in_future", checkedOn: input.checkedOn };
    }
  }
  return {
    kind: "ok",
    evidence: {
      items: inputs.map((input) => toEvidenceItem(input, by)),
      submittedAt: by.recordedAt,
    },
  };
};
