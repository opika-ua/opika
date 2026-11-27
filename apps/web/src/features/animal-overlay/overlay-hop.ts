import { createContext } from "react";

/**
 * Inside the overlay, a link to another animal swaps it in place, as «Наступний» does: replace,
 * not push, so ✕ and Back still return to the list, and no second entrance. `null` on the full
 * page. Its own module so the full page's bundle does not pull in the overlay.
 */
export const OverlayHopContext = createContext<((href: string) => void) | null>(null);
