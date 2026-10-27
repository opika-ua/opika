"use client";

import { uk } from "@opika/i18n";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useModalFocus } from "../controls/useModalFocus";

/**
 * Pet card PR 5 (Figma `75:425`), replacing designer feedback batch A's dark
 * Dribbble-style backdrop with the pet card's own look: `SiteHeader` stays
 * fully visible and undimmed at the top - it's rendered inside
 * `app/tvaryny/page.tsx` itself (not a root layout), `position: sticky
 * top-0 z-30`, `min-h-16 desktop:min-h-18` (64/72px).
 *
 * **This backdrop starts *below* the header (`top-16 desktop:top-18`), not
 * at the true viewport top.** A first version tried a pure z-index trick
 * instead (this backdrop at `z-20`, under the header's `z-30`, covering the
 * full viewport) on the reasoning that the header would simply "paint over"
 * the backdrop wherever they overlapped - true for *painting*, false for
 * *hit-testing*: a full-width `z-30` block still intercepts every pointer
 * event in its own rectangle regardless of what's visually on top within
 * it, so the close button (positioned in that same top band) became
 * unclickable, caught by the harness, not by review (`docs/standing-
 * constraints.md`'s "requires a rendered assertion" - this is exactly that
 * class of bug). Starting the backdrop's own box below the header avoids
 * the overlap entirely, which is also what the reference screenshot's own
 * geometry shows (the close button's vertical centre sits well below the
 * header's bottom edge, not inside it).
 *
 * Fill colour: the Figma spec is "the gallery stays behind at 20% opacity,
 * with a full-screen `#F26427` tint at 30% opacity on top." Literally
 * dimming the live gallery would mean reaching into `tvaryny/layout.tsx`'s
 * sibling `@preview`/`children` slots - exactly the kind of restructuring
 * that reintroduced the ghost-header-text bug batch A fixed, for a purely
 * visual effect. Approximated instead as one flat `color-mix` tint derived
 * from the same two tokens the Figma math would composite (`brand-accent`
 * at 30% over `brand-page`, the gallery's own background colour) - a
 * decision taken, not a literal implementation of the two-layer spec; see
 * the PR body.
 */
const BACKDROP =
  "fixed inset-x-0 bottom-0 top-16 desktop:top-18 z-40 [background-color:color-mix(in_srgb,var(--color-brand-accent)_30%,var(--color-brand-page)_70%)]";
/**
 * `useModalFocus`'s Tab trap only ever looks inside `dialogRef`'s own
 * subtree (`dialogRef.current.querySelectorAll(FOCUSABLE)`) - so `role`,
 * `aria-modal` and the ref all sit on this one wrapper, around the close
 * button, the prev/next row and the panel together. Putting any of them in
 * a backdrop sibling instead would silently drop it from the trap: still
 * visible, but unreachable by Tab while the dialog is open - the exact
 * "renders but doesn't work" class of bug `docs/standing-constraints.md`
 * exists to catch.
 */
const DIALOG = "relative flex flex-col h-full outline-none";
/**
 * The close button and the «Попередній»/«Наступний» row sit directly on the
 * peach backdrop (no separate dark strip, unlike batch A) - roughly one
 * horizontal band, matching the reference screenshot's vertical rhythm.
 */
const TOP_BAR = "shrink-0 relative flex items-center justify-center px-6 py-6 desktop:px-14";
const CLOSE_BUTTON =
  "inline-flex size-13 items-center justify-center rounded-full bg-brand-surface shadow-md focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-brand-ink focus-visible:outline-offset-[3px]";
const NEIGHBOUR_LABEL =
  "inline-flex min-h-target items-center px-4 text-[26px] font-semibold text-brand-plum focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-brand-ink focus-visible:outline-offset-[3px]";
/**
 * Only the top corners are rounded (48px, the handoff's own number - no
 * existing token was this large, `--radius-brand-panel-lg` added for it);
 * left, right and bottom are flush to the viewport edge on desktop, where a
 * rounded corner would have nothing to read against. `max-w-[1084px]`: the
 * handoff's own fixed desktop width, centred on the peach backdrop.
 */
const FRAME =
  "relative flex-1 mx-auto w-full max-w-[1084px] overflow-y-auto overscroll-contain bg-brand-surface rounded-t-brand-panel-lg";

export type OverlayNeighbour = { name: string; href: string } | null;

