"use client";

import { uk } from "@opika/i18n";
import { useEffect, useRef } from "react";

/**
 * E4, `docs/design/README.md`'s "Whole-list error (E1/E2)" — and, per that
 * section's own note (added this phase), the ONLY error state this route
 * has. The design also specifies a distinct "Next-page error (E3/E4)" — a
 * strip under the grid that leaves already-visible cards in place — but
 * this architecture cannot reach it: `GalleryPagination`'s links are plain
 * `next/link` navigations (`docs/gallery-contract-decisions.md` §7 settles
 * this deliberately, not an oversight), so a failed page-4 request and a
 * failed first visit are the same event to Next.js's router — this file
 * catches both, and both replace the same content. Building a distinct
 * next-page state would mean a real client-side fetch layer for pagination
 * specifically, undoing §7's decision to satisfy a picture.
 *
 * Next.js's error-boundary convention: this file is a Client Component
 * (required) that implicitly wraps `page.tsx`, catching any error thrown
 * during that Server Component's render — including a `gallery.list` call
 * whose `page` input exceeds `MAX_GALLERY_PAGE` (2000), which fails oRPC's
 * own input-schema validation before the handler runs. That is the "beyond
 * the ceiling" half of the out-of-range behaviour: within `totalPages..
 * MAX_GALLERY_PAGE` clamps server-side to a 200 (see the out-of-range
 * notice, wired in `page.tsx`); above `MAX_GALLERY_PAGE` throws, and lands
 * here.
 *
 * `retry()`, not `reset()` — found via round-2 review, not assumed: Next
 * passes both to every error boundary, and they are not equivalent
 * (`node_modules/next/dist/client/components/error-boundary.js`). `reset()`
 * only clears the boundary's own state and re-renders whatever `page.tsx`
 * last produced client-side — it does NOT re-run the Server Component, so
 * it cannot recover from the kind of failure that reaches this file at all
 * (a server-side `gallery.list` throw). `retry()` calls `router.refresh()`
 * first, which is what actually re-executes `page.tsx` against the current
 * `searchParams`, THEN resets the boundary. Verified end to end against a
 * real production build: with the database stopped, «Спробувати ще раз»
 * with `reset()` left the error card on screen after the database came
 * back up; the same click with `retry()` recovered to the real gallery.
 * "Спробувати ще раз" re-applies whatever filters/sort were already in the
 * URL either way — the URL is the state, and this file never has to know
 * what it was — but only `retry()` actually re-asks the server the
 * question that failed.
 *
 * JS-only: Next.js requires error boundaries to be Client Components, so
 * with JavaScript disabled this file cannot mount at all — see
 * `docs/gallery-contract-decisions.md`'s note. With JS disabled, a failed
 * navigation is a failed real page load; Next's own default error page (or
 * the browser's) takes over instead.
 *
 * Deviation, E4/E5 — "Never full-screen … Header, rail and sort stay usable"
 * is NOT met here, and this is recorded rather than silently shipped.
 * Next.js error boundaries replace everything the failing Server
 * Component's render tree would have produced — and `page.tsx`'s header
 * and rail are inside that same tree, constructed only after
 * `Promise.all([cities.list(), gallery.list()])` resolves. When that
 * throws, nothing downstream of it — including the header and rail —
 * ever rendered in the first place, so there is no "existing chrome" for
 * this file to render the error card into.
 *
 * E5 re-investigated whether "move header/rail into a `layout.tsx`
 * sibling" (E4's own guess) is actually buildable, and found it isn't, for
 * a reason E4 didn't know about: **Next.js layouts cannot read
 * `searchParams` at all** — "Layouts do not rerender on navigation, so
 * they cannot access search params" (Next's own docs). `FilterRail`'s
 * every active-chip state is derived directly from the current URL's
 * search params, so there is no `filters`/`sort` for a `layout.tsx` to
 * render the rail against in the first place. Next's prescribed escape
 * hatch — a Client Component reading `useSearchParams()` — was considered
 * and rejected too, for a sharper reason than mechanics:
 *
 * **A filter rail in this error card would not actually be an escape
 * hatch.** What reaches this file is always a `gallery.list` failure —
 * backend down, a timed-out query, or a 429 from the rate limiter. In
 * every one of those, clicking a filter chip re-issues the same kind of
 * request down the same path, and fails the same way. The only failure
 * class a *different* query would fix is a pathological filter
 * combination producing a slow or malformed query — rare, and not
 * distinguishable from the others once already inside this component. A
 * rail here mostly invites clicking things that won't work either.
 *
 * It would also make inert error UI acquire a real failure mode of its
 * own: rendering `FilterRail` needs city names, which this Client
 * Component doesn't have — fetching them client-side, at the exact moment
 * the backend is already failing, means that fetch can fail too, and now
 * the error boundary needs its *own* loading/error handling. Error UI has
 * one job — render unconditionally — and a network dependency is
 * precisely how that stops being true.
 *
 * **NOT PLANNED, not deferred** — this is the wrong fix, not a postponed
 * one; a future phase shouldn't rebuild it. What actually helps, and
 * shipped instead: a plain link below to bare `/tvaryny` (`gallery-error-
 * show-all`), no query string. It resolves the one real case (a
 * pathological filter combination) by being the cheapest, most-likely-to-
 * succeed request this app can make, and degrades honestly on every other
 * case — if the backend is genuinely down, it fails too, same as retry.
 *
 * The header stays inside this same failing tree, not moved out: E5 added
 * a "Гортати по одні" deck-entry link to `page.tsx`'s header (`filter-
 * url.ts`'s `deckEntryHref`), and that link needs both the current
 * `filters` (from `searchParams`, which — per the above — a `layout.tsx`
 * cannot read) and the real `totalMatching` count (from the very
 * `gallery.list` call that can fail). A header with no state at all could
 * move to a `layout.tsx` safely; this one no longer qualifies.
 */
