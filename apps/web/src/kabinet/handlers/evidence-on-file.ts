import type { EvidenceItem, VerificationEvidence } from "@opika/domain";

/**
 * What the operator's resubmit can't send, put back from the record on file.
 *
 * Resubmit replaces the evidence list whole (`transition`, `resubmit`), and
 * the input can't carry two things the record holds:
 *
 * - **Documents.** The input refuses every `documentKey` until the private
 *   evidence bucket exists (RG-Q5, `acceptEvidence`). So a
 *   `supporting_document` on file is carried over whole, always (Oleksii,
 *   round 2b, answer 1, verbatim: "N6: option (a). The server carries existing
 *   supporting-document items over on resubmit. No data loss, no new copy.").
 *   An ЄДРПОУ or bank item holding a key is the same kind of data: it gets
 *   its key back when it comes back with the same facts, and is carried over
 *   whole when it doesn't, so editing its facts can't drop the document
 *   either. (No record holds such a key today: every writer refuses one.)
 *   The cost, until documents can be managed: a resubmit can't remove a
 *   document.
 * - **Who made a site visit.** Never typed (`toEvidenceItem`: the recording
 *   operator vouches for the visit). A visit that comes back unchanged, the
 *   same day and the same notes, keeps whoever recorded it; a new or changed
 *   one is the resubmitting operator's, who is vouching for it as now written
 *   (AW-R3-11, "no data loss": decided in the away session of 2026-10-17,
 *   consistent with his answer above but not his words; that the notes are
 *   part of what makes it the same visit is the builder's reading).
 *
 * Each item on file pairs with at most one item sent, so two identical
 * visits keep their two recorders. Carried items follow the sent ones, in
 * their order on file. The caller reads `onFile` from the record it is about
 * to write over, never from input.
 */
export function withEvidenceOnFile(
  onFile: VerificationEvidence,
  sent: VerificationEvidence,
): VerificationEvidence {
  const unpaired = [...onFile.items];
  const pairOf = (item: EvidenceItem): EvidenceItem | undefined => {
    const index = unpaired.findIndex((candidate) => sameTypedFacts(candidate, item));
    return index === -1 ? undefined : unpaired.splice(index, 1)[0];
  };
  const items = sent.items.map((item): EvidenceItem => {
    switch (item.kind) {
      case "site_visit": {
        const pair = pairOf(item);
        return pair?.kind === "site_visit" ? { ...item, visitedBy: pair.visitedBy } : item;
      }
      case "edrpou_registration":
      case "bank_account_holder": {
        const pair = pairOf(item);
        return pair !== undefined && pair.kind === item.kind && pair.documentKey !== null
          ? { ...item, documentKey: pair.documentKey }
          : item;
      }
      default:
        return item;
    }
  });
  return { items: [...items, ...unpaired.filter(holdsDocument)], submittedAt: sent.submittedAt };
}

/**
 * Whether two items say the same thing in everything the operator types,
 * leaving out what only the server holds (a document key, who made a
 * visit). Field by field rather than serialised: the record comes back from
 * JSONB with its keys reordered. Only the kinds the server holds something
 * for are paired; the rest go back exactly as sent.
 */
function sameTypedFacts(onFile: EvidenceItem, sent: EvidenceItem): boolean {
  switch (onFile.kind) {
    case "site_visit":
      return (
        sent.kind === "site_visit" &&
        sent.visitedAt.getTime() === onFile.visitedAt.getTime() &&
        sent.notes === onFile.notes
      );
    case "edrpou_registration":
      return (
        sent.kind === "edrpou_registration" &&
        sent.edrpou === onFile.edrpou &&
        sent.registeredName === onFile.registeredName
      );
    case "bank_account_holder":
      return sent.kind === "bank_account_holder" && sent.holderName === onFile.holderName;
    case "reference_contact":
    case "supporting_document":
      return false;
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled kind; unreachable at runtime */
    default: {
      const unreachable: never = onFile;
      return unreachable;
    }
  }
}

/** Whether an item points at a document the input can't send back. */
function holdsDocument(item: EvidenceItem): boolean {
  switch (item.kind) {
    case "supporting_document":
      return true;
    case "edrpou_registration":
    case "bank_account_holder":
      return item.documentKey !== null;
    default:
      return false;
  }
}
