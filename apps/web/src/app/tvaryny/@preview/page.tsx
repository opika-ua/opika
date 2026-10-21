/**
 * The `@preview` slot at `/tvaryny` itself. On a client navigation Next
 * keeps a parallel slot's last page when the new URL has no match in that
 * slot, so without this file a link from inside the animal overlay to the
 * gallery (the page's «Не зараз», its back links, the wordmark) would change
 * the list behind and leave the overlay open over it. With it, the slot
 * matches and renders nothing. `default.tsx` still covers a hard load of
 * every other route under `/tvaryny`.
 */
export default function NoOverlay() {
  return null;
}
