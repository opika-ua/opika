import localFont from "next/font/local";

/**
 * Both families are self-hosted through `next/font/local` (nothing loads from Google), subset by
 * alphabet range, not by today's words (each font folder's README has the ranges and the command).
 * Both are preloaded: the UI face sets the body text and the display face the page heading, all
 * above the fold on every route, so finding them late in the CSS means a visible swap. After the
 * subset the pair is under 90 KB. Licence and provenance sit beside each file.
 * The loaders' variables carry the typeface names; `globals.css` maps the role names onto them.
 */

// Climate Crisis, YEAR axis pinned to its default (see ./fonts/brand-display/README.md).
export const brandDisplay = localFont({
  src: [{ path: "./fonts/brand-display/ClimateCrisis-static.woff2", weight: "400" }],
  display: "swap",
  preload: true,
  variable: "--font-climate-crisis",
});

// «Opika Variable», an OFL derivative of Bellota Text, one file for weights 300-700.
export const brandUi = localFont({
  src: [{ path: "./fonts/brand-ui/OpikaVariable-wght.woff2" }],
  weight: "300 700",
  display: "swap",
  preload: true,
  variable: "--font-bellota-text",
});
