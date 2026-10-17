import { uk } from "@opika/i18n";
import { AnimalForm } from "./animal-form/AnimalForm";
import type { KabinetAnimalPage } from "./animal-page";
import { KabinetBrand } from "./KabinetBrand";
import { CAPTION } from "./profile-edit/styles";
import { SignOutButton } from "./SignOutButton";
import { SupportBanner } from "./SupportBanner";

/**
 * K3's page around the form: the kabinet's header (N2: brand, the shelter's
 * name, «Вийти»; the support banner and frame in support mode, as on
 * `/kabinet`), then the form, or `errors.notFound` for an id that isn't this
 * shelter's animal.
 *
 * **The back link** goes to `/kabinet`, the only kabinet page there is until
 * K2's animal list (PR 5), and says so: «← Профіль притулку», the profile's
 * own title, rather than `animalForm.backToList` («← Тварини»), which would
 * name a list that doesn't exist yet. PR 5 points it at the list with his
 * words (decision taken, reversible).
 */
export const BACK_TO_PROFILE = { href: "/kabinet", label: `← ${uk.kabinet.profile.title}` };

export function AnimalPage({
  page,
}: {
  page: Extract<KabinetAnimalPage, { kind: "form" | "missing" }>;
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
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pt-5 pb-6 desktop:px-8 desktop:pt-8 desktop:pb-14">
        {page.kind === "form" ? (
          <AnimalForm
            initialView={page.view}
            editing={page.editing}
            viewer={page.viewer}
            shelterVisibility={page.shelterVisibility}
            back={BACK_TO_PROFILE}
          />
        ) : (
          <div className="flex flex-col gap-4">
            <a href={BACK_TO_PROFILE.href} className="self-start text-base text-rg-ink underline">
              {BACK_TO_PROFILE.label}
            </a>
            <p className={CAPTION}>{uk.kabinet.animalForm.errors.notFound}</p>
          </div>
        )}
      </main>
    </div>
  );
}
