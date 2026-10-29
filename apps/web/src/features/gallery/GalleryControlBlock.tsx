"use client";

import { ukPublic as uk } from "@opika/i18n/public";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";

/**
 * gallery-v3 (Figma `58:1617`) control block: «Фільтр» toggles the
 * dropdown row (city/age/size/species/sex + sort) open or closed – it
 * does not open `FilterSheet`'s modal. Desktop only, unchanged by the
 * option-B sketch's mobile layout below.
 *
 * A Client Component, not a `<details>`/`<summary>` disclosure: the
 * toggle's row 1 (title, the button itself) and row 2 (the dropdowns) are
 * two visually separate flex rows, not "a summary followed by its own
 * content" – the one shape `<details>` can express natively. Defaults to
 * **open** so a no-JS visitor still sees and can use every filter
 * (degraded, not broken); only the *collapsing* ability needs JS.
 *
 * Below 1024px (option-B sketch, `filter-row-option-B.png`): a third,
 * mobile-only row sits between row 1 and row 2 - species full width, then
 * `trailing` (`FilterSheet`'s trigger) and `mobileSort` side by side.
 * Row 2 stays `desktop:`-only and untouched; this is a third row, not a
 * rework of its grid-collapse animation - `trailing` moved out of row 1
 * into it (option-B puts the title alone in row 1 below 1024px), and
 * `mobileSpecies`/`mobileSort` are new, second DOM copies of controls row
 * 2 already renders at `desktop:`, each hidden by CSS at the width the
 * other owns - the same responsive pattern this file already uses for
 * `trailing` vs. the toggle button below. **Decision taken** (no prior
 * pattern in this codebase for a mobile-only row of its own): a new row
 * rather than reworking row 2's own `hidden ... desktop:grid` to also
 * serve mobile, since row 2's grid-rows collapse animation and `inert`
 * wiring are desktop-specific (`gallery-filter-toggle`'s open/close
 * state) and have no mobile equivalent to animate.
 */
