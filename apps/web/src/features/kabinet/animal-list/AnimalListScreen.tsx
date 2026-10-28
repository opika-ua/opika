import { uk } from "@opika/i18n";
import { KabinetBrand } from "../KabinetBrand";
import { KabinetNav } from "../KabinetNav";
import { SignOutButton } from "../SignOutButton";
import { SupportBanner } from "../SupportBanner";
import { AnimalList } from "./AnimalList";
import type { KabinetAnimalListPage } from "./animal-list-page";

/**
 * K2's page around the list: the kabinet's header (N2: brand, the shelter's
 * name, «Вийти»; the support banner and frame in support mode, as on
 * `/kabinet` and K3), the section nav with «Тварини» current, then the list.
 * Unstyled beyond the shared tokens until the brand lands.
 *
 * Bottom padding on the content wrapper (kabinet redesign Phase 2 PR 1) is
 * clearance for the shell nav's new fixed mobile tab bar, unused at desktop
 * width where the nav sits in the side column instead.
 */
export function AnimalListScreen({
  page,
}: {
  page: Extract<KabinetAnimalListPage, { kind: "list" }>;
}) {
  const support = page.viewer === "support";
  return (
    <div
      className={
        support ? "min-h-dvh outline-4 -outline-offset-4 outline-rg-ink outline-solid" : "min-h-dvh"
      }
    >
      {support ? <SupportBanner shelterName={page.shelter.displayName} /> : null}
      <header className="flex min-h-16 items-center gap-3 bg-rg-surface px-4 desktop:gap-5 desktop:px-8">
        <KabinetBrand />
        <span className="hidden text-base font-medium text-rg-ink desktop:block">
          {page.shelter.displayName}
        </span>
        <div className="flex-1" />
        {support ? (
          <span className="text-base text-rg-ink-3">{uk.kabinet.support.signOutDisabled}</span>
        ) : (
          <SignOutButton />
        )}
      </header>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pt-5 pb-24 desktop:flex-row desktop:items-start desktop:gap-8 desktop:px-8 desktop:pt-8 desktop:pb-14">
        {/* Only a viewer this page is shown to reaches here, so «Тварини» is always in its nav. */}
        <KabinetNav current="animals" animalList />
        <main className="flex min-w-0 flex-1 flex-col gap-4">
          <AnimalList
            shelter={page.shelter}
            first={page.first}
            viewer={page.viewer}
            editing={page.editing}
          />
        </main>
      </div>
    </div>
  );
}
