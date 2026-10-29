"use client";

import { ukPublic as uk } from "@opika/i18n/public";
import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button, buttonClass, LinkButton } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { useModalFocus } from "../controls/useModalFocus";
import { useScrollingClass } from "../controls/useScrollingClass";

/**
 * The gallery's animal overlay (designer round 1 S4b, pet card PR 5): an intercepting route that
 * holds the animal page itself. The address bar holds the animal's URL; closing is going back in
 * history, so the close button, Escape and the phone's back gesture all do the same thing.
 *
 * The backdrop covers the whole viewport under the (retracted) site header, as one continuous
 * blur: a second blur on the header produced a visible seam. The tint is a literal `color-mix` in
 * sRGB because Tailwind's `/opacity` mixes in OKLab and read as a different shade.
 *
 * Kit Modal gap: the kit's Modal is a titled bottom sheet / centred card. This overlay needs a
 * full-height sheet with a blurred page backdrop, a close and prev/next row above the sheet, an
 * entrance animation that is skipped when walking neighbours, and no title bar, so it stays
 * bespoke; its buttons are the kit's.
 */
const BACKDROP =
  "fixed inset-0 z-20 backdrop-blur-2xl [background-color:color-mix(in_srgb,var(--color-accent)_30%,transparent)]";
/**
 * The header has no fill or blur of its own while this is open (`globals.css`, `:has()` on this
 * marker), so it rides on the backdrop's blur without needing a prop from here.
 */
const OVERLAY_MARKER = "pet-card-overlay-open";
/** The orange focus ring would sit on an orange-tinted backdrop; the ink ring stays visible there. */
const OVERLAY_FOCUS = "focus-ring-ink";
/**
 * A `window` property, not module scope: prev/next moves between two intercepted-route segments,
 * which remount this component, and module scope did not survive that. Set just before a neighbour
 * navigation and read once by the next mount, so only a fresh open plays the entrance animation.
 */
function skipNextEntranceAnimation(): void {
  (window as { __skipOverlayEntrance?: boolean }).__skipOverlayEntrance = true;
}
function consumeSkipEntranceAnimation(): boolean {
  const w = window as { __skipOverlayEntrance?: boolean };
  const skip = w.__skipOverlayEntrance === true;
  w.__skipOverlayEntrance = false;
  return skip;
}
/**
 * `role`, `aria-modal` and the ref sit on one wrapper around the close row and the panel:
 * `useModalFocus` traps Tab only inside that subtree. The dialog rises into the space the
 * retracting header leaves (`animate-panel-up`, only on a fresh open).
 */
const DIALOG_BASE = "relative flex h-full flex-col outline-none";
/**
 * The close and prev/next buttons sit on the backdrop, flush with the panel's side edges. The
 * row's vertical clearance lives on a separate wrapper (`TOP_BAR_OFFSET`): padding on the row
 * itself centres the close button and the absolutely positioned prev/next in different boxes.
 */
// `max(1.5rem, env(safe-area-inset-top))`: on a non-notched device
// `env(safe-area-inset-top)` is 0, so this resolves to the same `pt-6` as
// before - only a notch/dynamic-island inset (iOS) can ever push it further,
// never shrink it below the existing clearance.
const TOP_BAR_OFFSET = "shrink-0 pt-safe-top pb-6";
const TOP_BAR = "relative mx-auto flex w-full max-w-271 items-center justify-center";
/**
 * Only the top corners are rounded. Two boxes: Chrome's classic scrollbar is not reliably clipped
 * by a scroller's own `border-radius`, so `FRAME_CLIP` clips with both `overflow-hidden` and
 * `clip-path` at the same radius, and `FRAME_SCROLL` owns the scrolling.
 */
const FRAME_CLIP =
  "relative flex-1 mx-auto w-full max-w-271 overflow-hidden bg-surface rounded-t-sheet [clip-path:inset(0_round_var(--radius-sheet)_var(--radius-sheet)_0_0)]";
const FRAME_SCROLL = "h-full overflow-y-auto overscroll-contain brand-scrollbar";

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
 * The modal behaviour is `useModalFocus`, shared with the reveal dialog. Focus
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
  const scrollRef = useScrollingClass<HTMLDivElement>();
  const [shouldAnimate] = useState(() => !consumeSkipEntranceAnimation());

  useModalFocus({ dialogRef, initialFocusRef: dialogRef, onClose: close });
  useReturnFocusToOpener(openerHref);
  useNeighbourArrowKeys(neighbours, router);

  return (
    <div className={BACKDROP} data-testid={OVERLAY_MARKER}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`${DIALOG_BASE} ${shouldAnimate ? "animate-panel-up" : ""}`}
      >
        <div className={TOP_BAR_OFFSET}>
          <div className={TOP_BAR}>
            <NeighbourLink neighbour={neighbours.prev} align="left" />
            <Button
              variant="icon"
              size="lg"
              aria-label={uk.preview.close}
              onClick={close}
              className={OVERLAY_FOCUS}
            >
              <Icon name="close" />
            </Button>
            <NeighbourLink neighbour={neighbours.next} align="right" />
          </div>
        </div>
        <div className={FRAME_CLIP}>
          <div ref={scrollRef} className={FRAME_SCROLL}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Prev/next, absolutely positioned either side of the centred close button (a flex row would push
 * it off-centre at an end). `invisible`, not `hidden`, at an end: the control keeps its space, so
 * the layout does not shift. Prefetched on purpose (the two likeliest next navigations), unlike
 * every other animal link.
 */
function NeighbourLink({
  neighbour,
  align,
}: {
  neighbour: OverlayNeighbour;
  align: "left" | "right";
}) {
  // `left-0`/`right-0` now that TOP_BAR carries no padding of its own
  // (removed 2026-10-28) - an absolutely positioned child's containing
  // block is the parent's padding box, so with zero padding this already
  // lands it exactly at TOP_BAR's own outer edge, no inset.
  const side = align === "left" ? "left-0" : "right-0";
  const chevron = <Icon name={align === "left" ? "chevron-left" : "chevron-right"} />;
  if (neighbour === null) {
    return (
      <span
        aria-hidden="true"
        className={`invisible absolute top-1/2 -translate-y-1/2 ${side} ${buttonClass("icon", "lg")}`}
      >
        {chevron}
      </span>
    );
  }
  return (
    <LinkButton
      variant="icon"
      size="lg"
      href={neighbour.href}
      replace
      onClick={skipNextEntranceAnimation}
      data-testid={align === "left" ? "overlay-prev" : "overlay-next"}
      aria-label={`${align === "left" ? uk.detail.prev : uk.detail.next}: ${neighbour.name}`}
      className={`absolute top-1/2 -translate-y-1/2 ${side} ${OVERLAY_FOCUS}`}
    >
      {chevron}
    </LinkButton>
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
      skipNextEntranceAnimation();
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
