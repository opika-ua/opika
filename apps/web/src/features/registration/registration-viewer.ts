import type { Database } from "@opika/db";
import { kabinetActorRepo, type UserRole } from "@opika/db/repos";
import { maskEmailAddress } from "@opika/domain";
import { headers } from "next/headers";
import type { KabinetAuth } from "../../kabinet/auth";
import { kabinetAuthAvailability } from "../../kabinet/auth-route";
import { withQueryErrorsCleaned } from "../../kabinet/clean-query-errors";
import { kabinetDb } from "../../kabinet/kabinet-db";
import { kabinetSessionUserOf } from "../../kabinet/principal";
import { kabinetAuth } from "../../kabinet/runtime";

/** Who sees /prytulkam's card (scenarios A1–A4): the form, «already signed in», or the operator's. */
export type RegistrationViewer =
  | { kind: "anonymous" }
  | { kind: "shelter"; maskedEmail: string }
  | { kind: "operator" };

/**
 * A shelter admin and the operator never get the form; nobody else is stopped. A support view
 * belongs to a super_admin, so the role alone says "operator": no support-mode lookup.
 */
export function registrationViewerFrom(role: UserRole, email: string | null): RegistrationViewer {
  switch (role.kind) {
    case "super_admin":
      return { kind: "operator" };
    case "shelter_admin":
      return { kind: "shelter", maskedEmail: email === null ? "•••" : maskEmailAddress(email) };
    case "no_role":
    case "conflicting_roles":
      return { kind: "anonymous" };
  }
}

export type RegistrationViewerDeps = {
  available: () => boolean;
  auth: () => KabinetAuth;
  db: () => Database;
  headers: () => Promise<Headers>;
  now: () => Date;
  roleOf: (db: Database, userId: string) => Promise<UserRole>;
  logError: (errorClass: string) => void;
};

const DEFAULT_DEPS: RegistrationViewerDeps = {
  available: () => kabinetAuthAvailability(process.env).kind === "available",
  auth: kabinetAuth,
  db: kabinetDb,
  headers: async () => new Headers(await headers()),
  now: () => new Date(),
  roleOf: (db, userId) => kabinetActorRepo(withQueryErrorsCleaned(db)).roleOf(userId),
  logError: (errorClass) => {
    // biome-ignore lint/suspicious/noConsole: a failed read must reach the error log
    console.error(`prytulkam viewer read failed: ${errorClass}`);
  },
};

/**
 * Only with the session cookie present, so an anonymous visit makes no auth read. One session read
 * without refresh, then the role: no write of any kind, so a public page view keeps no session or
 * support view alive (PW1-Q2). A failed read shows the form rather than a 500.
 */
export async function registrationViewerOf(
  sessionCookie: boolean,
  deps: RegistrationViewerDeps = DEFAULT_DEPS,
): Promise<RegistrationViewer> {
  if (!sessionCookie || !deps.available()) return { kind: "anonymous" };
  try {
    const db = deps.db();
    const user = await kabinetSessionUserOf(deps.auth(), db, await deps.headers(), deps.now());
    if (user === null) return { kind: "anonymous" };
    return registrationViewerFrom(await deps.roleOf(db, user.userId), user.person.email);
  } catch (error) {
    // The class only: a query error's text can carry a session token.
    deps.logError(error instanceof Error ? error.constructor.name : typeof error);
    return { kind: "anonymous" };
  }
}
