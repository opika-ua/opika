import { LoginEmailChangeInputSchema, type LoginEmailChangeResult } from "@opika/contracts";
import type {
  LoginEmailChangeOutcome,
  LoginEmailChangeWrite,
  RegistrantApplication,
} from "@opika/db/repos";
import {
  loginEmailChangeDecisionOf,
  maskEmailAddress,
  type ShelterAdminId,
  type ShelterId,
} from "@opika/domain";
import type { Allowance } from "../../features/registration/limits";
import { REGISTRATION_LINK_TTL_MS } from "../../features/registration/register";
import type { TransactionalSendResult } from "../registration-email";
import { emailChangeConfirmationDedupKey, loginEmailChangedDedupKey } from "./registration-mail";

export type ChangeLoginEmailDeps = {
  /** The signed-in shelter admin and the session that asked; null for a support view or none. */
  caller: { userId: string; sessionId: string } | null;
  now: Date;
  /** Per user, the budget «Надіслати ще раз» spends too (D7). */
  allowUser: (userId: string) => Promise<Allowance>;
  /** Registration's per-address budget, on the new address. */
  allowAddress: (email: string) => Promise<Allowance>;
  /** One of the day's confirmation emails; false at the cap. */
  takeDailyMail: () => Promise<boolean>;
  verifyPassword: (hash: string, password: string) => Promise<boolean>;
  repo: {
    applicationOf: (userId: string) => Promise<RegistrantApplication | null>;
    credentialHashOf: (userId: string) => Promise<string | null>;
    hasAccount: (email: string) => Promise<boolean>;
    changeLoginEmail: (input: LoginEmailChangeWrite) => Promise<LoginEmailChangeOutcome>;
  };
  newId: () => string;
  newToken: () => string;
  hashToken: (token: string) => string;
  sendConfirmation: (
    input: {
      userId: string;
      shelterId: ShelterId;
      name: string;
      email: string;
      confirmToken: string;
      notMeToken: string;
    },
    dedupKey: string,
  ) => Promise<TransactionalSendResult>;
  sendNotice: (
    input: {
      userId: string;
      shelterId: ShelterId;
      shelterName: string;
      to: string;
      maskedEmail: string;
    },
    dedupKey: string,
  ) => Promise<TransactionalSendResult>;
  /** Runs the old-address notice after the answer (`after()` when served). */
  schedule: (work: () => Promise<void>) => void;
  /** A reason code only, never a field value. */
  log: (reason: string) => void;
};

const refusedBy = (
  allowance: Exclude<Allowance, { kind: "ok" }>,
): Extract<LoginEmailChangeResult, { kind: "rate_limited" | "limiter_unavailable" }> =>
  allowance.kind === "limited"
    ? { kind: "rate_limited", retryAfterSeconds: allowance.retryAfterSeconds }
    : { kind: "limiter_unavailable" };

/**
 * «Змінити пошту» in the «Підтвердіть email» banner (owner, 2026-11-25; proposal §4): the
 * registrant's own unconfirmed address, behind the password. The write is one transaction; the
 * new address's confirmation is awaited, the old address's notice runs after the answer.
 */
