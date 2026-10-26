"use client";

import { uk } from "@opika/i18n";
import type { ReactNode } from "react";
import { useState } from "react";
import { FilterIcon } from "./icons";

/**
 * gallery-v3 (Figma `58:1617`) control block: «Фільтр» toggles the
 * dropdown row (city/age/size/species/fur + sort) open or closed — it does not open
 * `FilterSheet`'s modal. Designer clarification (verbatim, mid-build):
 * "this Filters button shows that search filters below or hides if they
 * are shown." Desktop only for now — "we don't have [a] mobile section in
 * Figma yet, so do only desktop for now" — mobile/tablet keep the
 * pre-existing `FilterSheet` modal (rendered by the caller as `children`
 * of this component's row 1, where it stays `desktop:hidden` as before
 * this PR).
 *
 * A Client Component, not a `<details>`/`<summary>` disclosure: the
 * toggle's row 1 (title, `trailing`, the button itself) and row 2 (the
 * dropdowns) are two visually separate flex rows, not "a summary followed
 * by its own content" — the one shape `<details>` can express natively.
 * Defaults to **open** so a no-JS visitor still sees and can use every
 * filter (degraded, not broken — the same posture `ReplaceNav`'s own
 * comment states for its own JS enhancement); only the *collapsing*
 * ability needs JS.
 */
export function GalleryControlBlock({
  title,
  trailing,
  children,
}: {
  title: ReactNode;
  /** `FilterSheet`'s own trigger (at narrow widths — it's `desktop:hidden`) — rendered before the toggle button. */
  trailing: ReactNode;
  /** Row 2's content — the five dropdowns and the sort toggle. */
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        {title}
        <div className="flex items-center gap-3">
          {trailing}
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="gallery-filter-row"
            data-testid="gallery-filter-toggle"
            className="hidden h-13 cursor-pointer items-center gap-2 rounded-brand-field bg-brand-ink px-6 font-brand-ui text-[20px]/[1.2] font-semibold text-brand-on-ink tracking-[-0.2px] focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-brand-accent focus-visible:outline-offset-[3px] desktop:inline-flex"
          >
            <FilterIcon className="size-6" />
            {uk.feed.filtersLabel}
          </button>
        </div>
      </div>

      {/*
        Always mounted, never a `hidden` attribute plus a `desktop:flex`
        class: the UA stylesheet's `[hidden] { display: none }` rule is a
        lower-precedence *origin* than any author stylesheet rule (Tailwind's
        utilities included), so `desktop:flex` would have kept winning at
        >=1024 regardless of the `hidden` attribute. `hidden` as a Tailwind
        utility class (not the HTML attribute) doesn't have that problem —
        it's an ordinary author-stylesheet rule `desktop:grid` already
        overrides correctly at the breakpoint, the same mechanism every other
        `hidden ... desktop:*` pair in this codebase already relies on.

        The row used to unmount on close (`{open && (...)}`) instead of this.
        Oleksii, from a live screenshot: "it would be nice if you'd animate
        height change on filter appear/disappear" — an unmounted element has
        no height to animate *from*, so this switches to the grid-rows 0fr/1fr
        technique: a single-row grid track that transitions between 0fr and
        1fr, with `overflow-hidden` on the one grid item clipping its content
        while the track is collapsing. No motion library — CSS only, per the
        standing "prefer native Web APIs" rule — and `motion-reduce:` drops
        the transition to instant for anyone who's asked for that.

        Always mounted now means `aria-hidden`/`inert` do what unmounting used
        to: a screen reader doesn't announce the row while closed, and
        `inert` additionally pulls every dropdown and the sort toggle out of
        Tab order — without it they'd stay reachable, focusably, at zero
        height, which is worse than the old unmounted version, not just
        different from it.
      */}
      <div
        id="gallery-filter-row"
        data-testid="gallery-filter-row"
        aria-hidden={open ? undefined : "true"}
        inert={open ? undefined : true}
        className={`hidden grid-cols-1 transition-[grid-template-rows] duration-300 ease-out motion-reduce:duration-0 desktop:grid ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4">{children}</div>
        </div>
      </div>
    </div>
  );
}
