"use client";

import { markEnteringFromGallery } from "../discovery/deck-entry-marker";

/**
 * **No production caller since the gallery-v3 redesign** (Oleksii,
 * mid-build: "let's hide access to Гортати по одній page for now as
 * well") — kept, not deleted, because that hiding is a documented
 * temporary narrowing (`docs/standing-constraints.md`'s commitment #8
 * row, GV3-Q3), not a removal of the feature. A `git revert` could bring
 * deleted code back, but deleting now and reverting later is still two
 * reviewed PRs of churn for code that was never actually meant to leave;
 * keeping it costs nothing a dead-code check would catch, since
 * `deckEntryHref` (`filter-url.ts`) still has real tests of its own.
 *
 * The one piece of `page.tsx`'s (Server Component) deck entry control that
 * has to be a Client Component: marking `sessionStorage` right before the
 * navigation fires. A Server Component cannot pass an `onClick` across the
 * client boundary — functions aren't serializable props, Server Actions
 * aside — so this thin wrapper exists purely to hold that one handler.
 * `deck-entry-marker.ts`'s own doc comment explains what it's for, and why
 * it's a separate module from `DeckScreen.tsx` rather than living there.
 *
 * `prefetch={false}` — confirmed necessary, not a micro-optimisation: both
 * the desktop and mobile instances of this control are always present in
 * the DOM (only CSS-hidden by breakpoint, never unmounted), so `next/link`'s
 * default viewport-triggered prefetch fired `/tvaryny/gortaty`'s full
 * Server Component render — including its own `cities.list()` call — from
 * *every* `/tvaryny` page view, from both instances independently. Caught
 * by `gallery-layout.harness.ts` failing with a real 429 from `proxy.ts`'s
 * rate limiter, not assumed: a single gallery load was issuing 6-7 requests
 * where it used to issue 1-3, entirely from prefetches nothing on the page
 * was about to need.
 *
 * **A plain `<a>` since designer round 1, S4, not `next/link`.** The gallery's
 * animal overlay is an intercepting route for `/tvaryny/[animalId]`, and Next
 * 16.3 matches it against every client navigation from under `/tvaryny`:
 * `/tvaryny/gortaty` fits `[animalId]`, so a client navigation to the deck
 * was rewritten into the overlay's slot, leaving the gallery on screen under
 * the deck's URL (`gallery-animal-overlay.harness.ts`, "the deck's entry link
 * still reaches the deck, not an overlay", failed exactly so). A document load is never
 * intercepted, wherever the app is hosted. It also never prefetches, so the
 * rate-limit reasoning above holds with nothing to switch off. The marker
 * below lives in `sessionStorage`, which a document load in the same tab
 * keeps.
 */
export function DeckEntryLink({
  href,
  className,
  children,
  testId,
}: {
  href: string;
  className: string;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <a
      href={href}
      className={className}
      data-testid={testId}
      onClick={(event) => {
        // A modifier/middle click opens a new tab rather than navigating
        // this one — sessionStorage is copied into that new tab (a real
        // browser behaviour, not a corner case), so marking it here would
        // tell the *new* tab's deck it's safe to call router.back(), when
        // that tab's own history has nothing behind it at all.
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }
        markEnteringFromGallery();
      }}
    >
      {children}
    </a>
  );
}
