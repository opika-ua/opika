"use client";

import { uk } from "@opika/i18n";
import { useEffect, useRef } from "react";

/**
 * E5, found by re-investigating `/tvaryny`'s own `error.tsx` rationale
 * rather than trusting it: Next.js error boundaries nest by segment, and
 * `/tvaryny/gortaty` has no `error.tsx` of its own — so without this file,
 * a failure in `GortatyPage`'s own server-side `cities.list()` call (needed
 * for the deck header's inherited-filters phrase) would be caught by the
 * *gallery's* `error.tsx` instead, rendering gallery-specific copy
 * («Ваші фільтри збережені») for a deck failure that has nothing to do
 * with filters. Confirmed by reading how error-boundary nesting actually
 * works in this framework, not assumed from the two routes merely sharing
 * a `/tvaryny` URL prefix.
 *
 * Reuses `uk.errors.loadFailed` rather than `uk.galleryError` — the same
 * generic, already-neutral copy `SwipeDeck`'s own client-side error state
 * uses for the identical class of failure (a server-side load that
 * couldn't complete), so a visitor sees one consistent voice for "the deck
 * didn't load" regardless of whether the failure happened before or after
 * the client took over.
 *
 * `reset()`, not a manual re-navigation — same reasoning as `/tvaryny`'s
 * own `error.tsx`: it retries this route's own render, so a working
 * `cities.list()` on the next attempt is enough, with nothing here needing
 * to remember what failed.
 */
export default function GortatyError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="font-rg min-h-dvh bg-rg-page flex items-center justify-center p-4">
      <div
        role="alert"
        aria-live="assertive"
        data-testid="gortaty-error"
        className="animate-fade-in w-full max-w-140 bg-rg-surface rounded-rg-card p-8 flex flex-col gap-4 items-start"
      >
        <span className="text-[12px]/[16px] font-medium tracking-[0.08em] uppercase text-rg-ink-3">
          {uk.errors.loadFailed.eyebrow}
        </span>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-[34px]/[38px] font-bold tracking-[-0.03em] text-rg-ink text-pretty outline-none"
        >
          {uk.errors.loadFailed.title}
        </h1>
        <p className="text-[17px]/[26px] text-rg-ink-2 text-pretty">{uk.errors.loadFailed.body}</p>
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            data-testid="gortaty-error-retry"
            onClick={reset}
            className="min-h-14 px-6 rounded-rg-button bg-rg-ink text-rg-surface font-medium text-[15px] cursor-pointer focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px]"
          >
            {uk.errors.loadFailed.action}
          </button>
          {/* A genuine `<a href>`, not `next/link`'s `Link` — same reason
              as `/tvaryny/error.tsx`'s own escape hatch: a `Link` click
              inside an active error boundary soft-navigates within the
              segment Next already knows just errored, and doesn't
              actually leave. */}
          <a
            href="/tvaryny"
            data-testid="gortaty-error-back-to-list"
            className="min-h-14 inline-flex items-center px-6 rounded-rg-button text-rg-ink font-medium text-[15px] underline underline-offset-2 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px]"
          >
            {uk.feed.backToList}
          </a>
        </div>
      </div>
    </div>
  );
}