/**
 * Designer round 1, §2 as Oleksii decided it on 2026-10-21 (S4b): from the
 * gallery, an animal opens in an overlay holding the animal page itself.
 * What it shows is `children`, which the intercepting route fills from the
 * same loader and component as the full page, so the two can't drift.
 *
 * Rendered by `app/tvaryny/@preview/(.)[animalId]`: the address bar holds
 * the animal's own URL, and closing is going back in history, so ✕, Escape
 * and the phone's back gesture all do the same thing and the gallery behind
 * keeps its scroll, filters and page. A reload, a shared link or a click
 * with no JavaScript gets the full page.
 *
 * Pet card PR 5, owner decision B: prev/next navigation lives entirely in
 * this component (not `AnimalDetailContent`, which has no concept of
 * gallery-navigation chrome) - a soft `router.replace`/`<Link replace>`
 * between intercepted overlay routes, so the next animal opens in the same
 * overlay without a full page. `neighbours` is required here (never
 * optional) precisely so the full page, which renders no `AnimalOverlay` at
 * all, can never accidentally show a prev/next row - the invariant lives in
 * the type, not a runtime flag.
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
  neighbours,
  children,
}: {
  /** The dialog's accessible name: the animal's name, or the state's title. */
  label: string;
  /** The gallery card's link, which gets focus back if the opener is gone. */
  openerHref: string;
  /** `null`/`null` at an end (owner decision B: "no wrap-around. At an end the label is
   * hidden but keeps its space"), never omitted - every caller computes it, even a notice
   * state (both sides `null`, since there is no current animal to walk from). */
  neighbours: { prev: OverlayNeighbour; next: OverlayNeighbour };
  children: ReactNode;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const close = useCallback(() => router.back(), [router]);

  useModalFocus({ dialogRef, initialFocusRef: dialogRef, onClose: close });
  useReturnFocusToOpener(openerHref);
  useNeighbourArrowKeys(neighbours, router);

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
        <div className={TOP_BAR}>
          <NeighbourLink neighbour={neighbours.prev} align="left" />
          <button
            type="button"
            className={CLOSE_BUTTON}
            aria-label={uk.preview.close}
            onClick={close}
          >
            <img src="/pet-card/icon-close.svg" alt="" aria-hidden="true" />
          </button>
          <NeighbourLink neighbour={neighbours.next} align="right" />
        </div>
        <div className={FRAME}>{children}</div>
      </div>
    </div>
  );
}

/**
 * Prev/next labels absolutely positioned either side of the centred close
 * button, matching the reference screenshot's layout - a flex row would
 * push the close button off-centre whenever one side's label is longer
 * than the other's (or absent, at an end). `invisible`, not `hidden`, at an
 * end: owner decision B, "the label is hidden but keeps its space, so the
 * layout doesn't shift" - this is the shared row both the overlay and the
 * full page's own (always-both-null) row rely on for that guarantee.
 * Prefetched (the one `/tvaryny` link in this codebase that is, unlike
 * every other gallery/animal link's `prefetch={false}` - proxy.ts's
 * per-IP-prefetch-budget reasoning those give doesn't apply here: the
 * handoff explicitly asks for both neighbours prefetched, since they are
 * the two most likely next navigations from an open overlay).
 */
function NeighbourLink({
  neighbour,
  align,
}: {
  neighbour: OverlayNeighbour;
  align: "left" | "right";
}) {
  const side = align === "left" ? "left-6 desktop:left-14" : "right-6 desktop:right-14";
  if (neighbour === null) {
    return (
      <span aria-hidden="true" className={`invisible absolute top-1/2 -translate-y-1/2 ${side}`}>
        <span className={NEIGHBOUR_LABEL}>
          {align === "left" ? uk.detail.prev : uk.detail.next}
        </span>
      </span>
    );
  }
  return (
    <Link
      href={neighbour.href}
      replace
      data-testid={align === "left" ? "overlay-prev" : "overlay-next"}
      aria-label={`${align === "left" ? uk.detail.prev : uk.detail.next}: ${neighbour.name}`}
      className={`absolute top-1/2 -translate-y-1/2 ${side} ${NEIGHBOUR_LABEL}`}
    >
      {align === "left" ? uk.detail.prev : uk.detail.next}
    </Link>
  );
}

/**
 * ← and → walk the overlay's own prev/next (owner decision B), except while
 * focus is in a text field or the reveal dialog is open - a direct DOM
 * check for the dialog (`[data-testid="reveal-dialog"]`), the same kind of
 * query `useReturnFocusToOpener` below already makes, rather than threading
 * `useReveal`'s state up through a component that has no other reason to
 * know about it. `router.replace` (not `push`), matching the visible
 * links' own `<Link replace>` - a soft navigation between intercepted
 * overlay routes, never a full page.
 */
function useNeighbourArrowKeys(
  neighbours: { prev: OverlayNeighbour; next: OverlayNeighbour },
  router: ReturnType<typeof useRouter>,
) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const active = document.activeElement;
      const inTextInput =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLElement && active.isContentEditable);
      if (inTextInput) return;
      if (document.querySelector('[data-testid="reveal-dialog"]')) return;

      const target = event.key === "ArrowLeft" ? neighbours.prev : neighbours.next;
      if (target === null) return;
      event.preventDefault();
      router.replace(target.href, { scroll: false });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [neighbours, router]);
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
