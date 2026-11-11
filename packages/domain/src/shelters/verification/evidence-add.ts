import type { ContactChannel } from "../contact";
import type { EvidenceItem } from "./evidence";
import type { ShelterVerification, VerificationStatus } from "./state";

/**
 * Adding evidence is an audited edit of the list, not a verification
 * transition: it changes no status, no timestamp and no reviewer, so it is
 * deliberately NOT a `VerificationEvent` and the FSM table is untouched.
 */
export const EVIDENCE_OPEN_STATUSES = [
  "pending",
  "under_review",
] as const satisfies readonly VerificationStatus[];

/**
 * The most items a shelter's evidence list holds (owner, 2026-11-04). The one
 * source for every writer: create, resubmit and add all refuse a list past it.
 */
export const MAX_EVIDENCE_ITEMS = 30;

/** The most items one add call carries (owner, 2026-11-04). */
export const MAX_EVIDENCE_ITEMS_PER_ADD = 10;

const text = (value: string): string => value.trim().replace(/\s+/g, " ").toLowerCase();

const channelKey = (channel: ContactChannel): string => {
  switch (channel.kind) {
    case "phone":
    case "viber":
    case "whatsapp":
      return `${channel.kind}:${channel.e164}`;
    case "email":
      return `email:${channel.address.trim().toLowerCase()}`;
    case "telegram":
      return `telegram:${channel.handle.toLowerCase()}`;
    case "website":
      return `website:${channel.url}`;
    case "instagram":
      return `instagram:${channel.handle.toLowerCase()}`;
    case "facebook":
      return `facebook:${channel.url}`;
    case "form":
      return `form:${channel.url}`;
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled variant; unreachable at runtime */
    default: {
      const unreachable: never = channel;
      return unreachable;
    }
  }
};

/**
 * What makes two evidence items "the same" for adding: the same kind AND the
 * same key field, and nothing else. Free text that only describes the item is
 * ignored, so re-entering a fact with different notes adds nothing.
 *
 * - edrpou_registration: the EDRPOU code (the registered name is ignored)
 * - bank_account_holder: the holder name (trimmed, case-insensitive)
 * - reference_contact: the contact channel, kind and value (name and relationship ignored)
 * - site_visit: the visit date (notes and who recorded it are ignored)
 * - supporting_document: the document key
 */
export function evidenceDuplicateKey(item: EvidenceItem): string {
  switch (item.kind) {
    case "edrpou_registration":
      return `${item.kind}|${item.edrpou}`;
    case "bank_account_holder":
      return `${item.kind}|${text(item.holderName)}`;
    case "reference_contact":
      return `${item.kind}|${channelKey(item.channel)}`;
    case "site_visit":
      return `${item.kind}|${item.visitedAt.toISOString()}`;
    case "supporting_document":
      return `${item.kind}|${item.documentKey}`;
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled variant; unreachable at runtime */
    default: {
      const unreachable: never = item;
      return unreachable;
    }
  }
}

export type AddEvidenceResult =
  | { kind: "ok"; next: ShelterVerification; added: readonly EvidenceItem[] }
  | { kind: "not_open"; from: VerificationStatus }
  | { kind: "nothing_new" }
  | { kind: "too_many"; limit: number; wouldBe: number };

/**
 * Appends evidence while the shelter is still being decided (`pending`,
 * `under_review`). Items that duplicate one on file, or an earlier one in the
 * same call (`evidenceDuplicateKey`), are dropped, so repeating a call is
 * idempotent; if nothing is left the answer is `nothing_new`. Everything else
 * on the state, including `evidence.submittedAt`, is left as it was.
 */
export function addEvidence(
  state: ShelterVerification,
  items: readonly EvidenceItem[],
): AddEvidenceResult {
  if (state.status !== "pending" && state.status !== "under_review") {
    return { kind: "not_open", from: state.status };
  }
  const seen = new Set(state.evidence.items.map(evidenceDuplicateKey));
  const added: EvidenceItem[] = [];
  for (const item of items) {
    const key = evidenceDuplicateKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    added.push(item);
  }
  if (added.length === 0) return { kind: "nothing_new" };
  const wouldBe = state.evidence.items.length + added.length;
  if (wouldBe > MAX_EVIDENCE_ITEMS) {
    return { kind: "too_many", limit: MAX_EVIDENCE_ITEMS, wouldBe };
  }
  const evidence = { ...state.evidence, items: [...state.evidence.items, ...added] };
  return { kind: "ok", next: { ...state, evidence }, added };
}
