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
 * `reset()`, not a manual re-navigation: it retries rendering the current
 * route with its current `searchParams` unchanged, so "Спробувати ще раз"
 * naturally re-applies whatever filters/sort were already in the URL — the
 * URL is the state, and this file never has to know what it was.
 *
 * JS-only: Next.js requires error boundaries to be Client Components, so
 * with JavaScript disabled this file cannot mount at all — see
 * `docs/gallery-contract-decisions.md`'s note. With JS disabled, a failed
 * navigation is a failed real page load; Next's own default error page (or
 * the browser's) takes over instead.
 *
 * Deviation, E4 — "Never full-screen … Header, rail and sort stay usable"
 * is NOT met here, and this is recorded rather than silently shipped.
 * Next.js error boundaries replace everything the failing Server
 * Component's render tree would have produced — and `page.tsx`'s header
 * and rail are inside that same tree, constructed only after
 * `Promise.all([cities.list(), gallery.list()])` resolves. When that
 * throws, nothing downstream of it — including the header and rail —
 * ever rendered in the first place, so there is no "existing chrome" for
 * this file to render the error card into. Making the mock's claim true
 * would mean moving the header/rail into a `layout.tsx` sibling to this
 * route (so they render independently of the data fetch that can fail) —
 * a real restructuring, not a value this file alone can fix, and not
 * built this phase. Filed as a follow-up, not fixed with a CSS change
 * that would only look right without being right.
 */
export default function GalleryError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
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
        <button
          type="button"
          data-testid="gallery-error-retry"
          onClick={reset}
          className="min-h-14 px-6 rounded-rg-button bg-rg-ink text-rg-surface font-medium text-[15px] cursor-pointer focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px]"
        >
          {uk.galleryError.action}
        </button>
      </div>
    </div>
  );
}
