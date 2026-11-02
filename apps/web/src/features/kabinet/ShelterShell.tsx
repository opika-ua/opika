import type { ReactNode } from "react";
import { Container } from "../../ui/Container";
import { cx } from "../../ui/cx";
import { MAIN_LANDMARK } from "../../ui/landmark";
import { KabinetHeader } from "./KabinetHeader";
import { SupportBanner } from "./SupportBanner";

/**
 * The frame of every shelter page: the support banner and its 4px outline (support view only), the
 * header, then the sidebar and a content column of at most 820px next to it, left-aligned, the
 * sidebar's left edge on the header's gutter line. `navOnPhone={false}` hides the nav below
 * `desktop` (the animal form, whose bottom edge belongs to its save bar); otherwise the content has
 * bottom padding that clears the fixed phone tab bar.
 */
export function ShelterShell({
  shelterName,
  viewer,
  nav,
  navOnPhone = true,
  children,
}: {
  shelterName: string;
  viewer: "admin" | "support";
  nav: ReactNode;
  navOnPhone?: boolean;
  children: ReactNode;
}) {
  const support = viewer === "support";
  return (
    <div
      className={
        support ? "min-h-dvh outline-4 -outline-offset-4 outline-ink outline-solid" : "min-h-dvh"
      }
    >
      {support ? <SupportBanner shelterName={shelterName} /> : null}
      <KabinetHeader account={{ kind: "shelter", shelterName, viewer }} />
      <Container
        className={cx(
          "flex flex-col gap-4 pt-5 desktop:flex-row desktop:items-start desktop:gap-8 desktop:pt-8 desktop:pb-14",
          navOnPhone ? "pb-24" : "pb-4",
        )}
      >
        {navOnPhone ? nav : <div className="hidden desktop:contents">{nav}</div>}
        <main {...MAIN_LANDMARK} className="flex min-w-0 max-w-205 flex-1 flex-col gap-4">
          {children}
        </main>
      </Container>
    </div>
  );
}
