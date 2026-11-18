"use server";

import { funnelRepo, selfRegistrationRepo } from "@opika/db/repos";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { clientIp } from "../../api/client-ip";
import { addressRateLimitKey, derivedSecretKey, ipRateLimitKey } from "../../api/rate-limit-key";
import { retryAfterSecondsOf } from "../../api/retry-after";
import { kabinetAuthAvailability } from "../../kabinet/auth-route";
import { inviteCredentialsOf } from "../../kabinet/invite-password";
import { kabinetDb } from "../../kabinet/kabinet-db";
import { shelterPasswordVerdictOf } from "../../kabinet/password-checks";
import {
  hashRegistrationToken,
  newRegistrationToken,
} from "../../kabinet/registration/registration-links";
import {
  confirmationDedupKey,
  registrationMailOf,
  sendConfirmationEmail,
} from "../../kabinet/registration/registration-mail";
import { kabinetAuth } from "../../kabinet/runtime";
import { resolveRegistrationCity, searchRegistrationCitiesIn } from "./cities";
import { isSelfRegistrationEnabled } from "./flag";
import { FORM_STAMP_KEY_LABEL, issueFormStamp } from "./form-stamp";
import type { CitySearchAnswer, RegistrationFormState } from "./form-state";
import { registrationLimiters } from "./limits";
import { nativePostRedirectOf, registerWith, typedValuesOf } from "./register";
import { parseSetCookie } from "./set-cookie";

const log = (line: string): void => {
  // biome-ignore lint/suspicious/noConsole: a reason code is the only trace of a refused registration
  console.warn(line);
};

/**
 * The registration form's server action (spec §13.1, plan Agent 1). `registerWith` decides; this
 * wires it to the request: the IP, the kabinet's Better Auth (its hasher and its sign-in), the
 * database, the budgets and the mail. Off with the flag, like everything it serves.
 */
export async function registerShelter(
  _previous: RegistrationFormState,
  form: FormData,
): Promise<RegistrationFormState> {
  const now = new Date();
  const stampKey = derivedSecretKey(FORM_STAMP_KEY_LABEL);
  const refused = (): RegistrationFormState => ({
    result: { kind: "failed" },
    values: typedValuesOf(form),
    formStamp: issueFormStamp(now, stampKey),
  });
  if (!isSelfRegistrationEnabled()) return refused();
  const availability = kabinetAuthAvailability(process.env);
  if (availability.kind === "unavailable") {
    log("[registration] refused: write_failed");
    return refused();
  }

  const requestHeaders = new Headers(await headers());
  const ip = clientIp(new Request(availability.baseURL, { headers: requestHeaders }));
  const db = kabinetDb();
  const auth = kabinetAuth();
  const credentials = inviteCredentialsOf(auth, availability.baseURL, requestHeaders);
  const mail = registrationMailOf(process.env, db);
  const limiters = registrationLimiters;

  const state = await registerWith(form, {
    now,
    stampKey,
    issueStamp: (issuedAt) => issueFormStamp(issuedAt, stampKey),
    allowIp: async () => {
      const key = ipRateLimitKey(ip);
      return (await limiters.perIp.check(key, now))
        ? { kind: "ok" }
        : { kind: "limited", retryAfterSeconds: retryAfterSecondsOf(limiters.perIp, key, now) };
    },
    allowAddress: async (email) => {
      const key = addressRateLimitKey(email);
      return (await limiters.perAddress.check(key, now))
        ? { kind: "ok" }
        : {
            kind: "limited",
            retryAfterSeconds: retryAfterSecondsOf(limiters.perAddress, key, now),
          };
    },
    resolveCity: (by) => resolveRegistrationCity(db, by),
    passwordVerdict: shelterPasswordVerdictOf,
    hashPassword: async (password) => (await auth.$context).password.hash(password),
    write: (input) => selfRegistrationRepo(db).register(input),
    newId: () => crypto.randomUUID(),
    newToken: newRegistrationToken,
    hashToken: hashRegistrationToken,
    afterRegistration: async (application) => {
      await funnelRepo(db)
        .record("registered", application.shelterId, now)
        .catch(() => log("[registration] funnel not recorded"));
      if (mail === null) return;
      // In the background: the email never holds up the way into the kabinet (D1).
      after(async () => {
        await sendConfirmationEmail(mail, application, confirmationDedupKey(application.userId));
      });
    },
    signIn: (email, password) => credentials.signIn(email, password),
    setCookies: async (setCookies) => {
      const jar = await cookies();
      for (const header of setCookies) {
        const cookie = parseSetCookie(header);
        if (cookie !== null) jar.set(cookie.name, cookie.value, cookie.options);
      }
    },
    log: (reason) => log(`[registration] refused: ${reason}`),
  });

  // Without JS the form posted natively, so this is a 303 and a new document: the full load #509
  // asks for. With JS the form gets the state and calls `window.location.assign` itself.
  const nativeExit = nativePostRedirectOf(state, form);
  if (nativeExit !== null) redirect(nativeExit);
  return state;
}

/** The city picker's search, for anyone on /prytulkam: the operator's search, budgeted per IP. */
export async function searchRegistrationCities(query: string): Promise<CitySearchAnswer> {
  if (!isSelfRegistrationEnabled() || typeof query !== "string" || query.length > 100) {
    return { kind: "failed" };
  }
  const now = new Date();
  const ip = clientIp(new Request("http://localhost/", { headers: new Headers(await headers()) }));
  if (!(await registrationLimiters.citySearchPerIp.check(ipRateLimitKey(ip), now))) {
    return { kind: "failed" };
  }
  return searchRegistrationCitiesIn(kabinetDb(), query);
}
