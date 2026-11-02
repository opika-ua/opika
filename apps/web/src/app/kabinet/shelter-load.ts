import { kabinetActorRepo } from "@opika/db/repos";
import { headers } from "next/headers";
import { cache } from "react";
import { requireEnv } from "../../api/env";
import { type KabinetHome, kabinetHomeOf } from "../../features/kabinet/home";
import type { PasswordState } from "../../features/kabinet/password/ChangePasswordSection";
import { SHELTER_WRITE_POLICY } from "../../kabinet/access";
import { invitationAccepter, selfHealingIdentity } from "../../kabinet/invitation-accept";
import { kabinetDb } from "../../kabinet/kabinet-db";
import { type OperatorName, operatorNameOf, standaloneOperatorName } from "../../kabinet/operator";
import { kabinetIdentityOf } from "../../kabinet/principal";
import { kabinetAuthOrNotFound, kabinetAvailabilityOrNotFound } from "./available-auth";

export type Loaded =
  | { kind: "join_failed" }
  | { kind: "ready"; home: KabinetHome; operator: OperatorName; password: PasswordState | null };

/**
 * Притулок (kabinet redesign Phase 2 PR 1, moved off `SHELTER_HOME`, renamed
 * from «Профіль притулку» - `KabinetNav`, `routes.ts`'s `SHELTER_PROFILE_PATH`).
 * K4's screen itself (`ShelterProfile`) and its loader (`kabinetHomeOf`) are
 * unchanged; only the route and this page's title are new. Головна
 * (`app/kabinet/page.tsx`) now owns `SHELTER_HOME` and the rejected/pending
 * notice this page used to show above its editor.
 *
 * One resolve + one `kabinetHomeOf` read per request, shared by the title and
 * the page (`cache`, the same pattern K3's edit page uses for its own title).
 */
export const loadShelterPage = cache(async (): Promise<Loaded> => {
  const auth = kabinetAuthOrNotFound();
  const { invites, baseURL } = kabinetAvailabilityOrNotFound();
  const now = new Date();
  const production = process.env.NODE_ENV === "production";
  const db = kabinetDb();
  const requestHeaders = new Headers(await headers());
  const resolve = () => kabinetIdentityOf(auth, db, requestHeaders, now, production);
  const healed = await selfHealingIdentity(await resolve(), {
    accept: invitationAccepter(db, () => now),
    resolve,
  });
  if (healed.kind === "join_failed") return { kind: "join_failed" };
  const operator = operatorNameOf({
    KABINET_OPERATOR_DISPLAY_NAME: process.env.KABINET_OPERATOR_DISPLAY_NAME,
  });
  const home = await kabinetHomeOf(healed.identity.principal, {
    db,
    now,
    newId: () => crypto.randomUUID(),
    invites,
    linkBaseURL: baseURL,
    // The served route's own policy, so the editor shows exactly when the
    // API would accept its writes.
    shelterWrites: SHELTER_WRITE_POLICY,
    cursorSecret: requireEnv("CURSOR_HMAC_SECRET"),
    operatorDisplayName: standaloneOperatorName(operator),
  });
  // PW-1: «Змінити пароль» for the shelter's own admin, never a support view
  // (the operator's session): whether a password exists decides the form or
  // the note.
  const userId = healed.identity.userId;
  const password =
    home.kind === "shelter" && home.viewer === "admin" && userId !== null
      ? ({ kind: (await kabinetActorRepo(db).hasPassword(userId)) ? "set" : "not_set" } as const)
      : null;
  return { kind: "ready", home, operator, password };
});
