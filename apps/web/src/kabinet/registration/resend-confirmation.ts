import type { RegistrantApplication, RegistrationTokenPair } from "@opika/db/repos";
import type { ShelterId } from "@opika/domain";
import { REGISTRATION_LINK_TTL_MS } from "../../features/registration/register";
import type { TransactionalSendResult } from "../registration-email";

/** «Надіслати ще раз» in the «Підтвердіть email» banner. */
export type ResendResult =
  | { kind: "sent" }
  | { kind: "rate_limited" }
  /** Nothing to confirm: already confirmed, decided, not self-registered, or not signed in. */
  | { kind: "not_needed" }
  | { kind: "failed" };

export type ResendDeps = {
  enabled: boolean;
  /** The signed-in shelter admin, or null. */
  userId: string | null;
  now: Date;
  /** Per user; a refused check sends nothing. */
  allow: (userId: string) => Promise<boolean>;
  repo: {
    applicationOf: (userId: string) => Promise<RegistrantApplication | null>;
    issueTokens: (userId: string, tokens: RegistrationTokenPair) => Promise<void>;
  };
  newToken: () => string;
  hashToken: (token: string) => string;
  send: (input: {
    userId: string;
    shelterId: ShelterId;
    name: string;
    email: string;
    confirmToken: string;
    notMeToken: string;
  }) => Promise<TransactionalSendResult>;
};

/**
 * A fresh pair of links and the confirmation email again, for the registrant whose address is
 * still unconfirmed while the application waits. The earlier links stay good until they expire.
 */
export async function resendConfirmationWith(deps: ResendDeps): Promise<ResendResult> {
  if (!deps.enabled || deps.userId === null) return { kind: "not_needed" };
  const application = await deps.repo.applicationOf(deps.userId);
  if (application === null || application.emailVerified || application.status !== "application") {
    return { kind: "not_needed" };
  }
  if (!(await deps.allow(application.userId))) return { kind: "rate_limited" };
  const confirmToken = deps.newToken();
  const notMeToken = deps.newToken();
  const expiresAt = new Date(deps.now.getTime() + REGISTRATION_LINK_TTL_MS);
  await deps.repo.issueTokens(application.userId, [
    { tokenHash: deps.hashToken(confirmToken), purpose: "confirm_email", expiresAt },
    { tokenHash: deps.hashToken(notMeToken), purpose: "not_me", expiresAt },
  ]);
  const sent = await deps.send({
    userId: application.userId,
    shelterId: application.shelterId,
    name: application.displayName,
    email: application.email,
    confirmToken,
    notMeToken,
  });
  // A duplicate is the same minute's click again: that email is on its way.
  return sent === "failed" ? { kind: "failed" } : { kind: "sent" };
}
