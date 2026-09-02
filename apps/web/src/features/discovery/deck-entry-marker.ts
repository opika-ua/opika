/**
 * Set by the gallery's own entry link (`DeckEntryLink.tsx`) right before it
 * navigates — read once by `DeckScreen` to tell "the user just came from the
 * gallery, in this tab" apart from "this route was reached directly" (a
 * reload, a bookmark, a shared link). `sessionStorage`, not a URL param: it
 * needs to survive exactly one navigation and be gone after, which a query
 * string doesn't do on its own.
 *
 * Its own file, not living inside `DeckScreen.tsx`: `DeckEntryLink` is
 * rendered on every `/tvaryny` page view (the gallery's entry control), and
 * `DeckScreen.tsx` statically imports the deck's full data hook, `SwipeDeck`,
 * and the browser-side oRPC client (`use-feed-deck.ts` → `browser-client.ts`,
 * `new RPCLink(...)` at module scope). Importing `markEnteringFromGallery`
 * from `DeckScreen.tsx` directly pulled that whole subtree into the
 * gallery's own bundle — confirmed against a real production build, not
 * assumed: the deck's chunk showed up in `/tvaryny`'s eager `<script src>`
 * list. This module has no such dependency, so the gallery's bundle stays
 * exactly what it was.
 */
const FROM_GALLERY_KEY = "opika:deck-entered-from-gallery";

export function markEnteringFromGallery(): void {
  sessionStorage.setItem(FROM_GALLERY_KEY, "1");
}

/** Reads and clears the marker in one step — a second read must not get a
 * free pass from a navigation that already happened. */
export function consumeEnteredFromGalleryMarker(): boolean {
  if (sessionStorage.getItem(FROM_GALLERY_KEY) === null) return false;
  sessionStorage.removeItem(FROM_GALLERY_KEY);
  return true;
}
