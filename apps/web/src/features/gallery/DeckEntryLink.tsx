"use client";

import Link from "next/link";
import { markEnteringFromGallery } from "../discovery/DeckScreen";

/**
 * The one piece of `page.tsx`'s (Server Component) deck entry control that
 * has to be a Client Component: marking `sessionStorage` right before the
 * navigation fires. A Server Component cannot pass an `onClick` across the
 * client boundary — functions aren't serializable props, Server Actions
 * aside — so this thin wrapper exists purely to hold that one handler.
 * `DeckScreen`'s own doc comment on `markEnteringFromGallery` explains what
 * it's for.
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
}: {
  href: string;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={className} onClick={markEnteringFromGallery} prefetch={false}>
      {children}
    </Link>
  );
}
