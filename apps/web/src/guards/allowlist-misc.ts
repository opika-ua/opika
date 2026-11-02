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
  "seo/og-image.tsx": {
    max: 7,
    reason:
      "The link-preview image is drawn by satori outside the DOM: no CSS variables, so the brand tokens are repeated as literals.",
  },
};

/** Raw `<img>`. Photos go through `next/image` and its R2 loader (`ui/Photo` once it exists). */
export const RAW_IMG: Readonly<Record<string, Reasoned>> = {
  "seo/og-image.tsx": {
    max: 3,
    reason: "satori (next/og) renders plain img elements only; next/image does not exist there.",
  },
};
