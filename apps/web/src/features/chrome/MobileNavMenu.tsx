import { ukPublic as uk } from "@opika/i18n/public";
import type { ReactNode } from "react";
import { Icon } from "../../ui/Icon";
import { Sheet } from "../../ui/Sheet";

/**
 * The header's hamburger drawer below `tablet:`: the kit's `Sheet`, which keeps the no-JS path
 * (the trigger is an `<a href="#site-nav-menu">` revealed by `:target`) and upgrades to a native
 * modal `<dialog>` with JS (focus trap, Esc/Back, scroll lock, focus back to the trigger).
 * `children` is the nav content, so the one list of links is never written twice here.
 */
export function MobileNavMenu({ children }: { children: ReactNode }) {
  return (
    <Sheet
      id="site-nav-menu"
      label={uk.nav.menu}
      closeLabel={uk.preview.close}
      hideFrom="tablet"
      triggerClassName="tablet:hidden rounded-field text-ink"
      triggerTestId="nav-menu-trigger"
      dialogTestId="nav-menu-sheet"
      trigger={<Icon name="menu" />}
    >
      <nav aria-label={uk.nav.menu} className="flex flex-col gap-1">
        {children}
      </nav>
    </Sheet>
  );
}
