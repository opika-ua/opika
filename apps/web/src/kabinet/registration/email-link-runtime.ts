import type { RegistrationTokenPurpose } from "@opika/db/repos";
import { applicationDeletionRepo, funnelRepo, selfRegistrationRepo } from "@opika/db/repos";
import { isSelfRegistrationEnabled } from "../../features/registration/flag";
import { kabinetAuthAvailability } from "../auth-route";
import { kabinetDb } from "../kabinet-db";
import { type RegistrationLinkOutcome, registrationLinkOutcome } from "./email-link-route";
import { REGISTRATION_LINK_PATHS } from "./registration-links";
import { sendOperatorNotification, servedTransactionalMail } from "./registration-mail";

/** Both links' decisions, on the served database, mail and flag. */
export async function servedRegistrationLinkOutcome(
  purpose: RegistrationTokenPurpose,
  request:
    | { method: "GET"; token: string }
    | { method: "POST"; origin: string | null; form: FormData },
): Promise<RegistrationLinkOutcome> {
  const availability = kabinetAuthAvailability(process.env);
  const enabled = isSelfRegistrationEnabled();
  // Off, or sign-in unavailable: 404 before the database is touched.
  if (availability.kind === "unavailable" || !enabled) return { kind: "not_found" };
  // The page and its action hand over what a route handler's Request carried, so the one decision
  // function (and its tests) serves both.
  const url = new URL(REGISTRATION_LINK_PATHS[purpose], availability.baseURL);
  let asRequest: Request;
  if (request.method === "GET") {
    url.searchParams.set("token", request.token);
    asRequest = new Request(url);
  } else {
    const headers = new Headers();
    if (request.origin !== null) headers.set("origin", request.origin);
    asRequest = new Request(url, { method: "POST", headers, body: request.form });
  }
  const db = kabinetDb();
  const now = new Date();
  return registrationLinkOutcome(asRequest, purpose, {
    availability,
    enabled,
    now,
    repo: selfRegistrationRepo(db),
    newId: () => crypto.randomUUID(),
    afterConfirm: async ({ application }) => {
      if (application === null) return;
      await funnelRepo(db).record("email_confirmed", application.shelterId, now);
      const transactional = servedTransactionalMail(process.env, db);
      if (transactional === null) return;
      // D6: the operator hears of the application once its address is confirmed, after the answer.
      transactional.schedule(async () => {
        await sendOperatorNotification(transactional.mail, application);
      });
    },
    deleteApplication: (shelterId, at) =>
      applicationDeletionRepo(db).deleteApplication(shelterId, "not_me", at),
  });
}
