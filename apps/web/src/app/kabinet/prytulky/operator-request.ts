import { headers } from "next/headers";
import { cache } from "react";
import { getDb } from "../../../api/db";
import { requireEnv } from "../../../api/env";
import type { OperatorPageDeps } from "../../../features/kabinet/operator/pages";
import { SHELTER_WRITE_POLICY } from "../../../kabinet/access";
import type { KabinetPrincipal } from "../../../kabinet/actor";
import {
  type OperatorName,
  operatorNameOf,
  standaloneOperatorName,
} from "../../../kabinet/operator";
import { kabinetIdentityOf } from "../../../kabinet/principal";
import { operatorPagesOrNotFound } from "../available-auth";

export type OperatorRequest = {
  principal: KabinetPrincipal;
  deps: OperatorPageDeps;
  /** `KABINET_OPERATOR_DISPLAY_NAME`, or none configured (RS-Q2): the header's name. */
  operator: OperatorName;
};

/**
 * Who is asking, and the served route's own values for the reads (R-UI 1).
 * Each operator page calls this first, and it answers the page's 404 itself
 * before auth or the database is touched (sign-in unavailable, or no
 * location key, RU-T5): the segment's layout can't stop a page (review of
 * #93). Cached per request, so a page and its metadata resolve the session
 * once.
 *
 * Access itself is not decided here: the registry router decides it on the
 * page's read (`features/kabinet/operator/pages.ts`), never a check of the
 * principal of this file's own.
 */
export const operatorRequest = cache(async (): Promise<OperatorRequest> => {
  const { auth, availability } = operatorPagesOrNotFound();
  const now = new Date();
  const production = process.env.NODE_ENV === "production";
  const db = getDb();
  const identity = await kabinetIdentityOf(auth, db, new Headers(await headers()), now, production);
  const operator = operatorNameOf({
    KABINET_OPERATOR_DISPLAY_NAME: process.env.KABINET_OPERATOR_DISPLAY_NAME,
  });
  return {
    principal: identity.principal,
    operator,
    deps: {
      db,
      now,
      newId: () => crypto.randomUUID(),
      invites: availability.invites,
      linkBaseURL: availability.baseURL,
      // The served route's own policy. The registry ignores it.
      shelterWrites: SHELTER_WRITE_POLICY,
      cursorSecret: requireEnv("CURSOR_HMAC_SECRET"),
      operatorDisplayName: standaloneOperatorName(operator),
      production,
    },
  };
});
