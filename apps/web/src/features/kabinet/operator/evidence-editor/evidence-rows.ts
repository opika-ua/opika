import {
  CalendarDateSchema,
  type ContactChannel,
  EdrpouSchema,
  type EvidenceItemInput,
  isSiteVisitInFuture,
  type ReferenceRelationship,
} from "@opika/domain";
import { type ChannelKind, type FieldError, parseChannel } from "../../profile-edit/fields";

/**
 * The operator's evidence editor, pure half (R-UI 2, S2; R-UI 3's resubmit
 * prefills the same rows). What the editor holds, and how it becomes the
 * contract's `EvidenceItemInputSchema` input. No React, no I/O; the server
 * checks everything again.
 *
 * Four kinds, each needing no document (Oleksii, 2026-10-17, answer 3,
 * verbatim: "Yes: the four document-free evidence types. Document upload is
 * a later R2 block."). `acceptEvidence` refuses every `documentKey` until the
 * private bucket exists (RG-Q5), so nothing here can produce one: the output
 * type has no such field and no `supporting_document` variant.
 */

export const EDITABLE_EVIDENCE_KINDS = [
  "edrpou_registration",
  "bank_account_holder",
  "reference_contact",
  "site_visit",
] as const satisfies readonly EvidenceItemInput["kind"][];
export type EditableEvidenceKind = (typeof EDITABLE_EVIDENCE_KINDS)[number];

/** Every kind a reference can be reached by; the first is the default. */
export const REFERENCE_CHANNEL_KINDS = [
  "phone",
  "telegram",
  "viber",
  "email",
  "website",
] as const satisfies readonly ChannelKind[];

export const REFERENCE_RELATIONSHIPS = [
  "veterinary_clinic",
  "local_authority",
  "partner_organisation",
  "other",
] as const satisfies readonly ReferenceRelationship[];

/**
 * One card as typed. `id` is a stable React key, never sent. A site visit
 * has no visitor field: whoever records the evidence is the visitor
 * (decisions §4), so the server fills it in.
 */
export type EvidenceRow =
  | { id: string; kind: "edrpou_registration"; edrpou: string; registeredName: string }
  | { id: string; kind: "bank_account_holder"; holderName: string }
  | {
      id: string;
      kind: "reference_contact";
      name: string;
      channelKind: ChannelKind;
      channelValue: string;
      /** Empty until one is picked: no default, so the choice is the operator's. */
      relationship: ReferenceRelationship | "";
    }
  | { id: string; kind: "site_visit"; visitedOn: string; notes: string };

/**
 * What the editor sends: the contract's evidence input, minus everything a
 * document needs. Assignable to `EvidenceItemInputSchema`'s input
 * (`documentKey` defaults to null there).
 */
export type DocumentFreeEvidenceInput =
  | { kind: "edrpou_registration"; edrpou: string; registeredName: string }
  | { kind: "bank_account_holder"; holderName: string }
  | {
      kind: "reference_contact";
      name: string;
      channel: ContactChannel;
      relationship: ReferenceRelationship;
    }
  | { kind: "site_visit"; visitedOn: string; notes: string };

