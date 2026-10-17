import { uk } from "@opika/i18n";
import type { ReactNode } from "react";
import { FOCUS_RING } from "../../controls/controls";
import { KabinetBrand } from "../KabinetBrand";
import { NEW_SHELTER_PATH } from "../routes";
import { SignOutButton } from "../SignOutButton";
import { SHELTERS_PATH } from "./list-params";

const NAV_ITEM = `flex min-h-target items-center rounded-rg-button px-4 text-base font-medium text-rg-ink aria-[current=page]:bg-rg-surface ${FOCUS_RING}`;

/**
 * The operator's frame (R-UI 1, mock «S1 Притулки»): the kabinet's brand row,
 * the operator's name from `KABINET_OPERATOR_DISPLAY_NAME` (the existing
 * `operatorDisplayName` helper, its fallback «адміністратор сайту»), the role
 * label, «Вийти», and the nav.
 *
 * The nav: «Притулки» (S1) and «Новий притулок» (S2, R-UI 2).
 *
 * Styled through the shared tokens only (test logic, not looks).
 */
export function OperatorShell({
  operatorName,
  current,
  children,
}: {
  operatorName: string;
  /** Which nav item is this page, for `aria-current`. */
  current: "shelters" | "new_shelter" | null;
  children: ReactNode;
}) {
  const t = uk.kabinet.operator.shell;
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex min-h-16 flex-wrap items-center gap-3 bg-rg-surface px-4 py-2 desktop:gap-5 desktop:px-8">
        <KabinetBrand />
        <div className="flex-1" />
        <p className="flex flex-col text-sm text-rg-ink-3 tablet:flex-row tablet:gap-2">
          <span className="font-medium text-rg-ink">{operatorName}</span>
          <span>{t.role}</span>
        </p>
        <SignOutButton />
      </header>
      <div className="flex flex-1 flex-col gap-4 px-4 pt-5 pb-6 desktop:flex-row desktop:items-start desktop:gap-8 desktop:px-8 desktop:pt-8">
        {/* The page's one nav landmark, so it needs no name of its own. */}
        <nav className="flex flex-none flex-col gap-1 desktop:w-56">
          <a
            href={SHELTERS_PATH}
            aria-current={current === "shelters" ? "page" : undefined}
            className={NAV_ITEM}
          >
            {t.nav.shelters}
          </a>
          <a
            href={NEW_SHELTER_PATH}
            aria-current={current === "new_shelter" ? "page" : undefined}
            className={NAV_ITEM}
          >
            {t.nav.newShelter}
          </a>
        </nav>
        <main className="flex min-w-0 flex-1 flex-col gap-4">{children}</main>
      </div>
    </div>
  );
}
