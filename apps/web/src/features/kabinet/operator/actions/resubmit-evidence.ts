import { type EvidenceItem, kyivCalendarDateOf, type VerificationEvidence } from "@opika/domain";
import { channelText } from "../../profile-edit/fields";
import type { EvidenceRow } from "../evidence-editor/evidence-rows";

/**
 * Resubmit's starting point in R-UI 2's editor: one card per item on file
 * that the editor can hold, as it stands, in its order. Sent back unedited
 * (`evidenceOfRows`), the cards rebuild the same items
 * (`resubmit-evidence.test.ts`).
 *
 * What has no card is what the input can't carry: the input refuses any
 * document key until the private evidence bucket exists (RG-Q5), so a
 * `supporting_document` gets no card and an ЄДРПОУ or bank card has no key
 * field; a site visit has no field for who made it. None of it is lost: the
 * server puts it back from the record on file (`withEvidenceOnFile`, Oleksii's
 * round-2b answer 1, verbatim: "The server carries existing
 * supporting-document items over on resubmit. No data loss, no new copy."),
 * so there is nothing for the screen to say.
 */
export function resubmitRowsOf(evidence: VerificationEvidence): EvidenceRow[] {
  return evidence.items.flatMap((item, index) => {
    const row = rowOf(item, rowId(index));
    return row === null ? [] : [row];
  });
}

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
      // Sent back unchanged, the visit keeps whoever made it; changed, it is
      // the sender's (the server's `withEvidenceOnFile`). The day is stored
      // as its UTC midnight, whose Kyiv date is that same day.
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
