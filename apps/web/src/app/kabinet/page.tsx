import { kabinetActorRepo } from "@opika/db/repos";
import { uk } from "@opika/i18n";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getDb } from "../../api/db";
import { requireEnv } from "../../api/env";
import { kabinetHomeOf } from "../../features/kabinet/home";
import { JoinFailedCard } from "../../features/kabinet/JoinFailedCard";
import { KabinetBrand } from "../../features/kabinet/KabinetBrand";
import { OPERATOR_HOME } from "../../features/kabinet/routes";
import { ShelterProfile } from "../../features/kabinet/ShelterProfile";
import { SHELTER_WRITE_POLICY } from "../../kabinet/access";
import { invitationAccepter, selfHealingIdentity } from "../../kabinet/invitation-accept";
import { operatorNameOf, standaloneOperatorName } from "../../kabinet/operator";
import { kabinetIdentityOf } from "../../kabinet/principal";
import { kabinetAuthOrNotFound, kabinetAvailabilityOrNotFound } from "./available-auth";

export const metadata: Metadata = {
  title: uk.kabinet.profile.pageTitle,
};

/**
 * The cabinet's home, where the magic link lands (KS-T2): the read-only
 * "your shelter" page (KS-Q1). While sign-in is unavailable it answers its
 * own 404 before touching auth or the database. Who sees what is
 * `kabinetHomeOf`'s decision, the API's own access matrix.
 *
 * A signed-in user with no role first gets the automatic invitation accept
 * again (IN-Q12): if it failed on «Увійти», this load is the retry.
 */
export default async function KabinetHomePage() {
  const auth = kabinetAuthOrNotFound();
  const { invites, baseURL } = kabinetAvailabilityOrNotFound();
  const now = new Date();
  const production = process.env.NODE_ENV === "production";
  const db = getDb();
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
  switch (home.kind) {
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
    case "shelter": {
      // PW-1: «Змінити пароль» for the shelter's own admin, never a support view (the
      // operator's session): whether a password exists decides the form or the note.
      const userId = healed.identity.userId;
      const password =
        home.viewer === "admin" && userId !== null
          ? ({
              kind: (await kabinetActorRepo(db).hasPassword(userId)) ? "set" : "not_set",
            } as const)
          : null;
      return (
        <ShelterProfile
          view={home.view}
          cityName={home.cityName}
          viewer={home.viewer}
          // The locked note puts the name mid-sentence; the decision's signature stands alone.
          operator={operator}
          editing={home.editing}
          password={password}
        />
      );
    }
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled kind; unreachable at runtime */
    default: {
      const unreachable: never = home;
      return unreachable;
    }
  }
}
