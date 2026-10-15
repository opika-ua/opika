# Review: chore/literata (uncommitted, off bacf309). Tier 1, asset licensing

VERDICT: PASS WITH NOTES

| VERIFIED | TAKEN ON TRUST |
|---|---|
| `OFL.txt` is byte-identical to upstream `googlefonts/literata@0c2761b/OFL.txt`: fetched raw, `cmp` clean, SHA-256 `8742963…614e` matches the README. Its copyright line ("Copyright 2017 The Literata Project Authors") declares no Reserved Font Name | Font name table carries copyright/licence metadata (fontTools not available here). It's unmodified upstream, so whatever upstream has is still there |
| `0c2761b` is upstream `main` HEAD and tag `3.103` | `next build` with `NEXT_FONT_GOOGLE_MOCKED_RESPONSES={}` failed on 2 Google fonts before and 1 after |
| Release asset `3.103.zip` downloaded: SHA-256 `f7fb973c…056d` matches the README. Its `fonts/webfonts/Literata-Medium.woff2` (105,972 B) hashes to `f65d6e23…219d`, which matches the vendored file and the README | 60,368 B for Google's two Literata slices (the before-build media is gone) |
| Usage: `font-serif` appears once, at `SwipeDeck.tsx:550`, with `font-medium`. `--font-serif` is defined only in `globals.css:218`. No other `font-family`/`var(--font-serif)` uses Literata. `kabinet/confirm-route.ts` uses system-ui. There are no email templates using it. So 500 upright only is correct | The fallback-metric numbers in LIT-T2 |
| Built CSS (`.next`, built 13:16, after the change): `@font-face{font-family:literata;…font-display:swap;font-weight:500}`, `literata Fallback` = `local(Times New Roman)`, `--font-literata:"literata", "literata Fallback"`. No `googleapis`/`gstatic` string anywhere in `.next/static` or server HTML | |
| The preload claim: `prytulkam.html` carries `<link rel="preload" … Literata_Medium-s.p…woff2>`, and `next-font-manifest.json` lists it for `/prytulkam`, which has no Literata on it. The before JSON shows Google's two slices were `-s.p.` (preloaded) too | |
| Screenshots (`crop-compare`, `diff-390x844`, `after-390x844`): same line breaks and glyph positions. Diff is edge outlines only. I agree with "anti-aliasing/hinting only" | |
| `seo-flags.test.ts`: 33/33 | |

## FINDINGS (most severe first)

1. **[medium, perf] `fonts.ts:49`: `preload` is left at its default (`true`), so every route preloads 105,972 B for a face used on one rare state.**
   - Failure scenario: a first visit to `/tvaryny` or `/prytulkam` on budget Android pays 106 KB of high-priority font bytes it never renders. That is +45.6 KB over Google's slices, which were already a waste.
   - Recommend `preload: false`.
     - Effect: no Literata bytes on any page until the heading is laid out. That is strictly better than both before and now on every route.
     - Rendering cost: the steady state is unchanged. The only change is a possible swap on the exhausted heading the first time it appears, from the metric-adjusted Times New Roman fallback (`size-adjust` 120.83%) to Literata. In the usual path (the user swipes the whole deck) the font has long since been fetched if anything else triggered it. If nothing did, the swap happens on a heading that is centred alone on an otherwise static screen, and its metrics are matched.
     - Rejected alternative: scoping the font to the gortaty route (apply `literata.variable` there, not on `<html>`). It is more change for one heading, so I don't recommend it.
   - Record it as an inbox row (Tier 2 default). LIT-T1's "cost" framing should then be revised, because the +45 KB no longer applies.
2. **[low] Stale comments this change invalidates.**
   - `globals.css:203` still says next/font emits `"Literata", "Literata Fallback"`, "verified in the built stylesheet". The built stylesheet now says `"literata", "literata Fallback"`. That is harmless, because family names are case-insensitive, but the comment claims a verification that is no longer true.
   - `test/harness/viewports.ts:166` says "both are loaded via `next/font/google`". It should read: Literata via `next/font/local`, Commissioner via `next/font/google`.
3. **[low, pre-existing, follow-up row] Nothing rendered asserts that the exhausted heading resolves to Literata.**
   - A missing file fails the build, which is good.
   - Dropping `literata.variable` from `layout.tsx`, or renaming the variable, is not caught. The heading would fall back to the browser's default serif and stay green.
   - The before/after screenshot covers this change only. Not a blocker here.

No licensing finding. Provenance is fully established from the source repo and the release asset itself.

LIT-T3 (Commissioner still on `next/font/google`) is correctly out of scope and honestly recorded as "narrowed, not removed".

Inbox (item 7) is honest: the relay is disclosed, the quote matches the instruction given to this review, and LIT-T1/T2 are marked as Tier 2 defaults rather than as answered.

## SIMPLIFICATIONS
- `fonts.ts:50`: `style: "normal"` is next/font/local's default and can be dropped. Nothing breaks. Optional.

## TESTS
- `seo-flags.test.ts`: 1 file, 33 passed (run here).
- Builder's `pnpm check` log: workspace 2,428 unit passed (apps/web 1,251, db 406, contracts 254, ui 10, plus domain/i18n per the message). Harness 222 passed, 3 skipped.
- No new guard was introduced, so there was nothing to mutate.
