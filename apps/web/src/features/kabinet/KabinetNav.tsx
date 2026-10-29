import { uk } from "@opika/i18n";
import { BottomNav } from "../../ui/BottomNav";
import { ANIMAL_LIST_PATH, SHELTER_HOME, SHELTER_PROFILE_PATH } from "./routes";

/**
 * The shelter kabinet's shell nav (N2, kabinet redesign Phase 2 PR 1):
 * «Головна» · «Тварини» · «Притулок», the current one marked
 * `aria-current="page"` (which the shared `nav` link styles from). «Тварини»
 * appears only where K2 is shown to this viewer (`animalListShownTo`, P1): a
 * link to a list that answers 404 would be a dead end. «Головна» and
 * «Притулок» are always shown - neither route ever 404s for a viewer this
 * component renders for.
 *
 * Mobile: a fixed, text-only bottom tab bar (the owner's approved Phase 1
 * proposal), each tab 48px. Desktop: the side column. Both are the kit's `BottomNav`. No hooks, so every server-rendered
 * page that mounts this (Головна, K2, Притулок) can use it as-is.
 */
export function KabinetNav({
  current,
  animalList,
}: {
  current: "home" | "animals" | "profile";
  animalList: boolean;
}) {
  const items = [
    { key: "home", href: SHELTER_HOME, label: uk.kabinet.nav.home },
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
