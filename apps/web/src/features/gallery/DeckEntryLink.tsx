"use client";

import Link from "next/link";
import { markEnteringFromGallery } from "../discovery/deck-entry-marker";

/**
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
    <Link
      href={href}
      className={className}
      data-testid={testId}
      prefetch={false}
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
    </Link>
  );
}
