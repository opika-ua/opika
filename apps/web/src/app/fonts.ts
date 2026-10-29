import localFont from "next/font/local";

/**
 * Both families are self-hosted through `next/font/local` (nothing loads from Google), not subset
 * yet (`docs/build-plan.md` H3.5), and `preload: false`: a preload is paid by every route, and the
 * display face draws one heading per page. Licence and provenance sit beside each file.
 * The loaders' variables carry the typeface names; `globals.css` maps the role names onto them.
 */

// Climate Crisis, YEAR axis pinned to its default (see ./fonts/brand-display/README.md).
export const brandDisplay = localFont({
  src: [{ path: "./fonts/brand-display/ClimateCrisis-static.woff2", weight: "400" }],
  display: "swap",
  preload: false,
  variable: "--font-climate-crisis",
});

// «Opika Variable», an OFL derivative of Bellota Text, one file for weights 300-700.
export const brandUi = localFont({
  src: [{ path: "./fonts/brand-ui/OpikaVariable-wght.woff2" }],
  weight: "300 700",
  display: "swap",
  preload: false,
  variable: "--font-bellota-text",
});
