import type { Reasoned } from "./ratchet";

/**
 * Raw hex colours in code. Colour belongs in the tokens in `app/globals.css`; each entry here is
 * a value that has no token yet, with a ceiling that can only go down.
 */
export const RAW_HEX: Readonly<Record<string, Reasoned>> = {
  "kabinet/confirm-route.ts": {
    max: 5,
    reason:
      "Serves a standalone HTML page from a route handler: inline <style>, no Tailwind, no tokens.",
  },
  "features/reveal/ContactRevealDialog.tsx": {
    max: 1,
    reason: "Modal backdrop tint with no token; folds into the kit Modal (DS PR 3b).",
  },
  "features/gallery/FilterSheet.tsx": {
    max: 1,
    reason: "Modal backdrop tint with no token; folds into the kit Sheet (DS PR 2/3a).",
  },
  "features/discovery/SwipeCard.tsx": {
    max: 2,
    reason: "Fill of the stacked cards behind the deck's top card; no token, deck is out of 3a-3d.",
  },
};

/** Raw `<img>`. Photos go through `next/image` and its R2 loader (`ui/Photo` once it exists). */
export const RAW_IMG: Readonly<Record<string, Reasoned>> = {};
