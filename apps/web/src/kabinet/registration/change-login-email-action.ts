"use server";

import type { LoginEmailChangeResult } from "@opika/contracts";
import { selfRegistrationRepo } from "@opika/db/repos";
import { headers } from "next/headers";
import { addressRateLimitKey } from "../../api/rate-limit-key";
import { isSelfRegistrationEnabled } from "../../features/registration/flag";
import { allowanceOf, registrationLimiters } from "../../features/registration/limits";
import { kabinetAuthAvailability } from "../auth-route";
import { kabinetDb } from "../kabinet-db";
import { kabinetIdentityOf, kabinetSessionIdsOf } from "../principal";
import { kabinetAuth } from "../runtime";
import { changeLoginEmailWith } from "./change-login-email";
import { hashRegistrationToken, newRegistrationToken } from "./registration-links";
import {
  sendConfirmationEmail,
  sendLoginEmailChangedNotice,
  servedTransactionalMail,
  takeDailyConfirmationMail,
} from "./registration-mail";

const log = (reason: string): void => {
  // biome-ignore lint/suspicious/noConsole: a reason code is the only trace of a refused change
  console.warn(`[registration] login email change refused: ${reason}`);
};

/** «Змінити й надіслати лист»: the signed-in registrant's new login address. */
export async function changeLoginEmail(input: {
  email: unknown;
  password: unknown;
}): Promise<LoginEmailChangeResult> {
  const availability = kabinetAuthAvailability(process.env);
  if (availability.kind === "unavailable" || !isSelfRegistrationEnabled()) {
    return { kind: "not_needed" };
  }
  const now = new Date();
  const db = kabinetDb();
  const auth = kabinetAuth();
  const requestHeaders = new Headers(await headers());
  const identity = await kabinetIdentityOf(
    auth,
    db,
    requestHeaders,
    now,
    process.env.NODE_ENV === "production",
  );
  // Only the shelter's own admin; a support view is the operator and never changes it here.
  const session =
    identity.principal.kind === "shelter_admin"
      ? await kabinetSessionIdsOf(auth, db, requestHeaders, now)
      : null;
  const caller = session !== null && session.userId === identity.userId ? session : null;
  const transactional = servedTransactionalMail(process.env, db);
  if (transactional === null) return { kind: "failed" };
  const { mail, schedule } = transactional;
  const { resendPerUserHour, resendPerUserDay, perAddress, mailDailyCap } = registrationLimiters;
  const repo = selfRegistrationRepo(db);
  return changeLoginEmailWith(
    {
      caller,
      now,
      // The resend's own key: one budget for both (D7).
      allowUser: (userId) =>
        allowanceOf([resendPerUserHour, resendPerUserDay], `registration-resend:${userId}`, now),
      allowAddress: (email) => allowanceOf([perAddress], addressRateLimitKey(email), now),
      takeDailyMail: () => takeDailyConfirmationMail(mailDailyCap, mail, now, schedule),
      verifyPassword: async (hash, password) =>
        (await auth.$context).password.verify({ hash, password }),
      repo,
      newId: () => crypto.randomUUID(),
      newToken: newRegistrationToken,
      hashToken: hashRegistrationToken,
      sendConfirmation: (application, dedupKey) =>
        sendConfirmationEmail(mail, application, dedupKey),
      sendNotice: (notice, dedupKey) => sendLoginEmailChangedNotice(mail, notice, dedupKey),
      schedule,
      log,
    },
    input,
  );
}
