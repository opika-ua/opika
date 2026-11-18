import type { RegistrationTokenPurpose } from "@opika/db/repos";
import { applicationDeletionRepo, funnelRepo, selfRegistrationRepo } from "@opika/db/repos";
import { after } from "next/server";
import { isSelfRegistrationEnabled } from "../../features/registration/flag";
import { kabinetAuthAvailability } from "../auth-route";
import { kabinetDb } from "../kabinet-db";
import { handleRegistrationLink, registrationLinkNotFound } from "./email-link-route";
import { registrationMailOf, sendOperatorNotification } from "./registration-mail";

/** Both links' route handlers, on the served database, mail and flag. */
export function registrationLinkHandler(purpose: RegistrationTokenPurpose) {
  return async (request: Request): Promise<Response> => {
    const availability = kabinetAuthAvailability(process.env);
    const enabled = isSelfRegistrationEnabled();
    // Off, or sign-in unavailable: 404 before the database is touched.
    if (availability.kind === "unavailable" || !enabled) return registrationLinkNotFound();
    const db = kabinetDb();
    const now = new Date();
    return handleRegistrationLink(request, purpose, {
      availability,
      enabled,
      now,
      repo: selfRegistrationRepo(db),
      afterConfirm: async ({ application }) => {
        if (application === null) return;
        await funnelRepo(db).record("email_confirmed", application.shelterId, now);
        const mail = registrationMailOf(process.env, db);
        if (mail === null) return;
        // D6: hello@ hears of the application once its address is confirmed, after the answer.
        after(async () => {
          await sendOperatorNotification(mail, application);
        });
      },
      deleteApplication: (shelterId, at) =>
        applicationDeletionRepo(db).deleteApplication(shelterId, "not_me", at),
    });
  };
}
