import { uk } from "@opika/i18n";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { requireEnv } from "../../api/env";
import { kabinetDashboardOf } from "../../features/kabinet/dashboard";
import { JoinFailedCard } from "../../features/kabinet/JoinFailedCard";
import { KabinetBrand } from "../../features/kabinet/KabinetBrand";
import { KabinetHome } from "../../features/kabinet/KabinetHome";
import { OPERATOR_HOME } from "../../features/kabinet/routes";
import { SHELTER_WRITE_POLICY } from "../../kabinet/access";
import { invitationAccepter, selfHealingIdentity } from "../../kabinet/invitation-accept";
import { kabinetDb } from "../../kabinet/kabinet-db";
import { operatorNameOf, standaloneOperatorName } from "../../kabinet/operator";
import { kabinetIdentityOf } from "../../kabinet/principal";
import { kabinetAuthOrNotFound, kabinetAvailabilityOrNotFound } from "./available-auth";

export const metadata: Metadata = {
  title: uk.kabinet.nav.home,
};

/**
 * Головна (kabinet redesign Phase 2 PR 1): `SHELTER_HOME`, where the magic
 * link lands (KS-T2), and where sign-in's redirect, every invite/reset email
 * link, and an old `/kabinet` bookmark all land - unchanged URL, new content.
 * It used to serve K4's read-only "your shelter" page (KS-Q1); that screen
 * moved to its own path (`app/kabinet/prytulok/page.tsx`, «Притулок» in the
 * nav), and this page took the landing slot with "what needs attention"
 * instead (`KabinetHome`; the research proposal,
 * `Claude outputs\KABINET-IA-2026-10-28.md` §4). While sign-in is
 * unavailable it answers its own 404 before touching auth or the database.
 * Who sees what is `kabinetDashboardOf`'s decision, the same access matrix
 * `kabinetHomeOf` and `kabinetAnimalListPageOf` already apply.
 *
 * A signed-in user with no role first gets the automatic invitation accept
 * again (IN-Q12): if it failed on «Увійти», this load is the retry.
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
        <header className="flex min-h-16 items-center bg-rg-surface px-4 tablet:min-h-0 tablet:bg-transparent tablet:p-8">
          <KabinetBrand />
        </header>
        <main className="flex flex-1 flex-col px-4 pt-5 pb-6 tablet:items-center tablet:justify-center tablet:px-8 tablet:pt-8 tablet:pb-24">
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
      return (
        <KabinetHome
          view={dashboard.view}
          viewer={dashboard.viewer}
          operator={operator}
          draftCount={dashboard.draftCount}
          staleCount={dashboard.staleCount}
          animalListShown={dashboard.animalListShown}
          canWrite={dashboard.canWrite}
        />
      );
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled kind; unreachable at runtime */
    default: {
      const unreachable: never = dashboard;
      return unreachable;
    }
  }
}
