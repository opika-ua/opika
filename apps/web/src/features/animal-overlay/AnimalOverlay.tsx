"use client";

import { uk } from "@opika/i18n";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { CircleButton } from "../animal-detail/CircleButton";
import { useModalFocus } from "../controls/useModalFocus";
import { useScrollingClass } from "../controls/useScrollingClass";

/**
 * Pet card PR 5 (Figma `75:425`), replacing designer feedback batch A's dark
 * Dribbble-style backdrop with the pet card's own look: `SiteHeader` stays
 * fully visible at the top - it's rendered inside `app/tvaryny/page.tsx`
 * itself (not a root layout), `position: sticky top-0 z-30`, `min-h-16
 * desktop:min-h-18` (64/72px).
 *
 * **This backdrop covers the *entire* viewport (`inset-0`), under the
 * header's own `z-30` (`z-20` here).** Two earlier versions tried
 * narrower shapes and both broke something a real screenshot caught, not
 * review:
 * - Starting the backdrop's own box *below* the header (`top-16
 *   desktop:top-18`) avoided the click-interception a full-viewport `z-20`
 *   box was once assumed to cause here, but gave the header *its own*,
 *   separate `backdrop-filter` (see git history) - two adjacent elements
 *   each blurring only what's directly behind their own box can't pull
 *   blur context across the seam between them, so a visible hard edge
 *   showed exactly at the header's bottom border, even with both blurs
 *   set to the same radius and the same tint colour.
 * - The click-interception concern itself turns out not to apply to
 *   *this* geometry: the worry was a full-width `z-30` layer intercepting
 *   pointer events across its whole rectangle regardless of paint order,
 *   but hit-testing is still geometric - the header's own box only ever
 *   spans `y: [0, 72px]`, and the close button sits below that, at a
 *   point the header's box never covers, so there is nothing for the
 *   header to intercept there. Confirmed live, not assumed: every control
 *   in the top bar is independently click-tested after this change.
 *
 * One backdrop blurring the whole viewport, with the header riding on
 * top of it with no fill or blur of its own (`globals.css`'s `:has()`
 * rule), is what actually matches the reference: no seam, because
 * there's only one blur pass to have one.
 *
 * `pt-16 desktop:pt-18` on `DIALOG` below replaces the vertical gap the
 * old `top-16`-offset backdrop used to provide for free - the header no
 * longer carves out its own space, so the dialog's own content has to
 * start that far down instead, to land the close button and the
 * prev/next row at the same place the reference shows.
 *
 * Fill: the Figma frame's own tint layer is a real `backdrop-filter: blur`
 * over the live gallery, not a flat colour - confirmed against the Figma
 * file directly (its blurred layer shows real, if illegible, card shapes
 * through the tint), not just the two static reference PNGs, which
 * flatten the effect. Semi-transparent, not opaque, so the real gallery -
 * whatever it's scrolled to - shows through softly, matching the
 * reference. This is also *safer* than the flat-colour approximation
 * this file tried first: a strong blur destroys text legibility more
 * thoroughly than the low opacity that caused batch A's ghost-header-text
 * bug did, not less.
 *
 * `[background-color:color-mix(in_srgb,...)]`, not Tailwind's own
 * `bg-brand-accent/30` opacity modifier: Tailwind v4's `/opacity` modifier
 * mixes in OKLab by default (`oklab(... / 0.3)`), which read as a visibly
 * different shade than a literal `color-mix(in srgb, ...)` the one time
 * this project had both in play at once (the header's own short-lived
 * separate tint, before this became one backdrop) - spelled out
 * explicitly here so nothing downstream has to match it by coincidence.
 */
const BACKDROP =
  "fixed inset-0 z-20 backdrop-blur-2xl [background-color:color-mix(in_srgb,var(--color-brand-accent)_30%,transparent)]";
/**
 * `SiteHeader` (`app/tvaryny/page.tsx`) stays opaque on the gallery itself -
 * it has to occlude the grid scrolling under it, `sticky`. Here, it has no
 * fill or blur of its own (`globals.css`'s `:has()` rule) and rides on top
 * of `BACKDROP`'s one continuous blur instead - see `BACKDROP`'s own
 * comment for why a second, separate blur on the header produced a seam.
 * Flipping the header's fill per-render would need a prop threaded from
 * this component, two routes away, into a header neither owns; `:has()`
 * reaches it with no new prop and no risk to the normal-page case, which
 * never matches the selector.
 */
