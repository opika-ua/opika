"use client";

import { uk } from "@opika/i18n";
import { useEffect, useRef } from "react";
import { Button, buttonClass } from "../../../ui/Button";
import { cx } from "../../../ui/cx";
import { Heading } from "../../../ui/Heading";
import { Panel } from "../../../ui/Panel";
import { Text } from "../../../ui/Text";

/**
 * E5, found by re-investigating `/tvaryny`'s own `error.tsx` rationale
 * rather than trusting it: Next.js error boundaries nest by segment, and
 * `/tvaryny/gortaty` has no `error.tsx` of its own - so without this file,
 * a failure in `GortatyPage`'s own server-side `cities.list()` call (needed
 * for the deck header's inherited-filters phrase) would be caught by the
 * *gallery's* `error.tsx` instead, rendering gallery-specific copy
 * («Ваші фільтри збережені») for a deck failure that has nothing to do
 * with filters. Confirmed by reading how error-boundary nesting actually
 * works in this framework, not assumed from the two routes merely sharing
 * a `/tvaryny` URL prefix.
 *
 * Reuses `uk.errors.loadFailed` rather than `uk.galleryError` - the same
 * generic, already-neutral copy `SwipeDeck`'s own client-side error state
 * uses for the identical class of failure (a server-side load that
 * couldn't complete), so a visitor sees one consistent voice for "the deck
 * didn't load" regardless of whether the failure happened before or after
 * the client took over.
 *
 * `retry()`, not `reset()` - same finding as `/tvaryny/error.tsx`'s own
 * comment: `reset()` alone clears the boundary without re-running
 * `GortatyPage`'s Server Component, so it cannot recover from the
 * server-side `cities.list()` failure that reaches this file. `retry()`
 * calls `router.refresh()` first, which is what actually gives a working
 * `cities.list()` on the next attempt a chance to render.
 */
export default function GortatyError({
  retry,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  retry: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <>
      {/* PR B, the SEO review of page titles - see `/tvaryny/error.tsx`'s own comment
          on this same tag for why it's here rather than a `metadata` export. */}
      <meta name="robots" content="noindex, nofollow" />
      <div className="flex min-h-dvh items-center justify-center bg-page p-4">
        <Panel padding="lg" className="animate-fade-in w-full max-w-140">
          <div
            role="alert"
            aria-live="assertive"
            data-testid="gortaty-error"
            className="flex flex-col items-start gap-4"
          >
            <Text look="hint" className="uppercase tracking-wider">
              {uk.errors.loadFailed.eyebrow}
            </Text>
            <Heading
              level={1}
              look="display-l"
              ref={headingRef}
              tabIndex={-1}
              className="outline-none"
            >
              {uk.errors.loadFailed.title}
            </Heading>
            <Text look="lead" className="text-ink-2">
              {uk.errors.loadFailed.body}
            </Text>
            <div className="flex flex-wrap items-center gap-4">
              <Button type="button" data-testid="gortaty-error-retry" onClick={retry}>
                {uk.errors.loadFailed.action}
              </Button>
              {/* A genuine `<a href>`, not `next/link`'s `Link` - same reason
              as `/tvaryny/error.tsx`'s own escape hatch: a `Link` click
              inside an active error boundary soft-navigates within the
              segment Next already knows just errored, and doesn't
              actually leave. */}
              <a
                href="/tvaryny"
                data-testid="gortaty-error-back-to-list"
                className={cx(buttonClass("ghost"), "underline")}
              >
                {uk.feed.backToList}
              </a>
            </div>
          </div>
        </Panel>
      </div>
    </>
  );
}
