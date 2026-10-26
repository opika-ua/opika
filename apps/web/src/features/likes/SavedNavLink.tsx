"use client";

import { uk } from "@opika/i18n";
import Link from "next/link";
import { useEffect, useState } from "react";
import { readLikesStore, subscribeToLikesChanges } from "./likes-store";

interface SavedNavLinkProps {
  className: string;
}

/**
 * The header's «Збережені» link — only when something's actually saved.
 * Oleksii, from a live screenshot: "also show Збережені tab in header only
 * if we have something saved otherwise hide it."
 *
 * Read lazily in an effect, not at render, same reasoning `SaveButton.tsx`
 * already documents for the identical constraint: `localStorage` doesn't
 * exist during server rendering, and reading it during the client's first
 * render (before hydration) would mismatch what the server sent. Renders
 * nothing until that effect runs — a page with saves pops the link in a
 * moment after mount rather than risking a hydration mismatch, the same
 * trade-off `SaveButton` already makes for its own saved/unsaved state.
 *
 * `readLikesStore().items.length`, not `useSavedCards()`: the header only
 * needs to know *whether* anything is saved, not fetch each saved card's
 * full data from the server — that hook exists for the saved page itself,
 * which actually renders the cards.
 */
export function SavedNavLink({ className }: SavedNavLinkProps) {
  const [hasSaved, setHasSaved] = useState(false);

  useEffect(() => {
    const read = () => setHasSaved(readLikesStore().items.length > 0);
    read();
    return subscribeToLikesChanges(read);
  }, []);

  if (!hasSaved) return null;

  return (
    <Link href="/zberezheni" data-testid="nav-saved" className={className}>
      {uk.nav.saved}
    </Link>
  );
}