const OVERLAY_MARKER = "pet-card-overlay-open";
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
const DIALOG = "relative flex h-full flex-col pt-16 outline-none desktop:pt-18";
/**
 * The close button and the «Попередній»/«Наступний» row sit directly on the
 * peach backdrop (no separate dark strip, unlike batch A) - roughly one
 * horizontal band, matching the reference screenshot's vertical rhythm.
 *
 * `max-w-[1084px] mx-auto`: the Figma frame's own prev/next row
 * (`75:714`) is exactly as wide as the panel below it, not the full
 * viewport - a real screenshot caught the labels sitting far out past the
 * panel's own edges, near the viewport corners, which this row's earlier
 * full-width `justify-between` produced by construction. `NeighbourLink`'s
 * `left-0`/`right-0` resolve against this box's own padding edge, not the
 * viewport, once this is the box they're absolutely positioned inside.
 */
const TOP_BAR =
  "shrink-0 relative mx-auto flex w-full max-w-[1084px] items-center justify-center px-6 py-6 desktop:px-13";
const NEIGHBOUR_LABEL =
  "inline-flex min-h-target items-center px-4 text-[26px] font-semibold text-brand-plum focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-brand-ink focus-visible:outline-offset-[3px]";
/**
 * Only the top corners are rounded (48px, the handoff's own number - no
 * existing token was this large, `--radius-brand-panel-lg` added for it);
 * left, right and bottom are flush to the viewport edge on desktop, where a
 * rounded corner would have nothing to read against. `max-w-[1084px]`: the
 * handoff's own fixed desktop width, centred on the peach backdrop.
 *
 * Two boxes, not one: Chrome's classic (non-overlay) scrollbar isn't
 * reliably clipped by a scrolling element's own `border-radius` - a real
 * screenshot caught the thumb sitting past the rounded corner specifically
 * at the top, where the curve is tightest, even nested inside an
 * `overflow-hidden` ancestor with the matching radius (the scrollbar is
 * its own compositing layer, and `overflow: hidden` + `border-radius`
 * clipping doesn't reliably reach into a child's own layer the way
 * `clip-path` does). `FRAME_CLIP` owns both: `overflow-hidden` for the
 * ordinary case, `clip-path` as the one that actually holds at the
 * curve - same radius, expressed the one way `clip-path`'s `inset()`
 * takes it (top-left, top-right, bottom-right, bottom-left, matching
 * `border-radius`'s own shorthand order). `FRAME_SCROLL`, with no radius
 * of its own, owns the actual `overflow-y-auto` and never paints past
 * its parent's clipped edge.
 */
const FRAME_CLIP =
  "relative flex-1 mx-auto w-full max-w-[1084px] overflow-hidden bg-brand-surface rounded-t-brand-panel-lg [clip-path:inset(0_round_var(--radius-brand-panel-lg)_var(--radius-brand-panel-lg)_0_0)]";
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
  const scrollRef = useScrollingClass<HTMLDivElement>();

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
        className={DIALOG}
      >
        <div className={TOP_BAR}>
          <NeighbourLink neighbour={neighbours.prev} align="left" />
          <CircleButton aria-label={uk.preview.close} onClick={close}>
            <Image
              src="/pet-card/icon-close.svg"
              alt=""
              aria-hidden="true"
              width={24}
              height={24}
              unoptimized
            />
          </CircleButton>
          <NeighbourLink neighbour={neighbours.next} align="right" />
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
  // NOT `left-0`/`right-0`: an absolutely positioned child's containing
  // block is TOP_BAR's padding *box* (content+padding together), whose
  // edges sit at TOP_BAR's own outer edge - an abspos child ignores its
  // parent's padding entirely, a well-known CSS gotcha a real measurement
  // caught (the label was flush with the viewport-ish edge, exactly
  // `padding-right` too far out). Matching TOP_BAR's own `px-6
  // desktop:px-13` directly is what actually lands the label at the
  // padding edge, same as a normal-flow child would get for free.
  const side = align === "left" ? "left-6 desktop:left-13" : "right-6 desktop:right-13";
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
