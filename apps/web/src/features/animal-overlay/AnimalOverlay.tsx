"use client";

import { uk } from "@opika/i18n";
import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useLayoutEffect, useRef } from "react";
import { FOCUS_RING } from "../controls/controls";
import { useModalFocus } from "../controls/useModalFocus";

/**
 * Designer feedback batch A (2026-10-23), the Dribbble shot-overlay
 * reference: a dark backdrop end to end (not the old light
 * `bg-rg-fill-strong/90` — "fill-strong" is `#dcdcd9`, nowhere near dark,
 * despite the comment this replaced calling it "dimmed"), a dark strip
 * above the panel carrying only ✕ (never inside the panel itself), and the
 * panel nearly full width on desktop rather than inset by the old
 * `--spacing-screen` (40px) gutter on both sides. On a phone the panel
 * fills the rest of the screen below that strip — full screen, as before,
 * just with the strip now visually part of the same dark surface rather
 * than sitting on the panel's own background.
 *
 * Fully opaque, not `/90`: the gallery's own `SiteHeader` sits in normal
 * document flow underneath this (`position: fixed` only removes it from
 * layout, it doesn't stop the two from painting in the same stack), so a
 * translucent backdrop left its text a faint, legible ghost at the top of
 * the overlay — a real screenshot caught this, markup inspection wouldn't
 * have (`docs/standing-constraints.md`'s "requires a rendered assertion").
 * That's precisely the "no site header" his feedback asks to remove, just
 * dimmed instead of hidden; opaque removes it outright.
 */
const BACKDROP = "fixed inset-0 z-50 bg-rg-ink";
/**
 * `useModalFocus`'s Tab trap only ever looks inside `dialogRef`'s own
 * subtree (`dialogRef.current.querySelectorAll(FOCUSABLE)`) — so `role`,
 * `aria-modal` and the ref all sit on this one wrapper, around *both* the
 * close strip and the panel below it. Putting ✕ in a backdrop sibling
 * instead (the first version of this batch) would have silently dropped
 * it from the trap: still visible, but unreachable by Tab while the
 * dialog is open — the exact "renders but doesn't work" class of bug
 * `docs/standing-constraints.md` exists to catch, caught here before
 * shipping rather than by a reviewer.
 */
const DIALOG = "flex flex-col h-full outline-none";
const CLOSE_BAR = "shrink-0 flex justify-end px-group py-row desktop:px-section desktop:py-group";
/**
 * His correction on the first pass: no filled circle behind ✕ — bare on the
 * dark backdrop. Not `Button`'s `icon` variant (`bg-rg-fill text-rg-ink`,
 * built for a light surface): `text-rg-surface` (pure white) directly on
 * `bg-rg-ink` is the project's own highest-contrast pairing, reused here
 * rather than invented. Still a real 48px target (`min-h-target w-target`)
 * and still keeps its own focus ring — "never removed," `docs/design/
 * README.md`'s own rule, regardless of a missing background box.
 */
const CLOSE_BUTTON = `inline-flex min-h-target w-target flex-none items-center justify-center rounded-rg-button text-lg text-rg-surface ${FOCUS_RING}`;
/**
 * His correction on the first pass (2026-10-23, screenshot): no left/right
 * gap at all — flush to the viewport like the phone layout, not inset by
 * `desktop:mx-section`. Only the top corners are rounded now, against the
 * dark close strip above; left, right and bottom are all flush to the
 * viewport edge, where a rounded corner would have nothing to read against.
 */
const FRAME =
  "relative flex-1 overflow-y-auto overscroll-contain bg-rg-page desktop:rounded-t-rg-card desktop:shadow-rg-card";

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
        className={DIALOG}
      >
        {/* Batch A: ✕ sits on the dark backdrop, not inside the white panel below. */}
        <div className={CLOSE_BAR}>
          <button
            type="button"
            className={CLOSE_BUTTON}
            aria-label={uk.preview.close}
            onClick={close}
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>
        <div className={FRAME}>{children}</div>
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
