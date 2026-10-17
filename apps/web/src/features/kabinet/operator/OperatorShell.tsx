import { uk } from "@opika/i18n";
import type { ReactNode } from "react";
import { type OperatorName, standaloneOperatorName } from "../../../kabinet/operator";
import { linkClass } from "../../controls/controls";
import { KabinetBrand } from "../KabinetBrand";
import { CAPTION, CAPTION_STRONG } from "../profile-edit/styles";
import { OPERATOR_HOME } from "../routes";
import { SignOutButton } from "../SignOutButton";

/**
 * The operator's frame (R-UI 1, mock «S1 Притулки»): the kabinet's brand row,
 * who is signed in, «Вийти», and the nav.
 *
 * Who is signed in is the name from `KABINET_OPERATOR_DISPLAY_NAME` with the
 * role label beside it. With no name configured, the fallback is the role
 * itself (answer 9), so the header shows it once, capitalised as it stands
 * alone (round 2, answer 6), rather than the role twice.
 *
 * The nav holds «Притулки» only. «Новий притулок» (`shell.nav.newShelter`)
 * joins it with R-UI 2, which adds its route: a link to a page that isn't
 * there would be a dead end, as on the shelter's own page.
 *
 * Styled through the shared tokens only (test logic, not looks).
 */
export function OperatorShell({
  operator,
  current,
  children,
}: {
  operator: OperatorName;
  /** Which nav item is this page, for `aria-current`. */
  current: "shelters" | null;
  children: ReactNode;
}) {
  const t = uk.kabinet.operator.shell;
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex min-h-16 flex-wrap items-center gap-3 bg-rg-surface px-4 py-2 desktop:gap-5 desktop:px-8">
        <KabinetBrand />
        <div className="flex-1" />
        <p className="flex flex-col tablet:flex-row tablet:gap-2">
          <span className={CAPTION_STRONG}>{standaloneOperatorName(operator)}</span>
          {operator.kind === "configured" ? <span className={CAPTION}>{t.role}</span> : null}
        </p>
        <SignOutButton />
      </header>
      <div className="flex flex-1 flex-col gap-4 px-4 pt-5 pb-6 desktop:flex-row desktop:items-start desktop:gap-8 desktop:px-8 desktop:pt-8">
        {/* The page's one nav landmark, so it needs no name of its own. */}
        <nav className="flex flex-none flex-col gap-1 desktop:w-56">
          <a
            href={OPERATOR_HOME}
            aria-current={current === "shelters" ? "page" : undefined}
            className={linkClass("nav")}
          >
            {t.nav.shelters}
          </a>
        </nav>
        <main className="flex min-w-0 flex-1 flex-col gap-4">{children}</main>
      </div>
    </div>
  );
}
