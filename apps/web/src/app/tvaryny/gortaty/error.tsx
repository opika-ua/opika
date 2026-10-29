"use client";

import { uk } from "@opika/i18n";
import { LoadErrorScreen } from "../../../features/gallery/LoadErrorScreen";

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
  return (
    <LoadErrorScreen
      eyebrow={uk.errors.loadFailed.eyebrow}
      title={uk.errors.loadFailed.title}
      body={uk.errors.loadFailed.body}
      retryLabel={uk.errors.loadFailed.action}
      onRetry={retry}
      escapeLabel={uk.feed.backToList}
      testIdPrefix="gortaty-error"
      escapeTestId="gortaty-error-back-to-list"
    />
  );
}
