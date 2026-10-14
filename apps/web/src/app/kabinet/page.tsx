import { uk } from "@opika/i18n";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getDb } from "../../api/db";
import { kabinetHomeOf } from "../../features/kabinet/home";
import { ShelterProfile } from "../../features/kabinet/ShelterProfile";
import { operatorDisplayName } from "../../kabinet/operator";
import { kabinetIdentityOf } from "../../kabinet/principal";
import { kabinetAuthOrNotFound } from "./available-auth";

export const metadata: Metadata = {
  title: uk.kabinet.profile.pageTitle,
};

/**
 * The cabinet's home, where the magic link lands (KS-T2): the read-only
 * "your shelter" page (KS-Q1). While sign-in is unavailable it answers its
 * own 404 before touching auth or the database. Who sees what is
 * `kabinetHomeOf`'s decision, the API's own access matrix.
 */
export default async function KabinetHomePage() {
  const auth = kabinetAuthOrNotFound();
  const now = new Date();
  const production = process.env.NODE_ENV === "production";
  const db = getDb();
  const identity = await kabinetIdentityOf(auth, db, new Headers(await headers()), now, production);
  const home = await kabinetHomeOf(identity.principal, {
    db,
    now,
    newId: () => crypto.randomUUID(),
  });
  switch (home.kind) {
    case "sign_in":
      redirect("/kabinet/vkhid");
      break;
    case "not_found":
      notFound();
      break;
    case "shelter":
      return (
        <ShelterProfile
          view={home.view}
          cityName={home.cityName}
          viewer={home.viewer}
          operatorName={operatorDisplayName({
            KABINET_OPERATOR_DISPLAY_NAME: process.env.KABINET_OPERATOR_DISPLAY_NAME,
          })}
        />
      );
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled kind; unreachable at runtime */
    default: {
      const unreachable: never = home;
      return unreachable;
    }
  }
}
