import { uk } from "@opika/i18n";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AccountPage } from "../../../features/kabinet/AccountPage";
import { JoinFailedCard } from "../../../features/kabinet/JoinFailedCard";
import { KabinetBrand } from "../../../features/kabinet/KabinetBrand";
import { OPERATOR_HOME, SHELTER_PROFILE_PATH } from "../../../features/kabinet/routes";
import { MAIN_LANDMARK } from "../../../ui/landmark";
import { loadShelterPage } from "../shelter-load";
import { signedInPerson } from "../signed-in-person";

/**
 * «Акаунт і пароль» (kabinet shell, 2026-11-02): what the Притулок page's fifth tab, «Акаунт»,
 * held: pausing intake and the password. Reached from the header's account menu. The page and its
 * title share one resolve and one read with the Притулок page (`loadShelterPage`).
 */
export async function generateMetadata(): Promise<Metadata> {
  return { title: uk.kabinet.shell.accountAndPassword };
}

export default async function ShelterAccountPage() {
  const result = await loadShelterPage();
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
  const { home, password } = result;
  switch (home.kind) {
    case "sign_in":
      redirect("/kabinet/vkhid");
      break;
    case "not_found":
      notFound();
      break;
    case "operator":
      // The operator has no shelter and never a password.
      redirect(OPERATOR_HOME);
      break;
    case "shelter":
      // A support view has no account of its own to show: back to the shelter's page.
      if (home.viewer === "support") redirect(SHELTER_PROFILE_PATH);
      return (
        <AccountPage
          shelterName={home.view.displayName}
          editing={home.editing}
          password={password}
          person={await signedInPerson()}
        />
      );
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled kind; unreachable at runtime */
    default: {
      const unreachable: never = home;
      return unreachable;
    }
  }
}
