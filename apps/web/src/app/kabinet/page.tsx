import { uk } from "@opika/i18n";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { requireEnv } from "../../api/env";
import { kabinetDashboardOf } from "../../features/kabinet/dashboard";
import { JoinFailedCard } from "../../features/kabinet/JoinFailedCard";
import { KabinetBrand } from "../../features/kabinet/KabinetBrand";
import {
  ANIMAL_LIST_PATH,
  OPERATOR_HOME,
  SHELTER_PROFILE_PATH,
} from "../../features/kabinet/routes";
import { SHELTER_WRITE_POLICY } from "../../kabinet/access";
import { invitationAccepter, selfHealingIdentity } from "../../kabinet/invitation-accept";
import { kabinetDb } from "../../kabinet/kabinet-db";
import { operatorNameOf, standaloneOperatorName } from "../../kabinet/operator";
import { kabinetIdentityOf } from "../../kabinet/principal";
import { MAIN_LANDMARK } from "../../ui/landmark";
import { kabinetAuthOrNotFound, kabinetAvailabilityOrNotFound } from "./available-auth";

export const metadata: Metadata = {
  title: uk.kabinet.nav.animals,
};

/**
 * `SHELTER_HOME`, where the magic link lands (KS-T2) and where sign-in's redirect and every
 * invite and reset email link point. Since kabinet UX round 2 it renders nothing: it settles the
 * session (the automatic invitation accept runs again here, IN-Q12: if it failed on «Увійти», this
 * load is the retry), shows the join_failed card when that fails, sends the operator to their list
 * and a shelter on to Тварини. Who sees what is `kabinetDashboardOf`'s decision.
 */
export default async function KabinetHomePage() {
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
  if (healed.kind === "join_failed") {
    return (
      <div className="flex min-h-dvh flex-col">
        <header className="flex min-h-16 items-center bg-surface px-4 tablet:min-h-0 tablet:bg-transparent tablet:p-8">
          <KabinetBrand />
        </header>
        <main
          {...MAIN_LANDMARK}
          className="flex flex-1 flex-col px-4 pt-5 pb-6 tablet:items-center tablet:justify-center tablet:px-8 tablet:pt-8 tablet:pb-24"
        >
          <JoinFailedCard />
        </main>
      </div>
    );
  }
  const operator = operatorNameOf({
    KABINET_OPERATOR_DISPLAY_NAME: process.env.KABINET_OPERATOR_DISPLAY_NAME,
  });
  const dashboard = await kabinetDashboardOf(healed.identity.principal, {
    db,
    now,
    newId: () => crypto.randomUUID(),
    invites,
    linkBaseURL: baseURL,
    shelterWrites: SHELTER_WRITE_POLICY,
    cursorSecret: requireEnv("CURSOR_HMAC_SECRET"),
    operatorDisplayName: standaloneOperatorName(operator),
  });
  switch (dashboard.kind) {
    case "sign_in":
      redirect("/kabinet/vkhid");
      break;
    case "not_found":
      notFound();
      break;
    case "operator":
      // RU-T1: the operator's home is their list, which guards itself.
      redirect(OPERATOR_HOME);
      break;
    case "shelter":
      // No screen of its own: Тварини is the landing (kabinet UX round 2). The self-heal, the
      // join_failed card and the operator branch above all run first.
      redirect(dashboard.animalListShown ? ANIMAL_LIST_PATH : SHELTER_PROFILE_PATH);
      break;
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled kind; unreachable at runtime */
    default: {
      const unreachable: never = dashboard;
      return unreachable;
    }
  }
}
