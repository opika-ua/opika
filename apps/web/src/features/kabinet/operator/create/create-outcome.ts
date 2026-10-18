import { apiErrors, type EmailSendOutcome, UNKNOWN_CITY_MESSAGE } from "@opika/contracts";
import { fillTemplate, uk } from "@opika/i18n";
import type { z } from "zod";
import { formatDayMonth, formatTime } from "../format";

/**
 * The reasons the contract declares on the two refusals S2 reads, taken from
 * its own schemas rather than copied: a reason added there must be handled
 * here before anything compiles (`ADDRESS_ROLE_MESSAGES`, `EVIDENCE_REFUSALS`).
 */
type AddressRoleReason = z.infer<typeof apiErrors.ADDRESS_HAS_A_ROLE.data>["reason"];
type EvidenceRefusalReason = z.infer<typeof apiErrors.INVALID_EVIDENCE.data>["reason"];

/**
 * What S2's submit came back as, in the terms the screen speaks (Oleksii's
 * `create.errors.*`). Pure: the component calls this with whatever the client
 * threw.
 *
 * - `address_has_a_role`: ADDRESS_HAS_A_ROLE (409), the first admin's address
 *   already belongs to a shelter, is an operator's, or holds a live invitation
 *   elsewhere (RG-T10). Checked before anything is created.
 * - `site_visit_in_future`: INVALID_EVIDENCE (422) for a visit dated after
 *   Kyiv's today. The form checks the same rule first; this is the server's
 *   word when the two clocks disagree.
 * - `unknown_city`: the undeclared 400 for a city id that resolves to nothing
 *   (RG-T5), told apart from oRPC's input-validation 400 by its message.
 * - `lost_answer`: no answer reached the page (the request threw before any
 *   response), or any 5xx. A 500, or a gateway's 502 or 504, can come after
 *   the shelter was written (RG-T6: shelter, then invitation, no
 *   transaction), and create is not idempotent, so the page never retries and
 *   says to check the list first (RU-T9). Every 5xx reads this way, the
 *   registry's 503 without LOCATION_HMAC_SECRET (RG-Q10) included, although
 *   that one comes before anything is written: the page itself answers 404
 *   without the key (RU-T5), so the form meets that 503 only if the key goes
 *   between loading the page and pressing, and a look at the list costs
 *   nothing then.
 * - `failed`: any other refusal, each one answered before anything was
 *   written (access, the rate limit, input validation, a document the form
 *   never sends).
 */
export type CreateRefusal =
  | { kind: "address_has_a_role"; reason: AddressRoleReason }
  | { kind: "site_visit_in_future" }
  | { kind: "unknown_city" }
  | { kind: "lost_answer" }
  | { kind: "failed" };

type ErrorShape = { code: string; status: number | null; message: string; data: unknown };

const shapeOf = (error: unknown): ErrorShape | null => {
  if (typeof error !== "object" || error === null) return null;
  const { code, status, message, data } = error as Record<string, unknown>;
  if (typeof code !== "string") return null;
  return {
    code,
    status: typeof status === "number" ? status : null,
    message: typeof message === "string" ? message : "",
    data,
  };
};

/** Each evidence refusal the contract declares, as S2 reads it. */
const EVIDENCE_REFUSALS: Record<EvidenceRefusalReason, CreateRefusal> = {
  site_visit_in_future: { kind: "site_visit_in_future" },
  // The form never sends a document (RU-Q3), so this one is a fault it can't
  // cause: the plain failure, not a message about something the operator did.
  document_not_supported_yet: { kind: "failed" },
};

export function createRefusalOf(error: unknown): CreateRefusal {
  const shape = shapeOf(error);
  // No code: no response reached the page at all (fetch threw).
  if (shape === null) return { kind: "lost_answer" };
  if (shape.status !== null && shape.status >= 500) return { kind: "lost_answer" };
  switch (shape.code) {
    case "ADDRESS_HAS_A_ROLE": {
      const data = apiErrors.ADDRESS_HAS_A_ROLE.data.safeParse(shape.data);
      return data.success
        ? { kind: "address_has_a_role", reason: data.data.reason }
        : { kind: "failed" };
    }
    case "INVALID_EVIDENCE": {
      const data = apiErrors.INVALID_EVIDENCE.data.safeParse(shape.data);
      return data.success ? EVIDENCE_REFUSALS[data.data.reason] : { kind: "failed" };
    }
    case "BAD_REQUEST":
      return shape.message === UNKNOWN_CITY_MESSAGE ? { kind: "unknown_city" } : { kind: "failed" };
    default:
      return { kind: "failed" };
  }
}

/** His sentence for each address reason; typed by the contract's reasons, so none can go without one. */
const ADDRESS_ROLE_MESSAGES: Record<AddressRoleReason, string> =
  uk.kabinet.operator.create.errors.addressHasARole;

/** Oleksii's sentence for a refusal. */
export function refusalMessage(refusal: CreateRefusal): string {
  const t = uk.kabinet.operator.create.errors;
  switch (refusal.kind) {
    case "address_has_a_role":
      return ADDRESS_ROLE_MESSAGES[refusal.reason];
    case "site_visit_in_future":
      return t.siteVisitInFuture;
    case "unknown_city":
      return t.unknownCity;
    case "lost_answer":
      return t.lostAnswer;
    case "failed":
      return t.failed;
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled refusal; unreachable at runtime */
    default: {
      const unreachable: never = refusal;
      return unreachable;
    }
  }
}

/**
 * What became of an invitation email, as Oleksii's sentence (`email.*`).
 * `{email}` is the address the server normalised and stored, so the operator
 * reads exactly the address the link went to.
 */
export function emailOutcomeMessage(outcome: EmailSendOutcome, email: string): string {
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

/** «20 жовтня» and «11:04», Kyiv's: the operator's own clock, whatever the browser's zone. */
export function kyivDateAndTime(instant: Date): { date: string; time: string } {
  return { date: formatDayMonth(instant), time: formatTime(instant) };
}
