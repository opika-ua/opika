import { uk } from "@opika/i18n";
import { BottomNav } from "../../ui/BottomNav";
import { ANIMAL_LIST_PATH, SHELTER_PROFILE_PATH } from "./routes";

/**
 * The shelter kabinet's shell nav: «Тварини» · «Притулок», the current one marked
 * `aria-current="page"`. Two tabs since kabinet UX round 2 (there is no Головна: Тварини is the
 * landing). «Тварини» appears only where K2 is shown to this viewer (`animalListShownTo`): a link
 * to a list that answers 404 would be a dead end. A fixed bottom bar below `desktop`, a side
 * column from there; both are the kit's `BottomNav`. No hooks, so server pages mount it as is.
 */
export function KabinetNav({
  current,
  animalList,
}: {
  current: "animals" | "profile";
  animalList: boolean;
}) {
  const items = [
    ...(animalList
      ? [{ key: "animals", href: ANIMAL_LIST_PATH, label: uk.kabinet.nav.animals }]
      : []),
    { key: "profile", href: SHELTER_PROFILE_PATH, label: uk.kabinet.profile.title },
  ];
  return (
    <BottomNav
      label={uk.kabinet.nav.label}
      items={items}
      current={current}
      layout="bar-then-rail"
    />
  );
}