export default function GalleryError({
  retry,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  retry: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  // "focus moves to the heading" (docs/design/README.md, E1/E2). tabIndex
  // -1: programmatic-only focus target, never a Tab stop of its own.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="font-rg min-h-dvh bg-rg-page flex items-center justify-center p-4">
      <div
        role="alert"
        aria-live="assertive"
        data-testid="gallery-error"
        className="animate-fade-in w-full max-w-140 bg-rg-surface rounded-rg-card p-8 flex flex-col gap-4 items-start"
      >
        <span className="text-[12px]/[16px] font-medium tracking-[0.08em] uppercase text-rg-ink-3">
          {uk.galleryError.eyebrow}
        </span>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-[34px]/[38px] font-bold tracking-[-0.03em] text-rg-ink text-pretty outline-none"
        >
          {uk.galleryError.title}
        </h1>
        <p className="text-[17px]/[26px] text-rg-ink-2 text-pretty">{uk.galleryError.body}</p>
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            data-testid="gallery-error-retry"
            onClick={retry}
            className="min-h-14 px-6 rounded-rg-button bg-rg-ink text-rg-surface font-medium text-[15px] cursor-pointer focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px]"
          >
            {uk.galleryError.action}
          </button>
          {/*
            E5's actual escape hatch — see this file's own top comment for
            why a filter rail here would not be one. A genuine `<a href>`,
            not `next/link`'s `Link`: confirmed by the harness, not
            assumed — a `Link` click here changes the URL bar but leaves
            this same error boundary on screen, because it soft-navigates
            within the segment Next already knows just errored, and only
            `retry()` (the retry button above) or a real navigation
            actually retries it. A hard navigation sidesteps that
            entirely, at the unavoidable cost of a full reload instead of
            a transition.
          */}
          <a
            href="/tvaryny"
            data-testid="gallery-error-show-all"
            className="min-h-14 inline-flex items-center px-6 rounded-rg-button text-rg-ink font-medium text-[15px] underline underline-offset-2 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px]"
          >
            {uk.galleryError.showAll}
          </a>
        </div>
      </div>
    </div>
  );
}
