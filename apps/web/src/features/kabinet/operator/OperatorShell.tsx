import { uk } from "@opika/i18n";
import type { ReactNode } from "react";
import { type OperatorName, standaloneOperatorName } from "../../../kabinet/operator";
import { BottomNav } from "../../../ui/BottomNav";
import { MAIN_LANDMARK } from "../../../ui/landmark";
import { Text } from "../../../ui/Text";
import { KabinetBrand } from "../KabinetBrand";
import { NEW_SHELTER_PATH, OPERATOR_HOME } from "../routes";
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
 * The nav: «Притулки» (S1) and «Новий притулок» (S2, R-UI 2), the kit's `BottomNav` as on the shelter
 * side: a bottom tab bar on a phone, a side column from desktop.
 */
export function OperatorShell({
  operator,
  current,
  children,
}: {
  operator: OperatorName;
  /** Which nav item is this page, for `aria-current`. */
  current: "shelters" | "new_shelter" | null;
  children: ReactNode;
}) {
  const t = uk.kabinet.operator.shell;
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex min-h-16 flex-wrap items-center gap-3 bg-surface px-4 py-2 desktop:gap-5 desktop:px-8">
        <KabinetBrand />
        <div className="flex-1" />
        <p className="flex flex-col tablet:flex-row tablet:gap-2">
          <Text as="span" look="label">
            {standaloneOperatorName(operator)}
          </Text>
          {operator.kind === "configured" ? (
            <Text as="span" look="hint">
              {t.role}
            </Text>
          ) : null}
        </p>
        <SignOutButton />
      </header>
      {/* Bottom padding clears the nav's fixed phone tab bar; unused from desktop. */}
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 pt-5 pb-24 tablet:px-6 desktop:flex-row desktop:items-start desktop:gap-8 desktop:px-8 desktop:pt-8 desktop:pb-14">
        <BottomNav
          label={uk.kabinet.nav.label}
          layout="bar-then-rail"
          current={current ?? ""}
          items={[
            { key: "shelters", href: OPERATOR_HOME, label: t.nav.shelters },
            { key: "new_shelter", href: NEW_SHELTER_PATH, label: t.nav.newShelter },
          ]}
        />
        <main {...MAIN_LANDMARK} className="flex min-w-0 flex-1 flex-col gap-4 desktop:gap-6">
          {children}
        </main>
      </div>
    </div>
  );
}
