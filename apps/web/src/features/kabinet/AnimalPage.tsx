import { uk } from "@opika/i18n";
import { buttonClass } from "../../ui/Button";
import { MAIN_LANDMARK } from "../../ui/landmark";
import { Text } from "../../ui/Text";
import { AnimalForm } from "./animal-form/AnimalForm";
import type { AnimalTab } from "./animal-form/animal-tabs";
import type { KabinetAnimalPage } from "./animal-page";
import { KabinetHeader } from "./KabinetHeader";
import { KabinetNav } from "./KabinetNav";
import { ANIMAL_LIST_PATH, animalListShownTo, SHELTER_PROFILE_PATH } from "./routes";
import { SupportBanner } from "./SupportBanner";

/**
 * K3's page around the form: the kabinet's header (N2: brand, the shelter's
 * name, «Вийти»; the support banner and frame in support mode, as on
 * `/kabinet`), then the form, or `errors.notFound` for an id that isn't this
 * shelter's animal.
 *
 * **The back link** goes to K2's list with his `animalForm.backToList`
 * («← Тварини», PR 5), wherever the list is shown to this viewer (P1:
 * writes open, or the support view). A viewer the list isn't shown to goes
 * back to Притулок (`SHELTER_PROFILE_PATH`, kabinet redesign Phase 2 PR 1 -
 * renamed from «Профіль притулку»), named by its own title; since PR 6
 * opened every shelter's writes, no shelter admin is one, and the branch
 * stays so the page, the nav and this link keep sharing one rule.
 *
 * **The shell** is the list's (kit tokens, the side nav from desktop). Below desktop the form
 * hides the tab bar: the bottom edge belongs to the form's save bar, the back link above the
 * title is the way out, and a task this long shouldn't offer three other destinations under the
 * thumb (kabinet redesign Phase 2 PR 3, a decision taken; the bar is back on every other page).
 */
export const BACK_TO_LIST = { href: ANIMAL_LIST_PATH, label: uk.kabinet.animalForm.backToList };
export const BACK_TO_PROFILE = {
  href: SHELTER_PROFILE_PATH,
  label: `← ${uk.kabinet.profile.title}`,
};

export function AnimalPage({
  page,
  tab = "osnovne",
}: {
  page: Extract<KabinetAnimalPage, { kind: "form" | "missing" }>;
  /** From `?tab=`, read by the server page. */
  tab?: AnimalTab;
}) {
  const support = page.viewer === "support";
  const listShown = animalListShownTo(page.viewer, page.editing);
  const back = listShown ? BACK_TO_LIST : BACK_TO_PROFILE;
  return (
    <div
      className={
        support ? "min-h-dvh outline-4 -outline-offset-4 outline-ink outline-solid" : "min-h-dvh"
      }
    >
      {support ? <SupportBanner shelterName={page.shelter.displayName} /> : null}
      <KabinetHeader shelterName={page.shelter.displayName} viewer={page.viewer} />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pt-5 pb-4 tablet:px-6 desktop:flex-row desktop:items-start desktop:gap-8 desktop:px-8 desktop:pt-8 desktop:pb-14">
        <div className="hidden desktop:contents">
          <KabinetNav current="animals" animalList={listShown} />
        </div>
        <main {...MAIN_LANDMARK} className="flex min-w-0 flex-1 flex-col gap-4">
          {page.kind === "form" ? (
            <AnimalForm
              initialView={page.view}
              editing={page.editing}
              viewer={page.viewer}
              shelterVisibility={page.shelterVisibility}
              back={back}
              initialTab={tab}
            />
          ) : (
            <div className="flex flex-col gap-4">
              <a href={back.href} className={`self-start ${buttonClass("ghost")}`}>
                {back.label}
              </a>
              <Text look="body">{uk.kabinet.animalForm.errors.notFound}</Text>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
