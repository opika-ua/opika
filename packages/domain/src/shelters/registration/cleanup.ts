import { z } from "zod";
import type { VerificationStatus } from "../verification/state";
import type { EmailStatus, RegistrationSource } from "./lifecycle";

/** An application whose email is still unconfirmed this long after registering is deleted (D8). */
export const ABANDONED_APPLICATION_DAYS = 14;

/** A refused application is deleted this long after the refusal (§14 Q4, A4, A7). */
export const REJECTED_APPLICATION_RETENTION_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The instant `appliedAt` must be at or before for an unconfirmed application to be due. */
export const abandonedApplicationCutoff = (now: Date): Date =>
  new Date(now.getTime() - ABANDONED_APPLICATION_DAYS * DAY_MS);

/** The instant `applicationRejectedAt` must be at or before for a refused application to be due. */
export const rejectedApplicationCutoff = (now: Date): Date =>
  new Date(now.getTime() - REJECTED_APPLICATION_RETENTION_DAYS * DAY_MS);

export const APPLICATION_DELETION_REASONS = ["abandoned", "rejected_expired", "not_me"] as const;
export const ApplicationDeletionReasonSchema = z.enum(APPLICATION_DELETION_REASONS);
export type ApplicationDeletionReason = z.infer<typeof ApplicationDeletionReasonSchema>;

/** The columns the daily job reads; the SQL selects on the same ones (parity test). */
export type ApplicationCleanupCandidate = {
  status: VerificationStatus;
  source: RegistrationSource;
  appliedAt: Date | null;
  email: EmailStatus;
  /** Set only when an application (not a verification) was refused. */
  applicationRejectedAt: Date | null;
};

export type CleanupVerdict =
  | { kind: "keep" }
  | { kind: "delete"; reason: Exclude<ApplicationDeletionReason, "not_me"> };

/**
 * Only a self-registered shelter is ever due, and only from the two states nothing public came
 * from: an unconfirmed application, or a refused one. Confirmed applications, accepted, verified and
 * operator-created shelters are always kept. At the boundary instant a row is already due.
 */
export function cleanupVerdictOf(
  candidate: ApplicationCleanupCandidate,
  now: Date,
): CleanupVerdict {
  if (candidate.source !== "self_registration") return { kind: "keep" };
  if (
    candidate.status === "application" &&
    candidate.email === "unconfirmed" &&
    candidate.appliedAt !== null &&
    candidate.appliedAt.getTime() <= abandonedApplicationCutoff(now).getTime()
  ) {
    return { kind: "delete", reason: "abandoned" };
  }
  if (
    candidate.status === "rejected" &&
    candidate.applicationRejectedAt !== null &&
    candidate.applicationRejectedAt.getTime() <= rejectedApplicationCutoff(now).getTime()
  ) {
    return { kind: "delete", reason: "rejected_expired" };
  }
  return { kind: "keep" };
}
