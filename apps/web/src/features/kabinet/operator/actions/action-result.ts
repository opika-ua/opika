import { apiErrors, type EmailSendOutcome } from "@opika/contracts";
import type { DonationUrlProblem } from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import { refusedForAboutLength } from "../about-text";
import { refusedForNameLength } from "../display-name";

/**
 * What an S4 action came back as, in the terms the screen speaks. Every
 * refusal the thirteen procedures declare (`registry-actions-client.ts`) maps
 * to one of these; anything else the server says is `failed`.
 *
 * - `illegal_transition`: the status moved since the page was read; S4
 *   re-reads and says so (`errors.illegalTransition`).
 * - `conflict`: the donation proposal changed since it was read (RG-Q12),
 *   or the record did under the rename form (R-UI 4); S4 re-reads and shows
 *   the current one (`donation.conflict`, `errors.conflictReload`).
 * - `evidence_insufficient`: approve refused on the evidence on file, which
 *   changed since the page was read (the button is gated on the same rule);
 *   the re-read panel shows the gaps.
 * - `verified_data_missing`: approve refused while the legal entity or address
 *   is missing (checked before the evidence); the same re-read path.
 * - `not_found`: the admin is already gone (removed, or accepted meanwhile
 *   for a resend); S4 re-reads (`admins.gone`).
 * - `address_has_a_role`: invite or resend refused for an address that has a
 *   role elsewhere (`create.errors.addressHasARole.*`).
 * - `invalid_evidence`: resubmit refused on the evidence sent.
 * - `donation_link_refused`: approve refused for a link a new proposal could not be
 *   (`donation.cannotApprove.*`).
 * - `name_too_long`: the rename refused by the input check for the display
 *   name's cap (RUI4-F2), which the rename form shows on its field.
 * - `description_too_long`: the same for the shelter's text over its cap, shown on the about form.
 * - `no_answer`: nothing came back at all (the connection dropped, a
 *   timeout). The server may have done it anyway, so S4 re-reads before
 *   saying anything (inbox K4-T16's pattern).
 */
export type ActionFailure =
  | { kind: "illegal_transition" }
  | { kind: "conflict" }
  | { kind: "evidence_insufficient" }
  | { kind: "verified_data_missing" }
  | { kind: "evidence_not_editable" }
  | { kind: "evidence_limit_reached" }
  | { kind: "early_listing_refused"; reason: EarlyListingRefusal }
  | { kind: "not_found" }
  | { kind: "address_has_a_role"; reason: AddressRoleReason }
  | { kind: "invalid_evidence"; reason: InvalidEvidenceReason }
  | { kind: "donation_link_refused"; problem: DonationUrlProblem }
  | { kind: "name_too_long" }
  | { kind: "description_too_long" }
  | { kind: "no_answer" }
  | { kind: "failed" };

export type ActionRefusal = Exclude<ActionFailure, { kind: "no_answer" }>;

type EarlyListingRefusal =
  | "wrong_status"
  | "already_running"
  | "not_running"
  | "evidence_below_minimum"
  | "note_required"
  | "limit_reached";
type AddressRoleReason = "shelter_admin" | "operator" | "invited_elsewhere";
type InvalidEvidenceReason = "site_visit_in_future" | "document_not_supported_yet";

const fieldOf = (error: unknown, field: "code" | "data"): unknown =>
  typeof error === "object" && error !== null && field in error
    ? (error as Record<string, unknown>)[field]
    : undefined;

export function actionFailureOf(error: unknown): ActionFailure {
  const code = fieldOf(error, "code");
  // No error code: no answer from the server reached the browser (fetch threw).
  if (typeof code !== "string") return { kind: "no_answer" };
  switch (code) {
    case "ILLEGAL_TRANSITION":
      return { kind: "illegal_transition" };
    case "CONFLICT":
      return { kind: "conflict" };
    case "EVIDENCE_INSUFFICIENT":
      return { kind: "evidence_insufficient" };
    case "VERIFIED_DATA_MISSING":
      return { kind: "verified_data_missing" };
    case "EVIDENCE_NOT_EDITABLE":
      return { kind: "evidence_not_editable" };
    case "EVIDENCE_LIMIT_REACHED":
      return { kind: "evidence_limit_reached" };
    case "EARLY_LISTING_REFUSED": {
      const data = apiErrors.EARLY_LISTING_REFUSED.data.safeParse(fieldOf(error, "data"));
      return data.success
        ? { kind: "early_listing_refused", reason: data.data.reason }
        : { kind: "failed" };
    }
    case "NOT_FOUND":
      return { kind: "not_found" };
    case "ADDRESS_HAS_A_ROLE": {
      // The reason is the server's data: read through the contract's own schema, never assumed.
      const data = apiErrors.ADDRESS_HAS_A_ROLE.data.safeParse(fieldOf(error, "data"));
      return data.success
        ? { kind: "address_has_a_role", reason: data.data.reason }
        : { kind: "failed" };
    }
    case "INVALID_EVIDENCE": {
      const data = apiErrors.INVALID_EVIDENCE.data.safeParse(fieldOf(error, "data"));
      return data.success
        ? { kind: "invalid_evidence", reason: data.data.reason }
        : { kind: "failed" };
    }
    case "DONATION_LINK_REFUSED": {
      const data = apiErrors.DONATION_LINK_REFUSED.data.safeParse(fieldOf(error, "data"));
      return data.success
        ? { kind: "donation_link_refused", problem: data.data.problem }
        : { kind: "failed" };
    }
    case "BAD_REQUEST":
      if (refusedForNameLength(error)) return { kind: "name_too_long" };
      return refusedForAboutLength(error) ? { kind: "description_too_long" } : { kind: "failed" };
    default:
      return { kind: "failed" };
  }
}

/**
 * The refusals that mean what S4 shows is stale: the record changed under
 * it. The page reads it again before the message, so «Сторінку оновлено» is
 * true when it is said.
 */
export const staleAfter = (failure: ActionRefusal): boolean =>
  failure.kind === "illegal_transition" ||
  failure.kind === "conflict" ||
  failure.kind === "evidence_insufficient" ||
  failure.kind === "verified_data_missing" ||
  failure.kind === "evidence_not_editable" ||
  // The status or the running period moved under the page; the other reasons are about the input.
  (failure.kind === "early_listing_refused" &&
    (failure.reason === "wrong_status" ||
      failure.reason === "already_running" ||
      failure.reason === "not_running")) ||
  failure.kind === "not_found";

/**
 * What became of an invitation email, as the operator is told it (IN-E7: the
 * operator UI shows the send result directly). `email` is the address the
 * operator typed or the admin's own, which is theirs to see.
 */
export function emailOutcomeText(outcome: EmailSendOutcome, email: string): string {
  const t = uk.kabinet.operator.email;
  switch (outcome.kind) {
    case "sent":
      return outcome.blockCheck === "clear" ? fillTemplate(t.sent, { email }) : t.sentUnchecked;
    case "blocked":
      return t.blocked[outcome.reason];
    case "failed":
      return t.failed[outcome.reason];
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled outcome; unreachable at runtime */
    default: {
      const unreachable: never = outcome;
      return unreachable;
    }
  }
}
