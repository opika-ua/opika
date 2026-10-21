"use client";

import { uk } from "@opika/i18n";
import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useLayoutEffect, useRef } from "react";
import { Button } from "../controls/controls";
import { useModalFocus } from "../controls/useModalFocus";

/** Phone: the whole screen. Desktop: nearly full height, with a strip of the list dimmed behind. */
const BACKDROP = "fixed inset-0 z-50 bg-rg-fill-strong/90 desktop:px-screen desktop:pt-screen";
const FRAME =
  "relative h-full overflow-y-auto overscroll-contain bg-rg-page outline-none desktop:rounded-t-rg-card desktop:shadow-rg-card";
const CLOSE_BAR = "sticky top-0 z-10 flex justify-end p-row";

/**
 * Designer round 1, §2 as Oleksii decided it on 2026-10-21 (S4b): from the
 * gallery, an animal opens in an overlay holding the animal page itself,
 * "Overlay like Dribbble ... One component: the gallery opens the same
 * AnimalDetailScreen in an overlay." What it shows is `children`, which the
 * intercepting route fills from the same loader and component as the full
 * page, so the two can't drift.
 *
 * Rendered by `app/tvaryny/@preview/(.)[animalId]`: the address bar holds
 * the animal's own URL, and closing is going back in history, so ✕, Escape
 * and the phone's back gesture all do the same thing and the gallery behind
 * keeps its scroll, filters and page. A reload, a shared link or a click
 * with no JavaScript gets the full page.
 *
 * The modal behaviour is `useModalFocus`, shared with `ModalDialog`. Focus
 * starts on the dialog itself (the page inside has its own `h1`, which this
 * component doesn't reach into), and goes back to the gallery card that
 * opened it when it closes. The contact reveal can open over this overlay;
 * its Escape closes only the reveal (`useModalFocus` skips a key the reveal
 * already handled).
 */
export function AnimalOverlay({
  label,
  openerHref,
  children,
}: {
  /** The dialog's accessible name: the animal's name, or the state's title. */
  label: string;
  /** The gallery card's link, which gets focus back if the opener is gone. */
  openerHref: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const close = useCallback(() => router.back(), [router]);

  useModalFocus({ dialogRef, initialFocusRef: dialogRef, onClose: close });
  useReturnFocusToOpener(openerHref);

  return (
    <div className={BACKDROP}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={FRAME}
      >
        <div className={CLOSE_BAR}>
          <Button variant="icon" aria-label={uk.preview.close} onClick={close}>
            <span aria-hidden="true">✕</span>
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * When the overlay closes, focus goes back to the card that opened it, so a
 * keyboard user carries on through the grid where they were. The opener is
 * whatever held focus as the overlay mounted (the clicked or Enter-ed card);
 * where a browser doesn't focus a link on click (Safari), the gallery's link
 * to this same URL is that card. A layout effect, so the opener is read in
 * the commit that inserts the overlay, before focus moves into it; and its
 * cleanup runs before the reveal's when both unmount at once (back with the
 * reveal open), so focus lands on the card, not on a removed node.
 */
function useReturnFocusToOpener(href: string) {
  useLayoutEffect(() => {
    const active = document.activeElement;
    const opener = active instanceof HTMLElement && active !== document.body ? active : null;
    return () => {
      const target =
        opener?.isConnected === true
          ? opener
          : document.querySelector<HTMLElement>(`a[href="${href}"]`);
      target?.focus();
    };
  }, [href]);
}
