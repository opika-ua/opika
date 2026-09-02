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
    <Link href={href} className={className} onClick={markEnteringFromGallery}>
      {children}
    </Link>
  );
}