export function GalleryControlBlock({
  title,
  trailing,
  mobileSpecies,
  mobileSort,
  children,
}: {
  title: ReactNode;
  /** `FilterSheet`'s own trigger - self-hides below `desktop:` via its own class; rendered in the mobile-only row now, not row 1. */
  trailing: ReactNode;
  /** The species toggle, full width, mobile-only row. A second DOM copy of row 2's own (desktop) instance. */
  mobileSpecies?: ReactNode;
  /** A second `GallerySortToggle` instance, mobile-only, beside `trailing`. */
  mobileSort?: ReactNode;
  /** Row 2's content (desktop only) – the dropdowns and the sort toggle. */
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  /**
   * Whether the row has finished expanding and can safely overflow - found on review
   * (a real bug a live deployment surfaced, not a looks concern): `overflow-hidden`
   * below is required *while the grid track is animating* (0fr↔1fr) so the row's
   * content doesn't spill out mid-transition, but it also clips every dropdown's own
   * popup panel (`GalleryFilterDropdowns.tsx`'s `absolute` `fieldset`), which must
   * extend below this row once it's actually open - permanently, not just once the
   * animation completes. `document.elementFromPoint()` against a real running page
   * confirmed the popup was rendering at the right coordinates with the right
   * `position: absolute`, just invisible, painted under the gallery grid below it.
   *
   * Starts equal to `open` (both `true` on mount) so neither a no-JS visitor nor the
   * very first paint ever sees a clipped row - there is no animation to protect
   * against before any state change has happened. Reset to `false` synchronously the
   * instant `open` becomes `false` (closing has to clip immediately, the same way
   * opening does), and only set back to `true` once the *opening* transition actually
   * finishes (`onTransitionEnd` below) - never during a close, and never speculatively
   * before the row has actually finished growing.
   *
   * `prefers-reduced-motion` is its own case, not just "the same thing, faster": a
   * zero-duration CSS transition (`motion-reduce:duration-0` above) never fires
   * `transitionend` at all, so a visitor with that preference would never see
   * `expanded` become `true` again after the first close - every dropdown would stay
   * permanently clipped from then on. Checked directly rather than waited for.
   */
  const [expanded, setExpanded] = useState(open);

  useEffect(() => {
    if (!open) {
      setExpanded(false);
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setExpanded(true);
  }, [open]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        {title}
        <div className="hidden desktop:block">
          <Button
            variant="primary"
            size="lg"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="gallery-filter-row"
            data-testid="gallery-filter-toggle"
          >
            <Icon name="filter" />
            {uk.feed.filtersLabel}
          </Button>
        </div>
      </div>

      {/* Mobile-only row (option-B sketch): species full width, then «Фільтр» + sort side by side. Gone entirely at desktop:, where row 2 below is the real filter row. */}
      <div className="flex flex-col gap-3 desktop:hidden">
        {mobileSpecies}
        <div className="flex items-center gap-3">
          {trailing}
          {mobileSort}
        </div>
      </div>

      {/*
        Always mounted, never a `hidden` attribute plus a `desktop:flex`
        class: the UA stylesheet's `[hidden] { display: none }` rule is a
        lower-precedence *origin* than any author stylesheet rule (Tailwind's
        utilities included), so `desktop:flex` would have kept winning at
        >=1024 regardless of the `hidden` attribute. `hidden` as a Tailwind
        utility class (not the HTML attribute) doesn't have that problem -
        it's an ordinary author-stylesheet rule `desktop:grid` already
        overrides correctly at the breakpoint, the same mechanism every other
        `hidden ... desktop:*` pair in this codebase already relies on.

        The row used to unmount on close (`{open && (...)}`) instead of this.
        Oleksii, from a live screenshot: "it would be nice if you'd animate
        height change on filter appear/disappear" — an unmounted element has
        no height to animate *from*, so this switches to the grid-rows 0fr/1fr
        technique: a single-row grid track that transitions between 0fr and
        1fr, with `overflow-hidden` on the one grid item clipping its content
        while the track is collapsing. No motion library - CSS only, per the
        standing "prefer native Web APIs" rule - and `motion-reduce:` drops
        the transition to instant for anyone who's asked for that.

        Always mounted now means `aria-hidden`/`inert` do what unmounting used
        to: a screen reader doesn't announce the row while closed, and
        `inert` additionally pulls every dropdown and the sort toggle out of
        Tab order - without it they'd stay reachable, focusably, at zero
        height, which is worse than the old unmounted version, not just
        different from it.

        Found on review: `overflow-hidden` on the one grid item below can't be
        permanent the way the comment above describes - it also clips every
        dropdown's own popup (`GalleryFilterDropdowns.tsx`), which has to extend
        below this row once it's actually open. `onTransitionEnd` here switches it
        to `overflow-visible` the moment the *opening* transition genuinely
        finishes (`expanded`, above) - `transitionend` also fires for a property
        change on a child, so the `propertyName` check keeps this reacting to the
        grid track's own transition specifically, not some unrelated one bubbling
        up through it.
      */}
      <div
        id="gallery-filter-row"
        data-testid="gallery-filter-row"
        aria-hidden={open ? undefined : "true"}
        inert={open ? undefined : true}
        onTransitionEnd={(event) => {
          if (event.propertyName === "grid-template-rows" && open) setExpanded(true);
        }}
        // Inline: a 0fr/1fr track has no token class, and the duration token goes to 0 under reduced motion.
        style={{
          gridTemplateRows: open ? "1fr" : "0fr",
          transition: "grid-template-rows var(--duration-settle) var(--ease-standard)",
        }}
        className="hidden grid-cols-1 desktop:grid"
      >
        <div className={expanded ? "overflow-visible" : "overflow-hidden"}>
          {/*
            No `flex-wrap` here (pet card PR 1b): seven dropdowns (eight since
            the sex-filter feature) no longer fit one line at any desktop
            width, and a wrapping row would push the
            sort switch onto a line of its own. The dropdowns wrap inside their
            own container instead (`GalleryFilterDropdowns`, `min-w-0 flex-1`),
            and `items-start` keeps the switch level with their first line
            rather than centred on all of them.
          */}
          <div className="flex items-start justify-between gap-4">{children}</div>
        </div>
      </div>
    </div>
  );
}
