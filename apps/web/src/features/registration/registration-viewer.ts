import { headers } from "next/headers";
import type { KabinetPrincipal } from "../../kabinet/actor";
import { kabinetAuthAvailability } from "../../kabinet/auth-route";
import { maskAddress } from "../../kabinet/email-senders";
import { kabinetDb } from "../../kabinet/kabinet-db";
import { kabinetIdentityOf, kabinetSessionPersonOf } from "../../kabinet/principal";
import { kabinetAuth } from "../../kabinet/runtime";

/** Who sees /prytulkam's card (scenarios A1–A4): the form, «already signed in», or the operator's. */
export type RegistrationViewer =
  | { kind: "anonymous" }
  | { kind: "shelter"; maskedEmail: string }
  | { kind: "operator" };

/** A signed-in shelter admin, the operator and a support view never get the form; nobody else is stopped. */
export function registrationViewerFrom(
  principal: KabinetPrincipal,
  email: string | null,
): RegistrationViewer {
  switch (principal.kind) {
    case "super_admin":
    case "support_view":
      return { kind: "operator" };
    case "shelter_admin":
      return { kind: "shelter", maskedEmail: email === null ? "•••" : maskAddress(email) };
    case "anonymous":
    case "no_role":
    case "conflicting_roles":
      return { kind: "anonymous" };
  }
}

/**
 * Only with the session cookie present, so an anonymous visit stays free of auth reads. Read
 * without refreshing the session: a public page view is not a kabinet visit (PW1-Q2).
 */
export async function registrationViewerOf(sessionCookie: boolean): Promise<RegistrationViewer> {
  if (!sessionCookie || kabinetAuthAvailability(process.env).kind === "unavailable") {
    return { kind: "anonymous" };
  }
  const auth = kabinetAuth();
  const db = kabinetDb();
  const requestHeaders = new Headers(await headers());
  const now = new Date();
  const production = process.env.NODE_ENV === "production";
  const [identity, person] = await Promise.all([
    kabinetIdentityOf(auth, db, requestHeaders, now, production, { refresh: false }),
    kabinetSessionPersonOf(auth, db, requestHeaders, now),
  ]);
  return registrationViewerFrom(identity.principal, person?.email ?? null);
}
