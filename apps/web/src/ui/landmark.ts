/**
 * The one id every page's `<main>` carries, so the skip link has a single target. `tabIndex -1`
 * lets the link move focus there (a bare `<main>` takes only scroll, not focus). Spread it onto
 * a hand-written `<main>`; `Container as="main"` applies it itself.
 */
export const MAIN_CONTENT_ID = "main-content";
export const MAIN_LANDMARK = { id: MAIN_CONTENT_ID, tabIndex: -1 } as const;
