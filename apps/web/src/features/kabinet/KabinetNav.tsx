import { uk } from "@opika/i18n";
import { linkClass } from "../controls/controls";
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
 * proposal), each tab at least `min-h-target` (48px, from `linkClass("nav")`).
 * Desktop: the unchanged side column. No hooks, so every server-rendered
 * page that mounts this (Головна, K2, Притулок) can use it as-is.
 */
export function KabinetNav({
  current,
  animalList,
}: {
  current: "home" | "animals" | "profile";
  animalList: boolean;
}) {
  const items: { key: "home" | "animals" | "profile"; href: string; label: string }[] = [
    { key: "home", href: SHELTER_HOME, label: uk.kabinet.nav.home },
    ...(animalList
      ? [{ key: "animals" as const, href: ANIMAL_LIST_PATH, label: uk.kabinet.nav.animals }]
      : []),
    { key: "profile", href: SHELTER_PROFILE_PATH, label: uk.kabinet.profile.title },
  ];
  return (
    <nav
      aria-label={uk.kabinet.nav.label}
      className="fixed inset-x-0 bottom-0 z-10 flex gap-1 bg-rg-surface p-2 desktop:static desktop:inset-auto desktop:z-auto desktop:w-[220px] desktop:flex-none desktop:flex-col desktop:bg-transparent desktop:p-0"
    >
      {items.map((item) => (
        <a
          key={item.key}
          href={item.href}
          aria-current={current === item.key ? "page" : undefined}
          className={`flex-1 justify-center desktop:flex-none desktop:justify-start ${linkClass("nav")}`}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}
