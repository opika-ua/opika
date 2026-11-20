/**
 * Focus for a target the page lands on before any input (a `#hash` link, an error screen). Chromium
 * counts script focus with no prior input as keyboard focus and rings a heading nobody tabbed to;
 * `focusVisible: false` says otherwise. Focus moves after a key press keep their ring.
 */
export function focusOnArrival(
  element: HTMLElement | null | undefined,
  { preventScroll = false }: { preventScroll?: boolean } = {},
): void {
  element?.focus({ preventScroll, focusVisible: false });
}
