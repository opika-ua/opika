import { z } from "zod";
import {
  type EarlyListing,
  earlyListingRemaining,
  publicListingBasisOf,
} from "../verification/early-listing";
import type { RejectionStage, ShelterVerification } from "../verification/state";

/** Who created the shelter: the operator (registry, script) or the shelter itself (2026-11-18). */
export const REGISTRATION_SOURCES = ["operator", "self_registration"] as const;
export const RegistrationSourceSchema = z.enum(REGISTRATION_SOURCES);
export type RegistrationSource = z.infer<typeof RegistrationSourceSchema>;

/** Whether the registrant confirmed the address (`auth_user.email_verified`). */
export const EMAIL_STATUSES = ["confirmed", "unconfirmed"] as const;
export const EmailStatusSchema = z.enum(EMAIL_STATUSES);
export type EmailStatus = z.infer<typeof EmailStatusSchema>;

/**
 * What a shelter's stage means for the kabinet, the operator's queue and the publish gate. Derived
 * at read from the verification state, the early-listing permission and the registrant's email,
 * never stored: the state machine stays the one source.
 */
export type ShelterLifecycle =
  | { stage: "application"; appliedAt: Date; email: EmailStatus }
  /** Public with the «на перевірці» label: an accepted application, or the operator's early listing. */
  | { stage: "listed_unverified"; since: Date; expiresAt: Date; daysLeft: number; remind: boolean }
  | { stage: "unlisted_unverified"; why: "not_allowed" | "expired" }
  | { stage: "verified" }
  | { stage: "paused" }
  | { stage: "suspended" }
  | { stage: "rejected"; refused: RejectionStage };

export type ShelterStage = ShelterLifecycle["stage"];

export function lifecycleOf(
  verification: ShelterVerification,
  early: EarlyListing,
  email: EmailStatus,
  now: Date,
): ShelterLifecycle {
  switch (verification.status) {
    case "application":
      return { stage: "application", appliedAt: verification.appliedAt, email };
    case "pending":
    case "under_review": {
      const basis = publicListingBasisOf(verification, early, now);
      const remaining = earlyListingRemaining(verification, early, now);
      if (basis.kind === "listed_before_verification" && remaining.kind === "running") {
        return {
          stage: "listed_unverified",
          since: basis.since,
          expiresAt: basis.expiresAt,
          daysLeft: remaining.daysLeft,
          remind: remaining.remind,
        };
      }
      return {
        stage: "unlisted_unverified",
        why: basis.kind === "not_listed" && basis.why === "expired" ? "expired" : "not_allowed",
      };
    }
    case "verified":
      return { stage: "verified" };
    case "paused":
      return { stage: "paused" };
    case "suspended":
      return { stage: "suspended" };
    case "rejected":
      return { stage: "rejected", refused: verification.stage };
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled variant; unreachable at runtime */
    default: {
      const unreachable: never = verification;
      return unreachable;
    }
  }
}

/**
 * An application, or a refused one, is decided in the operator's queue only: its writes keep
 * `applied_at` and `application_rejected_at` in step (the clean-up clock), which the general
 * verification moves (S4, the shelter's «Попросити перевірку») know nothing of.
 */
export const isDecidedInQueue = (verification: ShelterVerification): boolean =>
  verification.status === "application" ||
  (verification.status === "rejected" && verification.stage === "application");

/** Only an application is held back (D2, D5); every other stage keeps today's rules. */
export type ShelterGate = { kind: "open" } | { kind: "blocked"; why: "application" };

const gateOf = (lifecycle: ShelterLifecycle): ShelterGate =>
  lifecycle.stage === "application" ? { kind: "blocked", why: "application" } : { kind: "open" };

/** Publishing an animal: nothing goes public before the operator approves (D2). */
export const publishGateOf = gateOf;

/** Proposing a donation link: none may be pending before approval (§5). */
export const donationProposalGateOf = gateOf;

/** Drafts an application may hold, so an unapproved account can't fill storage (D5). */
export const APPLICATION_DRAFT_CAP = 30;

export type DraftCap = { kind: "uncapped" } | { kind: "capped"; max: number };

export const draftCapOf = (lifecycle: ShelterLifecycle): DraftCap =>
  lifecycle.stage === "application"
    ? { kind: "capped", max: APPLICATION_DRAFT_CAP }
    : { kind: "uncapped" };

export type DraftCapCheck = { kind: "ok" } | { kind: "cap_reached"; max: number };

/** `drafts` is the shelter's current draft count, before the one being added. */
export const checkDraftCap = (cap: DraftCap, drafts: number): DraftCapCheck =>
  cap.kind === "capped" && drafts >= cap.max
    ? { kind: "cap_reached", max: cap.max }
    : { kind: "ok" };
