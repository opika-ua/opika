import { Commissioner, Literata } from "next/font/google";
import localFont from "next/font/local";

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
 * e-Ukraine — the «Реєстр» visual system's one family (V2,
 * `docs/design/README.md` "Typeface"). Self-hosted via `next/font/local`
 * rather than `next/font/google`: e-Ukraine isn't on Google Fonts.
 * `./fonts/e-ukraine/LICENSE.txt` has the licence (CC BY 4.0, attribution
 * required — see that file and `docs/build-plan.md`'s V2 "definition of
 * done" for where the credit ships) and where the files came from.
 *
 * Deliberately additive, not a replacement for `literata`/`commissioner`
 * above: V2 re-skins only the surfaces `docs/design/intake-report.md`
 * confirmed the new handoff actually specifies (gallery, cards, filters,
 * pagination, the no-match state, the deck's static visual language).
 * Everything else — the home screen, the deck's dynamic gesture chrome,
 * every E4 state without a mock — stays on Literata/Commissioner
 * deliberately, per the standing "skin, not skeleton" rule for this
 * phase. A two-font-system app for one phase, on purpose.
 *
 * Not yet subset to Cyrillic + Latin basic + punctuation, unlike
 * `literata`/`commissioner` above (Google's own subsetting) — the three
 * files as vendored are the mirror's full character set, ≈95 KB total
 * against the design's own "≈84 KB" subset estimate. Deliberately not
 * done here: subsetting picks a glyph set, and this one isn't final
 * yet — H3 still adds the English strings and the native-speaker pass
 * on the Ukrainian copy, either of which can introduce a character V2
 * never used, and a shelter's free-text `freshnessSentence` isn't a
 * character set anyone controls in the first place. Tracked as
 * `docs/build-plan.md`'s H3.5, after H3, not here.
 */
export const eUkraine = localFont({
  src: [
    { path: "./fonts/e-ukraine/e-Ukraine-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/e-ukraine/e-Ukraine-Medium.woff2", weight: "500", style: "normal" },
    { path: "./fonts/e-ukraine/e-Ukraine-Bold.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-e-ukraine",
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
 *
 * One more substitution since, so the count above stays honest: E3's
 * gallery pager, briefly. The old "Keeper's Voice" mock set its numbered
 * page pills in Plex Mono 13px; `GalleryPagination.tsx` rendered them in
 * Commissioner for exactly this note's reason. Moot as of V2: the new
 * «Реєстр» handoff replaces the whole pager (and every other in-scope
 * surface) with `eUkraine` above, which supersedes this substitution
 * rather than adding a fourth place to reverse it.
 */