export function emptyEvidenceRow(kind: EditableEvidenceKind, id: string): EvidenceRow {
  switch (kind) {
    case "edrpou_registration":
      return { id, kind, edrpou: "", registeredName: "" };
    case "bank_account_holder":
      return { id, kind, holderName: "" };
    case "reference_contact":
      return { id, kind, name: "", channelKind: "phone", channelValue: "", relationship: "" };
    case "site_visit":
      return { id, kind, visitedOn: "", notes: "" };
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled kind; unreachable at runtime */
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
}

/** Which message a field gets: `create.errors.*`, or K4's contact messages for the reference's channel. */
export type EvidenceFieldError = "required" | "edrpouFormat" | "siteVisitInFuture" | FieldError;

/** A card's fields by name; only the fields its kind has ever appear. */
export type EvidenceRowErrors = Readonly<Partial<Record<EvidenceField, EvidenceFieldError>>>;
export type EvidenceField =
  | "edrpou"
  | "registeredName"
  | "holderName"
  | "name"
  | "channelValue"
  | "relationship"
  | "visitedOn"
  | "notes";

export type EvidenceCheck =
  | { kind: "ok"; items: DocumentFreeEvidenceInput[] }
  | { kind: "invalid"; errors: Readonly<Record<string, EvidenceRowErrors>> };

/** Spaces typed while copying a grouped code («43 218 765») go; the 8 digits stay. */
export const normalizeEdrpou = (raw: string): string => raw.replace(/\s/g, "");

/**
 * Trimmed, or null when nothing is left: a required field's missing value,
 * and an optional one's "none" as the contract wants it. S2's form shares it.
 */
export const trimmedOrNull = (raw: string): string | null => {
  const value = raw.trim();
  return value === "" ? null : value;
};

type RowResult =
  | { kind: "ok"; item: DocumentFreeEvidenceInput }
  | { kind: "invalid"; errors: EvidenceRowErrors };

/**
 * One card. `now` decides "today" for the site visit (Kyiv's calendar, the
 * server's own rule, `isSiteVisitInFuture`), so the form warns before a
 * round trip that would be refused.
 */
function rowResult(row: EvidenceRow, now: Date): RowResult {
  const errors: Partial<Record<EvidenceField, EvidenceFieldError>> = {};
  switch (row.kind) {
    case "edrpou_registration": {
      const edrpou = normalizeEdrpou(row.edrpou);
      const registeredName = trimmedOrNull(row.registeredName);
      if (edrpou === "") errors.edrpou = "required";
      else if (!EdrpouSchema.safeParse(edrpou).success) errors.edrpou = "edrpouFormat";
      if (registeredName === null) errors.registeredName = "required";
      if (Object.keys(errors).length > 0 || registeredName === null)
        return { kind: "invalid", errors };
      return { kind: "ok", item: { kind: row.kind, edrpou, registeredName } };
    }
    case "bank_account_holder": {
      const holderName = trimmedOrNull(row.holderName);
      if (holderName === null) return { kind: "invalid", errors: { holderName: "required" } };
      return { kind: "ok", item: { kind: row.kind, holderName } };
    }
    case "reference_contact": {
      const name = trimmedOrNull(row.name);
      if (name === null) errors.name = "required";
      let channel: ContactChannel | null = null;
      if (row.channelValue.trim() === "") errors.channelValue = "required";
      else {
        const parsed = parseChannel(row.channelKind, row.channelValue);
        if (parsed.kind === "ok") channel = parsed.channel;
        else errors.channelValue = parsed.error;
      }
      if (row.relationship === "") errors.relationship = "required";
      if (name === null || channel === null || row.relationship === "") {
        return { kind: "invalid", errors };
      }
      return {
        kind: "ok",
        item: { kind: row.kind, name, channel, relationship: row.relationship },
      };
    }
    case "site_visit": {
      const notes = trimmedOrNull(row.notes);
      const visitedOn = CalendarDateSchema.safeParse(row.visitedOn);
      if (!visitedOn.success) errors.visitedOn = "required";
      else if (isSiteVisitInFuture(visitedOn.data, now)) errors.visitedOn = "siteVisitInFuture";
      if (notes === null) errors.notes = "required";
      if (Object.keys(errors).length > 0 || !visitedOn.success || notes === null) {
        return { kind: "invalid", errors };
      }
      return { kind: "ok", item: { kind: row.kind, visitedOn: visitedOn.data, notes } };
    }
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled kind; unreachable at runtime */
    default: {
      const unreachable: never = row;
      return unreachable;
    }
  }
}

/** Every card, in order, or each card's errors by row id. No cards is a valid, empty list. */
export function evidenceOfRows(rows: readonly EvidenceRow[], now: Date): EvidenceCheck {
  const items: DocumentFreeEvidenceInput[] = [];
  const errors: Record<string, EvidenceRowErrors> = {};
  for (const row of rows) {
    const result = rowResult(row, now);
    if (result.kind === "ok") items.push(result.item);
    else errors[row.id] = result.errors;
  }
  return Object.keys(errors).length > 0 ? { kind: "invalid", errors } : { kind: "ok", items };
}