export async function changeLoginEmailWith(
  deps: ChangeLoginEmailDeps,
  raw: { email: unknown; password: unknown },
): Promise<LoginEmailChangeResult> {
  if (deps.caller === null) return { kind: "not_needed" };
  const { userId, sessionId } = deps.caller;
  const application = await deps.repo.applicationOf(userId);
  if (application === null || application.emailVerified || application.status !== "application") {
    return { kind: "not_needed" };
  }

  // Charged before the password is checked, so the budget caps guessing too.
  const perUser = await deps.allowUser(userId);
  if (perUser.kind !== "ok") {
    deps.log(perUser.kind === "limited" ? "rate_limited" : "limiter_unavailable");
    return refusedBy(perUser);
  }

  const email = typeof raw.email === "string" ? raw.email : "";
  const password = typeof raw.password === "string" ? raw.password : "";
  const parsed = LoginEmailChangeInputSchema.safeParse({ email, password });
  if (!parsed.success) {
    const fields: Extract<LoginEmailChangeResult, { kind: "invalid" }>["fields"] = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (field === "email") fields.email = email.trim() === "" ? "required" : "email";
      if (field === "password") fields.password = "required";
    }
    deps.log("invalid");
    return { kind: "invalid", fields };
  }

  const hash = await deps.repo.credentialHashOf(userId);
  const matches = hash !== null && (await deps.verifyPassword(hash, parsed.data.password));
  const decision = loginEmailChangeDecisionOf(
    {
      email: application.email,
      emailVerified: application.emailVerified,
      status: application.status,
      // `applicationOf` finds only a shelter the user registered.
      source: "self_registration",
    },
    parsed.data.email,
    {
      kind: "self",
      shelterAdminId: userId as ShelterAdminId,
      passwordCheck: matches ? "matches" : "wrong",
    },
    deps.now,
  );
  switch (decision.kind) {
    case "not_needed":
      return { kind: "not_needed" };
    case "wrong_password":
      deps.log("wrong_password");
      return { kind: "wrong_password" };
    case "same_email":
      deps.log("invalid");
      return { kind: "invalid", fields: { email: "same_email" } };
    case "change":
      break;
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled variant; unreachable at runtime */
    default: {
      const unreachable: never = decision;
      return unreachable;
    }
  }

  const perAddress = await deps.allowAddress(decision.to);
  if (perAddress.kind !== "ok") {
    deps.log(perAddress.kind === "limited" ? "rate_limited" : "limiter_unavailable");
    return refusedBy(perAddress);
  }
  // Registration's answer for a taken address, checked before the cap as registration does (§6).
  if (await deps.repo.hasAccount(decision.to)) {
    deps.log("email_taken");
    return { kind: "email_taken" };
  }
  if (!(await deps.takeDailyMail())) {
    deps.log("daily_cap");
    return { kind: "daily_cap" };
  }

  const historyId = deps.newId();
  const confirmToken = deps.newToken();
  const notMeToken = deps.newToken();
  const expiresAt = new Date(deps.now.getTime() + REGISTRATION_LINK_TTL_MS);
  let outcome: LoginEmailChangeOutcome;
  try {
    outcome = await deps.repo.changeLoginEmail({
      userId,
      from: decision.from,
      to: decision.to,
      // `matches` held, so the hash is not null here.
      passwordHash: hash,
      keepSessionId: sessionId,
      history: { id: historyId, entry: decision.entry },
      tokens: [
        { tokenHash: deps.hashToken(confirmToken), purpose: "confirm_email", expiresAt },
        { tokenHash: deps.hashToken(notMeToken), purpose: "not_me", expiresAt },
      ],
      now: deps.now,
    });
  } catch {
    deps.log("write_failed");
    return { kind: "failed" };
  }
  if (outcome.kind !== "changed") {
    deps.log(outcome.kind);
    return { kind: outcome.kind };
  }

  const confirmation = await deps
    .sendConfirmation(
      {
        userId,
        shelterId: application.shelterId,
        name: application.displayName,
        email: decision.to,
        confirmToken,
        notMeToken,
      },
      emailChangeConfirmationDedupKey(userId, historyId),
    )
    .catch((): TransactionalSendResult => "failed");
  deps.schedule(async () => {
    await deps
      .sendNotice(
        {
          userId,
          shelterId: application.shelterId,
          shelterName: application.displayName,
          to: decision.from,
          maskedEmail: maskEmailAddress(decision.to),
        },
        loginEmailChangedDedupKey(historyId),
      )
      .catch(() => undefined);
  });
  return {
    kind: "changed",
    email: decision.to,
    confirmation: confirmation === "failed" ? "failed" : "sent",
  };
}
