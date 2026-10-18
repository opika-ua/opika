import { uk } from "@opika/i18n";
import { AnimalForm } from "./animal-form/AnimalForm";
import type { KabinetAnimalPage } from "./animal-page";
import { KabinetBrand } from "./KabinetBrand";
import { CAPTION } from "./profile-edit/styles";
import { ANIMAL_LIST_PATH, animalListShownTo, SHELTER_HOME } from "./routes";
import { SignOutButton } from "./SignOutButton";
import { SupportBanner } from "./SupportBanner";

/**
 * K3's page around the form: the kabinet's header (N2: brand, the shelter's
 * name, «Вийти»; the support banner and frame in support mode, as on
 * `/kabinet`), then the form, or `errors.notFound` for an id that isn't this
 * shelter's animal.
 *
 * **The back link** goes to K2's list with his `animalForm.backToList`
 * («← Тварини», PR 5), wherever the list is shown to this viewer (P1:
 * writes open, or the support view). A shelter outside the K-Q17 allowlist,
 * which reaches K3 read-only but has no list (it answers 404 for them), goes
 * back to its profile, named by the profile's own title, as before PR 5.
 */
export const BACK_TO_LIST = { href: ANIMAL_LIST_PATH, label: uk.kabinet.animalForm.backToList };
export const BACK_TO_PROFILE = { href: SHELTER_HOME, label: `← ${uk.kabinet.profile.title}` };

export function AnimalPage({
  page,
}: {
  page: Extract<KabinetAnimalPage, { kind: "form" | "missing" }>;
}) {
  const support = page.viewer === "support";
  const back = animalListShownTo(page.viewer, page.editing) ? BACK_TO_LIST : BACK_TO_PROFILE;
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
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pt-5 pb-6 desktop:px-8 desktop:pt-8 desktop:pb-14">
        {page.kind === "form" ? (
          <AnimalForm
            initialView={page.view}
            editing={page.editing}
            viewer={page.viewer}
            shelterVisibility={page.shelterVisibility}
            back={back}
          />
        ) : (
          <div className="flex flex-col gap-4">
            <a href={back.href} className="self-start text-base text-rg-ink underline">
              {back.label}
            </a>
            <p className={CAPTION}>{uk.kabinet.animalForm.errors.notFound}</p>
          </div>
        )}
      </main>
    </div>
  );
}
