import { type EvidenceItem, kyivCalendarDateOf, type VerificationEvidence } from "@opika/domain";
import { channelText } from "../../profile-edit/fields";
import type { EvidenceRow } from "../evidence-editor/evidence-rows";

/**
 * What resubmit can't send again, and why it is left out rather than sent:
 * `acceptEvidence` refuses any item carrying a document key until the private
 * evidence bucket exists (RG-Q5), so sending one would refuse the whole
 * resubmit. A `supporting_document` is all document; an ЄДРПОУ or bank item
 * keeps its facts and loses only its key (no screen ever set one, and the
 * onboarding script refuses them, so this is a guard, not a case anyone has).
 *
 * The consequence: resubmit replaces the evidence list whole (`transition`,
 * `resubmit`), and no history entry holds the list it replaces (a `resubmit`
 * entry holds what it sends; `shelter_created` holds no evidence). So what is
 * left out here is gone from the shelter's record once the resubmit lands.
 * The document itself stays in storage: no code path deletes an object. S4
 * can't say so yet, because the sentence has no copy (NEEDS OLEKSII in the
 * R-UI 3 report), so `leftOut` is computed and pinned, and not shown.
 */
export type LeftOut =
  | { kind: "supporting_document"; label: string }
  | { kind: "document_key"; of: "edrpou_registration" | "bank_account_holder" };

export type ResubmitPrefill = {
  /**
   * The evidence on file as R-UI 2's editor holds it, one card per item, in
   * order. Sent back unedited (`evidenceOfRows`), they rebuild the same items
   * (`resubmit-evidence.test.ts`).
   */
  rows: EvidenceRow[];
  leftOut: LeftOut[];
};

/** A stable React key per item on file, never sent; the editor names its own new cards `added-N`. */
const rowId = (index: number): string => `on-file-${index}`;

const rowOf = (item: EvidenceItem, id: string): EvidenceRow | null => {
  switch (item.kind) {
    case "edrpou_registration":
      return { id, kind: item.kind, edrpou: item.edrpou, registeredName: item.registeredName };
    case "bank_account_holder":
      return { id, kind: item.kind, holderName: item.holderName };
    case "reference_contact":
      // The channel as the shelter's own contact fields show it (K4's
      // `channelText`), which `parseChannel` reads back to the same channel.
      return {
        id,
        kind: item.kind,
        name: item.name,
        channelKind: item.channel.kind,
        channelValue: channelText(item.channel),
        relationship: item.relationship,
      };
    case "site_visit":
      // `visitedBy` has no field: the server attributes the visit to the
      // operator who sends it (`toEvidenceItem`), as on create. The day is
      // stored as its UTC midnight, whose Kyiv date is that same day.
      return {
        id,
        kind: item.kind,
        visitedOn: kyivCalendarDateOf(item.visitedAt),
        notes: item.notes,
      };
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
 * can be sent again, as it stands, in its order, plus what can't.
 */
export function resubmitPrefillOf(evidence: VerificationEvidence): ResubmitPrefill {
  const rows: EvidenceRow[] = [];
  const leftOut: LeftOut[] = [];
  evidence.items.forEach((item, index) => {
    const row = rowOf(item, rowId(index));
    if (row !== null) rows.push(row);
    const dropped = leftOutOf(item);
    if (dropped !== null) leftOut.push(dropped);
  });
  return { rows, leftOut };
}
