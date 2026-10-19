import { headers } from "next/headers";
import { getDb } from "../../../api/db";
import { requireEnv } from "../../../api/env";
import {
  type KabinetAnimalListPage,
  kabinetAnimalListPageOf,
} from "../../../features/kabinet/animal-list/animal-list-page";
import {
  type AnimalPageTarget,
  type KabinetAnimalPage,
  kabinetAnimalPageOf,
} from "../../../features/kabinet/animal-page";
import type { KabinetHomeDeps } from "../../../features/kabinet/home";
import { SHELTER_WRITE_POLICY } from "../../../kabinet/access";
import { operatorDisplayName } from "../../../kabinet/operator";
import { kabinetIdentityOf } from "../../../kabinet/principal";
import { kabinetAuthOrNotFound, kabinetAvailabilityOrNotFound } from "../available-auth";

/**
 * The request side of K2's and K3's pages: each answers its own 404 while
 * sign-in is unavailable, before touching auth or the database (the layout's
 * 404 can't stop a page, `available-auth.ts`), then resolves who is asking
 * and hands the decision to the page's own function, with the served route's
 * write policy, as `/kabinet` does.
 */
async function requestOf(): Promise<{
  principal: Awaited<ReturnType<typeof kabinetIdentityOf>>["principal"];
  deps: KabinetHomeDeps;
}> {
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
  return {
    principal: identity.principal,
    deps: {
      db,
      now,
      newId: () => crypto.randomUUID(),
      invites,
      linkBaseURL: baseURL,
      shelterWrites: SHELTER_WRITE_POLICY,
      cursorSecret: requireEnv("CURSOR_HMAC_SECRET"),
      operatorDisplayName: operatorDisplayName({
        KABINET_OPERATOR_DISPLAY_NAME: process.env.KABINET_OPERATOR_DISPLAY_NAME,
      }),
    },
  };
}

/** K3's two pages. */
export async function loadKabinetAnimalPage(target: AnimalPageTarget): Promise<KabinetAnimalPage> {
  const { principal, deps } = await requestOf();
  return kabinetAnimalPageOf(principal, target, deps);
}

/** K2's list. */
export async function loadKabinetAnimalListPage(): Promise<KabinetAnimalListPage> {
  const { principal, deps } = await requestOf();
  return kabinetAnimalListPageOf(principal, deps);
}
