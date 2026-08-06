import { Commissioner, Literata } from "next/font/google";

/**
 * Two of the three type families from docs/design/README.md
 * ("Typography"): Literata (serif — animal names, screen titles, shelter
 * speech) and Commissioner (sans — all UI). `cyrillic` first because
 * Ukrainian is the only shipped locale (see CLAUDE.md's i18n row); `latin`
 * stays for the Latin punctuation and digits that appear inside Ukrainian
 * copy and for the eventual `en` locale next-intl already carries space
 * for.
 *
 * The third family, IBM Plex Mono, is deliberately not loaded — see the
 * note at the bottom of this file for the measured reason.
 *
 * Weight sets are the current codebase's actual usage
 * (`grep -rn "font-medium\|font-normal" apps/web/src/features/discovery`),
 * not the design doc's full range (Literata 400/500/600, Commissioner
 * 300/400/500/600) — M5 renders only 400/500 of either. Loading 600 and
 * 300 now, for screens M6+ hasn't built yet, is exactly the premature
 * scaffolding CLAUDE.md's milestone-discipline section warns against;
 * widening a `weight` array later is a one-line change with no
 * architectural cost.
 */
export const literata = Literata({
  subsets: ["cyrillic", "latin"],
  display: "swap",
  weight: ["400", "500"],
  variable: "--font-literata",
});

export const commissioner = Commissioner({
  subsets: ["cyrillic", "latin"],
  display: "swap",
  weight: ["400", "500"],
  variable: "--font-commissioner",
});

/**
 * IBM Plex Mono — measured, then dropped.
 *
 * The design's role table assigns it to "quantities and labels only", and
 * in the current codebase that is exactly one element: the ErrorState
 * eyebrow, an 11px uppercase label on the network-error screen — not
 * something most sessions ever see.
 *
 * Measured with `next/font`'s own per-route font requests (Playwright,
 * intercepting `*.woff2` responses against a built `/discovery`): loading
 * it, even for a single weight and even though the ErrorState it styles
 * isn't rendered on that page, added 15,560 bytes to the page's font
 * payload — 11.2% of the total (138,888 bytes with it; 123,328 without).
 * `next/font`-loaded fonts preload on every route their loader call is
 * reachable from once mounted at the root layout, regardless of whether
 * anything on that specific route resolves to their font-family — the
 * cost is paid everywhere, not just on the error screen.
 *
 * Commissioner is already being fetched for the rest of the UI, so
 * replacing `font-mono` with `font-sans` + the existing `tracking-[0.12em]`
 * on that one eyebrow (SwipeDeck.tsx's ErrorState) costs nothing marginal
 * and reads the same — the eyebrow string is already uppercase in the
 * source copy, so no CSS transform is lost either.
 *
 * Deferred, not rejected — and the difference matters, because the design
 * doc does not treat this family as optional. docs/design/README.md gives
 * it two whole roles in the type scale (`measure`, 11/11 · 0.12em, for
 * quantities; `eyebrow`, same metrics, for section labels), names it as one
 * of the three families in the handoff summary, and calls for it by name on
 * screen 04 — the donate row's "dobro.ua ↗". None of those surfaces exist
 * yet. When M6 builds the profile and reveal screens, re-add the loader
 * here (one call, `weight: ["500"]`, subsets cyrillic+latin), add
 * `--font-mono` to globals.css's `@theme`, and put `font-mono` back on the
 * ErrorState eyebrow: at that point the 15,560 bytes buy three surfaces
 * rather than one, and this note's arithmetic no longer applies. Loading it
 * before then is the premature scaffolding CLAUDE.md warns against; leaving
 * this note reading as a permanent decision would be worse, because the
 * next person to grep "IBM Plex Mono" would find it and conclude the family
 * was dropped from the design rather than from the bundle.
 */
