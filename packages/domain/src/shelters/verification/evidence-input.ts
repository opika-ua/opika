import { z } from "zod";
import { EdrpouSchema, type ModeratorId } from "../../primitives/ids";
import { ContactChannelSchema } from "../contact";
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
export const EvidenceItemInputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("edrpou_registration"),
    edrpou: EdrpouSchema,
    registeredName: z.string().min(1),
    documentKey: z.string().min(1).nullable().default(null),
  }),
  z.object({
    kind: z.literal("bank_account_holder"),
    holderName: z.string().min(1),
    documentKey: z.string().min(1).nullable().default(null),
  }),
  z.object({
    kind: z.literal("reference_contact"),
    name: z.string().min(1),
    channel: ContactChannelSchema,
    relationship: ReferenceRelationshipSchema,
  }),
  /**
   * `visitedOn` is required (H2-9): stamping the visit with the moment it is
   * *recorded* is false whenever the visit happened before the data entry,
   * which is almost always. A calendar date, not an instant — the operator
   * knows the day they went, not the minute.
   */
  z.object({
    kind: z.literal("site_visit"),
    visitedOn: z.iso.date(),
    notes: z.string().min(1),
  }),
  z.object({
    kind: z.literal("supporting_document"),
    labelUk: z.string().min(1),
    documentKey: z.string().min(1),
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

/** A calendar date as the instant it starts, in UTC, which is how the domain stores days. */
const startOfDay = (isoDate: string): Date => new Date(`${isoDate}T00:00:00.000Z`);

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
        visitedAt: startOfDay(input.visitedOn),
        // Whoever is recording the evidence is the operator who vouches for
        // the visit: never a typed field, never a picker (decisions §4).
        visitedBy: by.recordedBy,
        notes: input.notes,
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
  | { kind: "site_visit_in_future"; visitedOn: string };

/**
 * The whole evidence bundle, stamped with when it was recorded.
 *
 * Refuses a site visit dated after the day it is recorded: that is a typo,
 * not a fact, and it would let a reviewer approve on a visit that hasn't
 * happened. Compared as UTC calendar days, matching how `visitedAt` is
 * stored. This package holds no time zone, so one consequence is accepted
 * and stated: an operator in Kyiv recording a same-day visit between local
 * midnight and 02:00–03:00 is refused until UTC catches up. The error only
 * ever refuses wrongly; it never accepts a future visit. A result rather than a throw, as in the verification FSM, so
 * every caller handles the refusal.
 */
export const toVerificationEvidence = (
  inputs: readonly EvidenceItemInput[],
  by: EvidenceAttribution,
): EvidenceInputResult => {
  const today = by.recordedAt.toISOString().slice(0, 10);
  for (const input of inputs) {
    if (input.kind === "site_visit" && input.visitedOn > today) {
      return { kind: "site_visit_in_future", visitedOn: input.visitedOn };
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
