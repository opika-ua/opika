# Tier 1 review — chore/commissioner (uncommitted, worktree off 92e7542)

VERDICT: PASS WITH NOTES

| VERIFIED | TAKEN ON TRUST |
|---|---|
| `Commissioner-Regular.woff2`, `-Medium.woff2`, `OFL.txt` `cmp`-identical to `raw.githubusercontent.com/kosbarts/Commissioner/7f7dc8e…/` (fonts/webfonts/ + OFL.txt); local SHA-256s equal the README's | fontTools advance-width match vs Google's slices (993/993, 992/993) |
| OFL.txt also identical to upstream `master` and `google/fonts` `ofl/commissioner/OFL.txt`; copyright line names no Reserved Font Name | Runtime "no googleapis/gstatic request" (builder's harness json shows `"google": []`; I did not re-run it) |
| `google/fonts` METADATA.pb: `repository_url m4rc1e/Commissioner`, `commit 7f7dc8e…`; GitHub compare API: master is ahead 14 / behind 0 of 7f7dc8e (commit is on upstream master) | `/pro` and the animal page render zero Commissioner text in a built page (no screenshots; I confirmed only that both roots carry `font-rg`) |
| Name tables: family "Commissioner" (not Flair/Loud), `Version 1.001`, usWeightClass 400/500, no `fvar` | Builder's `pnpm check` (2465 unit / harness 222+3 skipped — read from log and message, not re-run) |
| Before-run faces (kabinet json): Google loaded only 400/500 slices; 700 used ⇒ synthetic before and after | |
| No `next/font/google` import left (only comments) | |
| Mocked-Google build (`NEXT_FONT_GOOGLE_MOCKED_RESPONSES` → `{}`) compiles; **mutation**: appended a `next/font/google` Commissioner call → `Turbopack build failed … Can't resolve '@vercel/turbopack-next/internal/font/google/cssmodule.module.css'`. Restored (sha256 identical), rebuilt green | |
| Line-box files before/after, all 10 frames: identical line counts per node; widths ≤1 px narrower, x ±1 px. `/tvaryny`, `/prytulkam` PNGs byte-identical; Commissioner nodes there are only `<script>` (lines=0). Opened exhausted 390 diff + kabinet crop: diffs sit on Commissioner glyphs only | |
| `KABINET.md:76` reads "Type: e-Ukraine 400/500/700" | |
| `apps/web/AGENTS.md`/`CLAUDE.md` gitignored (`.gitignore:59–60`), untracked | |

## FINDINGS

1. [medium] `apps/web/src/app/fonts.ts:85` (preload on) — this PR doubles every public route's preloaded font bytes (62,960 → 132,220 B) for text no public first paint needs. Verified: `/tvaryny`, `/prytulkam` render no Commissioner; the only first-paint Commissioner text on a public surface is the deck's 13px notice (`SwipeDeck.tsx:357`, hidden <360px — i.e. on exactly the budget-Android frame the audience is). The exhausted body appears only after swiping, long after load. The kabinet is the one surface that would benefit, and per COM-F1 it should not be in Commissioner at all. **Recommendation for COM-T2: (b) `preload: false`**, matching LIT-T4 ("same pattern as Literata"). Cost is a swap on one hint line from a metric-matched Arial fallback (no reflow); settled screenshots are unchanged. Not a STOP — Tier 2 inbox decision — but the "as instructed" premise (used on every page) is false and the PR should not ship a 2× byte regression on that premise.
   Failure scenario: 3G Android opening `/tvaryny` from a Telegram link downloads 132 KB of a font it never draws.
2. [low] Wrap risk on unscreenshotted strings: lines only got narrower, so a longer string can at most pull a word up one line earlier (never overflow/clip). Live dynamic Commissioner text today: none public; kabinet (shelter names, emails) — acceptable, and moot once COM-F1 lands.
3. [info] COM-F1 correctly left out of scope; design line confirmed.

Inbox rows: honest — COM-Q1 separates the relayed verbatim quote from the coordinator's paraphrase; COM-T2 records the premise collision rather than silently resolving it.

## SIMPLIFICATIONS
- `fonts.ts:98` `adjustFontFallback: "Arial"` is the default; removing it changes nothing. Keeping it as documentation is defensible — no action needed.

## TESTS
- `apps/web src/seo-flags.test.ts`: 1 file, 33 passed.
- `next build` (mocked Google, empty map): compiled successfully; mutated: build failed as above.
