import { fillTemplate, uk } from "@opika/i18n";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { JoinFailedCard } from "../../../features/kabinet/JoinFailedCard";
import { KabinetBrand } from "../../../features/kabinet/KabinetBrand";
import { RETIRED_ACCOUNT_TAB } from "../../../features/kabinet/profile-edit/profile-tabs";
import { OPERATOR_HOME, SHELTER_ACCOUNT_PATH } from "../../../features/kabinet/routes";
import { ShelterProfile } from "../../../features/kabinet/ShelterProfile";
import { MAIN_LANDMARK } from "../../../ui/landmark";
import { loadShelterPage } from "../shelter-load";

export async function generateMetadata(): Promise<Metadata> {
  const result = await loadShelterPage();
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
  // The old fifth tab moved to its own page; a saved link or bookmark still lands somewhere.
  if ((Array.isArray(tab) ? tab[0] : tab) === RETIRED_ACCOUNT_TAB) redirect(SHELTER_ACCOUNT_PATH);
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
  const { home, operator } = result;
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
