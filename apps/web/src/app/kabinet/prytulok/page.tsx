import { kabinetActorRepo } from "@opika/db/repos";
import { fillTemplate, uk } from "@opika/i18n";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { requireEnv } from "../../../api/env";
import { type KabinetHome, kabinetHomeOf } from "../../../features/kabinet/home";
import { JoinFailedCard } from "../../../features/kabinet/JoinFailedCard";
import { KabinetBrand } from "../../../features/kabinet/KabinetBrand";
import type { PasswordState } from "../../../features/kabinet/password/ChangePasswordSection";
import { OPERATOR_HOME } from "../../../features/kabinet/routes";
import { ShelterProfile } from "../../../features/kabinet/ShelterProfile";
import { SHELTER_WRITE_POLICY } from "../../../kabinet/access";
import { invitationAccepter, selfHealingIdentity } from "../../../kabinet/invitation-accept";
import { kabinetDb } from "../../../kabinet/kabinet-db";
import {
  type OperatorName,
  operatorNameOf,
  standaloneOperatorName,
} from "../../../kabinet/operator";
import { kabinetIdentityOf } from "../../../kabinet/principal";
import { MAIN_LANDMARK } from "../../../ui/landmark";
import { kabinetAuthOrNotFound, kabinetAvailabilityOrNotFound } from "../available-auth";

type Loaded =
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
const load = cache(async (): Promise<Loaded> => {
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

export async function generateMetadata(): Promise<Metadata> {
  const result = await load();
  return result.kind === "ready" && result.home.kind === "shelter"
    ? {
        title: fillTemplate(uk.kabinet.profile.pageTitle, {
          shelter: result.home.view.displayName,
        }),
      }
    : {};
}

export default async function ShelterProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { tab } = await searchParams;
  const result = await load();
  if (result.kind === "join_failed") {
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
  const { home, operator, password } = result;
  switch (home.kind) {
    case "sign_in":
      redirect("/kabinet/vkhid");
      break;
    case "not_found":
      notFound();
      break;
    case "operator":
      // The operator never has a profile editor of their own; their home is their list.
      redirect(OPERATOR_HOME);
      break;
    case "shelter":
      return (
        <ShelterProfile
          view={home.view}
          cityName={home.cityName}
          viewer={home.viewer}
          // The locked note puts the name mid-sentence; the decision's signature stands alone.
          operator={operator}
          editing={home.editing}
          password={password}
          tab={Array.isArray(tab) ? tab[0] : tab}
        />
      );
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled kind; unreachable at runtime */
    default: {
      const unreachable: never = home;
      return unreachable;
    }
  }
}
