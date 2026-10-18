import { uk } from "@opika/i18n";
import { linkClass } from "../controls/controls";
import { ANIMAL_LIST_PATH, SHELTER_HOME } from "./routes";

/**
 * The shelter kabinet's section nav (N2): «Тварини» · «Профіль притулку», the
 * current one marked `aria-current="page"` (which the shared `nav` link
 * styles from). «Тварини» appears only where K2 is shown to this viewer
 * (`animalListShownTo`, P1): a link to a list that answers 404 would be a dead
 * end. On every width: the phone's bottom tabs are the brand's to design.
 * No hooks, so the server-rendered profile and list pages both use it.
 */
export function KabinetNav({
  current,
  animalList,
}: {
  current: "animals" | "profile";
  animalList: boolean;
}) {
  return (
    <nav aria-label={uk.kabinet.nav.label} className="flex flex-wrap gap-1 desktop:flex-col">
      {animalList ? (
        <a
          href={ANIMAL_LIST_PATH}
          aria-current={current === "animals" ? "page" : undefined}
          className={linkClass("nav")}
        >
          {uk.kabinet.nav.animals}
        </a>
      ) : null}
      <a
        href={SHELTER_HOME}
        aria-current={current === "profile" ? "page" : undefined}
        className={linkClass("nav")}
      >
        {uk.kabinet.profile.title}
      </a>
    </nav>
  );
}
