"use client";

import { uk } from "@opika/i18n";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { MenuIcon } from "./icons";

const MENU_ID = "site-nav-menu";

/**
 * Owner, verbatim: "for mobile i need a hamburger menu which would open
 * navigation and have those links from header rather than scale and move
 * those links below logo." Replaces the old behaviour below `tablet:`,
 * where `SiteHeader`'s own `flex-wrap` let the `<nav>` drop onto a second
 * row under the logo once it didn't fit beside it.
 *
 * Same mechanism as `FilterSheet.tsx` (the owner's own pointer, and this
 * codebase's established "open a sheet with zero required JS" pattern,
 * not reinvented here): a native `<dialog>`, server-rendered without
 * `open`, made visible with **zero JS** via `:target` (`globals.css`'s
 * `#site-nav-menu:target` rule) - the trigger is a plain
 * `<a href="#site-nav-menu">`, an ordinary anchor jump, so the header's
 * nav links (real navigation, not a client-only feature) still reach a
 * no-JS visitor. JS, when present, upgrades the same markup: the
 * trigger's click calls `showModal()` instead of navigating the hash
 * (real focus trap, real Esc-to-close, a backdrop - all native `<dialog>`
 * behaviour), and this component adds only what `showModal()` doesn't
 * provide for free: locking background scroll and returning focus to the
 * trigger on close - identical to `FilterSheet`'s own `useEffect`
 * (body-scroll lock) and close handling, copied rather than paraphrased
 * so the two stay the same shape if one needs fixing later.
 *
 * `children` is the actual nav content (`SiteHeader`'s own `NavLinks`,
 * the same links/conditional Кабінет-vs-Збережені logic the inline
 * `<nav>` already has above `tablet:`) - this component owns only the
 * drawer chrome (trigger, dialog, backdrop, close button), not what's
 * inside it, so the one list of links is never duplicated by hand in two
 * different shapes.
 */
export function MobileNavMenu({ children }: { children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLAnchorElement>(null);
  // Only meaningful with JS: `aria-expanded` has no way to reflect the
  // no-JS `:target` reveal, the same limitation `FilterSheet` accepts by
  // not attempting an `aria-expanded` state at all - the native `<dialog>`
  // (`role` + `aria-modal` implicit in the element itself) is the real
  // accessibility signal in that case, this is additional, JS-only polish.
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onClose = () => {
      document.body.style.overflow = "";
      setIsOpen(false);
      triggerRef.current?.focus();
      if (window.location.hash === `#${MENU_ID}`) {
        history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    };
    dialog.addEventListener("close", onClose);
    return () => dialog.removeEventListener("close", onClose);
  }, []);

  const openWithJs = (event: React.MouseEvent<HTMLAnchorElement>) => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    event.preventDefault();
    document.body.style.overflow = "hidden";
    dialog.showModal();
    setIsOpen(true);
  };

  // Same reasoning as `FilterSheet.tsx`'s own `closeWithJs`: the no-JS
  // `:target` reveal carries no `open` attribute, so `HTMLDialogElement
  // .close()` on it returns immediately and fires no `close` event -
  // falling through to the plain `href="#"` is what actually clears the
  // fragment (and so hides the dialog) in that state, with or without JS.
  const closeWithJs = (event: React.MouseEvent<HTMLAnchorElement>) => {
    const dialog = dialogRef.current;
    if (!dialog?.open) return;
    event.preventDefault();
    dialog.close();
  };

  return (
    <>
      <a
        ref={triggerRef}
        href={`#${MENU_ID}`}
        onClick={openWithJs}
        aria-label={uk.nav.menu}
        aria-expanded={isOpen}
        aria-controls={MENU_ID}
        aria-haspopup="dialog"
        data-testid="nav-menu-trigger"
        className="tablet:hidden inline-flex min-h-target min-w-target items-center justify-center rounded-brand-field text-brand-ink focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-brand-accent focus-visible:outline-offset-[3px]"
      >
        <MenuIcon className="size-6" />
      </a>

      <dialog
        ref={dialogRef}
        id={MENU_ID}
        aria-label={uk.nav.menu}
        data-testid="nav-menu-sheet"
        className="tablet:hidden fixed inset-x-0 bottom-0 top-auto z-50 m-0 w-full max-w-none rounded-t-brand-panel border-0 bg-brand-surface p-0 shadow-lg backdrop:bg-brand-ink/40"
      >
        <div className="flex flex-col gap-4 p-5">
          <div className="flex items-center justify-between">
            <span className="font-brand-ui text-[16px] font-semibold text-brand-ink-2 uppercase tracking-[0.06em]">
              {uk.nav.menu}
            </span>
            {/* biome-ignore lint/a11y/useValidAnchor: real navigation, not a disguised button -
                without JS this is the only way to clear #site-nav-menu and make the :target rule
                hide the drawer again; a <button> cannot change the URL fragment on its own. */}
            <a
              href="#"
              onClick={closeWithJs}
              aria-label={uk.preview.close}
              className="inline-flex min-h-target min-w-target items-center justify-center rounded-brand-field text-brand-ink-2 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-brand-accent focus-visible:outline-offset-[3px]"
            >
              ✕
            </a>
          </div>
          <nav aria-label={uk.nav.menu} className="flex flex-col gap-1">
            {children}
          </nav>
        </div>
      </dialog>
    </>
  );
}
