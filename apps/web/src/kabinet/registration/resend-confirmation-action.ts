"use server";

import { selfRegistrationRepo } from "@opika/db/repos";
import { headers } from "next/headers";
import { isSelfRegistrationEnabled } from "../../features/registration/flag";
import { registrationLimiters } from "../../features/registration/limits";
import { kabinetAuthAvailability } from "../auth-route";
import { kabinetDb } from "../kabinet-db";
import { kabinetIdentityOf } from "../principal";
import { kabinetAuth } from "../runtime";
import { hashRegistrationToken, newRegistrationToken } from "./registration-links";
import {
  confirmationDedupKey,
  registrationMailOf,
  sendConfirmationEmail,
} from "./registration-mail";
import { type ResendResult, resendConfirmationWith } from "./resend-confirmation";

/** The banner button's action: the signed-in registrant's confirmation email, again. */
export async function resendConfirmationEmail(): Promise<ResendResult> {
  const availability = kabinetAuthAvailability(process.env);
  if (availability.kind === "unavailable" || !isSelfRegistrationEnabled()) {
    return { kind: "not_needed" };
  }
  const now = new Date();
  const db = kabinetDb();
  const identity = await kabinetIdentityOf(
    kabinetAuth(),
    db,
    new Headers(await headers()),
    now,
    process.env.NODE_ENV === "production",
  );
  const mail = registrationMailOf(process.env, db);
  if (mail === null) return { kind: "failed" };
  return resendConfirmationWith({
    enabled: true,
    // Only the shelter's own admin; a support view is the operator and never resends.
    userId: identity.principal.kind === "shelter_admin" ? identity.userId : null,
    now,
    allow: (userId) =>
      registrationLimiters.resendPerUser.check(`registration-resend:${userId}`, now),
    repo: selfRegistrationRepo(db),
    newToken: newRegistrationToken,
    hashToken: hashRegistrationToken,
    send: (input) => sendConfirmationEmail(mail, input, confirmationDedupKey(input.userId, now)),
  });
}
