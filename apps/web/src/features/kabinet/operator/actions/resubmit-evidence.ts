import type { EvidenceItem, EvidenceItemInput, VerificationEvidence } from "@opika/domain";

/**
 * What resubmit can't send again, and why it is left out rather than sent:
 * `acceptEvidence` refuses any item carrying a document key until the private
 * evidence bucket exists (RG-Q5), so sending one would refuse the whole
 * resubmit. A `supporting_document` is all document; an ЄДРПОУ or bank item
 * keeps its facts and loses only its key (no screen ever set one, and the
 * onboarding script refuses them, so this is a guard, not a case anyone has).
 *
 * Resubmit replaces the evidence list whole (`transition`, `resubmit`), and
 * the shelter's history keeps the evidence each move sent, not the list it
 * replaced: what is left out here is gone from the record (the document
 * itself stays in storage; no code path deletes an object).
 */
export type LeftOut =
  | { kind: "supporting_document"; label: string }
  | { kind: "document_key"; of: "edrpou_registration" | "bank_account_holder" };

export type ResubmitPrefill = {
  /** The current items as the evidence editor and `registry.verification.resubmit` take them. */
  items: EvidenceItemInput[];
  leftOut: LeftOut[];
};

/** A stored day as the calendar date it was entered as: the domain stores a visit's day as its UTC midnight. */
const calendarDateOf = (instant: Date): string => instant.toISOString().slice(0, 10);

const inputOf = (item: EvidenceItem): EvidenceItemInput | null => {
  switch (item.kind) {
    case "edrpou_registration":
      return {
        kind: item.kind,
        edrpou: item.edrpou,
        registeredName: item.registeredName,
        documentKey: null,
      };
    case "bank_account_holder":
      return { kind: item.kind, holderName: item.holderName, documentKey: null };
    case "reference_contact":
      return {
        kind: item.kind,
        name: item.name,
        channel: item.channel,
        relationship: item.relationship,
      };
    case "site_visit":
      // `visitedBy` isn't an input: the server attributes the visit to the
      // operator who sends it (`toEvidenceItem`), as on create.
      return { kind: item.kind, visitedOn: calendarDateOf(item.visitedAt), notes: item.notes };
    case "supporting_document":
      return null;
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled kind; unreachable at runtime */
    default: {
      const unreachable: never = item;
      return unreachable;
    }
  }
};

const leftOutOf = (item: EvidenceItem): LeftOut | null => {
  switch (item.kind) {
    case "supporting_document":
      return { kind: "supporting_document", label: item.label.uk };
    case "edrpou_registration":
    case "bank_account_holder":
      return item.documentKey === null ? null : { kind: "document_key", of: item.kind };
    default:
      return null;
  }
};

/**
 * The evidence editor's starting point for resubmit: every item on file that
 * can be sent again, as it stands, in its order, plus what can't. With no
 * edits, resubmit sends exactly `items` (`ResubmitPanel.test.tsx`).
 */
export function resubmitPrefillOf(evidence: VerificationEvidence): ResubmitPrefill {
  const items: EvidenceItemInput[] = [];
  const leftOut: LeftOut[] = [];
  for (const item of evidence.items) {
    const input = inputOf(item);
    if (input !== null) items.push(input);
    const dropped = leftOutOf(item);
    if (dropped !== null) leftOut.push(dropped);
  }
  return { items, leftOut };
}
