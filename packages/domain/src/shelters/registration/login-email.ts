import type { ModeratorId, ShelterAdminId } from "../../primitives/ids";
import type { ShelterHistoryEntry } from "../history";
import type { VerificationStatus } from "../verification/state";
import type { RegistrationSource } from "./lifecycle";

/**
 * Who changes an unconfirmed registrant's login address (owner, 2026-11-25): the registrant with
 * the current password, or the operator with a reason (the next PR). The password is checked by
 * the app and never stored.
 */
export type LoginEmailChangeActor =
  | { kind: "self"; shelterAdminId: ShelterAdminId; password: string }
  /** The reason is 1-500 characters, trimmed; operator-only, like the history line's. */
  | { kind: "operator"; moderatorId: ModeratorId; reason: string };

/** The actor once the app has checked the password: the decision never sees the password itself. */
export type LoginEmailChangeActorChecked =
  | { kind: "self"; shelterAdminId: ShelterAdminId; passwordCheck: "matches" | "wrong" }
  | { kind: "operator"; moderatorId: ModeratorId; reason: string };

/** The account and its shelter as the change reads them. */
export type LoginEmailSubject = {
  email: string;
  emailVerified: boolean;
  status: VerificationStatus;
  source: RegistrationSource;
};

export type LoginEmailChangeDecision =
  | {
      kind: "change";
      from: string;
      to: string;
      entry: Extract<ShelterHistoryEntry, { kind: "login_email_changed" }>;
    }
  /** Verified, no longer an application, or not self-registered (D4). */
  | { kind: "not_needed" }
  | { kind: "same_email" }
  | { kind: "wrong_password" };

const normalized = (address: string): string => address.trim().toLowerCase();

/**
 * Whether the login address may change, and the history line if so. Only while the self-registered
 * application waits with the address unconfirmed (D4); the password before anything that would tell
 * the caller about the address. The line carries no address (D6).
 */
export function loginEmailChangeDecisionOf(
  subject: LoginEmailSubject,
  to: string,
  actor: LoginEmailChangeActorChecked,
  now: Date,
): LoginEmailChangeDecision {
  if (
    subject.emailVerified ||
    subject.status !== "application" ||
    subject.source !== "self_registration"
  ) {
    return { kind: "not_needed" };
  }
  if (actor.kind === "self" && actor.passwordCheck === "wrong") return { kind: "wrong_password" };
  const next = normalized(to);
  if (next === normalized(subject.email)) return { kind: "same_email" };
  return {
    kind: "change",
    from: subject.email,
    to: next,
    entry: {
      kind: "login_email_changed",
      at: now,
      by:
        actor.kind === "self"
          ? { kind: "self", shelterAdminId: actor.shelterAdminId }
          : { kind: "operator", moderatorId: actor.moderatorId, reason: actor.reason.trim() },
    },
  };
}

const HIDDEN = "•••";

/**
 * `u•••9@gmail.com`: the one mask for an address anywhere on the site (D5), in logs, on pages and
 * in the old-address notice. Enough to recognise, not enough to copy; a `+tag` never shows.
 */
export function maskEmailAddress(address: string): string {
  const at = address.lastIndexOf("@");
  if (at < 0) return HIDDEN;
  const [local = ""] = address.slice(0, at).split("+");
  const chars = Array.from(local);
  if (chars.length === 0) return HIDDEN;
  const domain = address.slice(at);
  return chars.length < 4
    ? `${chars[0]}${HIDDEN}${domain}`
    : `${chars[0]}${HIDDEN}${chars[chars.length - 1]}${domain}`;
}
