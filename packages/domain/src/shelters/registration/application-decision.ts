import { z } from "zod";
import type { ModeratorId } from "../../primitives/ids";
import type { VerificationEvent } from "../verification/events";
import type { RejectionCode } from "../verification/reasons";
import type { ShelterVerification, VerificationStatus } from "../verification/state";
import { transition } from "../verification/transition";
import type { EmailStatus } from "./lifecycle";

/** The presets the operator picks from when refusing an application (A5), in display order. */
export const APPLICATION_REJECTION_CODES = [
  "not_animal_welfare",
  "duplicate_submission",
  "identity_unverifiable",
  "other",
] as const satisfies readonly RejectionCode[];

export const APPLICATION_REJECTION_NOTE_MAX_CHARACTERS = 500;

/** `other` is «Інше: {text}», so it needs the text; the others may carry one. */
export const ApplicationRejectionReasonSchema = z
  .object({
    code: z.enum(APPLICATION_REJECTION_CODES),
    note: z.string().trim().min(1).max(APPLICATION_REJECTION_NOTE_MAX_CHARACTERS).nullable(),
  })
  .refine((reason) => reason.code !== "other" || reason.note !== null, { path: ["note"] });
export type ApplicationRejectionReason = z.infer<typeof ApplicationRejectionReasonSchema>;

/**
 * A plan for one operator decision. The caller writes `next` (and, on accept, the early-listing
 * column) conditionally on the status it read, so a double click lands on `already_decided`.
 */
export type ApplicationDecision =
  | {
      kind: "ok";
      event: VerificationEvent;
      next: ShelterVerification;
      /** Set on accept: its first early-listing period starts with the approval (P0-1 (A)). */
      earlyListingSince: Date | null;
    }
  | { kind: "already_decided"; status: VerificationStatus }
  | { kind: "email_unconfirmed" }
  | { kind: "non_monotonic" };

const planOf = (
  verification: ShelterVerification,
  event: VerificationEvent,
  earlyListingSince: Date | null,
): ApplicationDecision => {
  const result = transition(verification, event);
  switch (result.kind) {
    case "ok":
      return { kind: "ok", event, next: result.next, earlyListingSince };
    case "illegal":
      return { kind: "already_decided", status: verification.status };
    case "non_monotonic":
      return { kind: "non_monotonic" };
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled variant; unreachable at runtime */
    default: {
      const unreachable: never = result;
      return unreachable;
    }
  }
};

/** «Схвалити»: refused until the registrant confirmed the email (D1). */
export function acceptApplication(input: {
  verification: ShelterVerification;
  email: EmailStatus;
  moderatorId: ModeratorId;
  now: Date;
}): ApplicationDecision {
  const { verification, email, moderatorId, now } = input;
  if (verification.status !== "application") {
    return { kind: "already_decided", status: verification.status };
  }
  if (email === "unconfirmed") return { kind: "email_unconfirmed" };
  return planOf(verification, { type: "accept_application", at: now, moderatorId }, now);
}

/** «Відхилити»: allowed whether or not the email was confirmed. */
export function rejectApplication(input: {
  verification: ShelterVerification;
  reason: ApplicationRejectionReason;
  moderatorId: ModeratorId;
  now: Date;
}): ApplicationDecision {
  const { verification, reason, moderatorId, now } = input;
  if (verification.status !== "application") {
    return { kind: "already_decided", status: verification.status };
  }
  return planOf(verification, { type: "reject", at: now, moderatorId, reason }, null);
}
