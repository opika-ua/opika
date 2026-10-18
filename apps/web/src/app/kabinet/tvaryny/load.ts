import { headers } from "next/headers";
import { getDb } from "../../../api/db";
import { requireEnv } from "../../../api/env";
import {
  type AnimalPageTarget,
  type KabinetAnimalPage,
  kabinetAnimalPageOf,
} from "../../../features/kabinet/animal-page";
import { shelterWritePolicyOf } from "../../../kabinet/access";
import { operatorDisplayName } from "../../../kabinet/operator";
import { kabinetIdentityOf } from "../../../kabinet/principal";
import { kabinetAuthOrNotFound, kabinetAvailabilityOrNotFound } from "../available-auth";

/**
 * The request side of K3's two pages: each answers its own 404 while sign-in
 * is unavailable, before touching auth or the database (the layout's 404
 * can't stop a page, `available-auth.ts`), then resolves who is asking and
 * hands the decision to `kabinetAnimalPageOf`, with the served route's own
 * write policy (K-Q17), as `/kabinet` does.
 */
export async function loadKabinetAnimalPage(target: AnimalPageTarget): Promise<KabinetAnimalPage> {
  const auth = kabinetAuthOrNotFound();
  const { invites, baseURL } = kabinetAvailabilityOrNotFound();
  const now = new Date();
  const db = getDb();
  const identity = await kabinetIdentityOf(
    auth,
    db,
    new Headers(await headers()),
    now,
    process.env.NODE_ENV === "production",
  );
  return kabinetAnimalPageOf(identity.principal, target, {
    db,
    now,
    newId: () => crypto.randomUUID(),
    invites,
    linkBaseURL: baseURL,
    shelterWrites: shelterWritePolicyOf(process.env),
    cursorSecret: requireEnv("CURSOR_HMAC_SECRET"),
    operatorDisplayName: operatorDisplayName({
      KABINET_OPERATOR_DISPLAY_NAME: process.env.KABINET_OPERATOR_DISPLAY_NAME,
    }),
  });
}
