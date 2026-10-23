# Decisions inbox: chore/drop-ui-measuring-tests

Rows for the main table (`docs/decisions-inbox.md`), appended at merge.

The decision this branch carries out is Oleksii's, 2026-10-20, verbatim: "UI-measuring tests:
yes, keep both V-B2 tests (the 48px shared controls and the focus indicator being present).
They’re accessibility guarantees, not looks. Drop the rest that measure appearance." UI-D1
records it. UI-T1..UI-T8 are the builder's decisions (reversible, his to overturn at merge), not
his approval. UI-U1..UI-U7 were kept, unsure: kept because they may be behaviour, listed so he can
say "drop these too". He answered on 2026-10-20 (keep all seven, on the condition that nothing
timing-based runs on the real clock); the builder's original reasoning stays in "Default taken".

Line numbers are `origin/main` at `1c20d1f`, all under `apps/web/test/harness/` or
`apps/web/src/` unless shown. "×N" is how many runs a looped test produced.

| ID | Date | Row | Question | Options | Default taken | Oleksii's answer | Status |
|---|---|---|---|---|---|---|---|
| UI-D1 | 2026-10-20 | chore/drop-ui-measuring-tests | Keep the frozen UI-measuring tests until the brand lands, or drop them now? | (a) keep frozen; (b) drop all but the two V-B2 tests | (b) | "UI-measuring tests: yes, keep both V-B2 tests (the 48px shared controls and the focus indicator being present). They’re accessibility guarantees, not looks. Drop the rest that measure appearance." | Done on this branch |
| UI-T1 | 2026-10-20 | same | The focus-ring tests (every `expectFocusVisibleOutline` call) walked the real tab order, then measured outline width and offset ≥ 2px. Drop them whole, or keep the walk? | (a) delete the tests; (b) keep the Tab walk as keyboard reachability, drop the outline measurement | (b): the helper is now `expectReachableByTab`, titles say "is reachable by Tab". Keyboard operation is one of his kept accessibility basics; the outline width is how focus looks | — | Builder's decision |
| UI-T2 | 2026-10-20 | same | Sideways-overflow checks (WCAG 1.4.10 reflow, flagged MIXED in `docs/visual-tests-inventory.md`) | keep / drop | Dropped: each is a pixel comparison of scrollWidth against the viewport, i.e. a layout measurement, and it was the one that failed on 1–2px font differences | — | Builder's decision |
| UI-T3 | 2026-10-20 | same | Files left empty or nearly so | delete the file / keep and trim | `freshness-pip-contrast` and `gallery-photo-sizes` deleted (nothing left). `gallery-layout` and `discovery-layout` keep their names though little layout is left, because product-code comments point at them by name and this branch changes no product code | — | Builder's decision |
| UI-T4 | 2026-10-20 | same | Colour-class unit tests whose fill pattern is logic (`SwipeCard` pips, `freshnessPips`) | delete / keep the pattern | Kept which pips are filled (true/false per pip); dropped the colour token per pip | — | Builder's decision |
| UI-T5 | 2026-10-20 | same | Helpers and viewports left unused | keep / delete | Deleted from `harness.ts`: `expectNoOverlap`, `overlapOf`, `expectContainedBy`, `expectMinimumBottomMargin`, `expectNoHorizontalOverflow`, `expectNoViewportOverflow`, `expectMinTouchTarget`, `MIN_TOUCH_TARGET_PX`, `rowCounts`, `contrastRatio`, `resolveSizesAttribute`, `selectVariantFromSrcset`, `EPSILON_PX`, `fmt`. Deleted from `viewports.ts`: `GALLERY_TABLET`, `GALLERY_WIDE`, `GALLERY_DESKTOP_ROOMY`, `GALLERY_WIDE_ROOMY`, `GALLERY_ULTRAWIDE`, `GALLERY_ULTRAWIDE_ROOMY`, `GALLERY_PHONE_360`, `GALLERY_DESKTOP_1920`, and the font-metrics note. Deleted in `discovery-layout`: `MIN_SHELTER_MARGIN_PX`, `minShelterMarginFor`, `MIN_PHOTO_HEIGHT_PX`, `RETRY_MIN_PX`; in `site-header`: `HEADER_MIN_HEIGHT_*`; in `gallery-pagination`: `MIN_TARGET_PX`. `rectOf` stays (the drag and flick helpers aim the pointer with it) | — | Builder's decision |
| UI-T6 | 2026-10-20 | same | Stale pointers in product code and CI comments to deleted tests (`AnimalCard.tsx:19,61`, `SortControl.tsx`, `SwipeCard.tsx:129`, `SwipeDeck.tsx:350,516`, `layout.tsx:83`, `DeckScreen.tsx:139`, `ci.yml:134-141`'s "real layout geometry" and `test.fail()` comment) | edit them here / leave for a follow-up | Left: the brief allows tests, harness helpers and docs only, and a `.github/workflows` edit needs a push scope this session shouldn't assume. Follow-up: a comment-only sweep | — | Builder's decision; follow-up open |
| UI-T7 | 2026-10-20 | same | `kabinet.harness.ts` sign-out test: 48px box + outline + Tab | delete / keep the Tab | Kept "sign-out is the first Tab stop" (keyboard), dropped the box height and outline style | — | Builder's decision |
| UI-T8 | 2026-10-20 | same | Demo banner tests at 320 (`site-header`) and the deck demo-banner loop | delete / keep visibility and copy | Kept visibility and the «Демо» text, the position count and the bar hidden; dropped clipping (scrollWidth) and the header height | — | Builder's decision |
| UI-T9 | 2026-10-20 | same | `packages/db/test/tools.test.ts`'s harness-wrapper test greps the harness for the two-word title "keyboard focus", which UI-T1 renamed (it went red: 0 tests listed) | change the grep / keep one "keyboard focus" title | Grep is now "keyboard reachability", still two words, so it still proves the wrapper forwards a quoted two-word argument | — | Builder's decision |
| UI-T10 | 2026-10-20 | same | The real-clock waits (his Q2 (a)): `page.clock`, or waiting on a state? | Both within his Q2 (a): (i) `page.clock` for the deck; (ii) wait on a state the app already shows, and stamp the drag's event times | (ii): the deck's spring runs on `requestAnimationFrame` and `performance.now()`, and `page.clock` would fake those for the whole page (feeds, fetch retries) to settle one card. The "did not advance" checks wait for the card's own at-rest transform or another card's name (`nameOnceSettled`); the drag helper states each event's time through CDP, as the flick helper already did; the kabinet form holds its saves on a promise the test releases | — | Builder's decision |
| UI-T11 | 2026-10-20 | same | The progress bar's non-demo state (review finding 2): what can a unit test read? | (a) a `data-state` attribute; (b) `aria-hidden`; (c) the native `hidden` attribute | (a) `data-state="shown"`/`"hidden"` on `DeckScreen`'s bar, the class derived from the same value. (b) is already `true` (the bar is decorative), and (c) would change how it is hidden. No style change | — | Builder's decision |
| UI-U1 | 2026-10-20 | same | Kept, unsure: breakpoint visibility. `animal-detail:117,136` (mobile vs desktop back link at 360/1920), `gallery-filters:49,64` (rail vs sheet trigger at 1280/390, read via `boundingBox()` null / width > 0), `discovery-layout:344` (notice hidden at 320) and its notice loop at 4 widths (`:324`, now visibility + text only), `discovery-layout:406` (progress bar hidden in demo mode at 4 widths) | keep / drop | Kept: each says which control or state exists at a width, not how big or where | "keep all seven (UI-U1..U7). They test state and behaviour. One condition: the 280 ms commit test and anything else timing-based must use fake timers, never the real clock." Then, 2026-10-20, verbatim: "Q2, #167: (a). Fix the real-clock waits before merge: Playwright’s page.clock or waiting on the at-rest state, the drag helper without real sleeps, the kabinet form without the 1 s delay, and useReveal flushed with fake timers. Also the review’s other notes (a state-based progress-bar check, my UI-U1..U7 answer in the inbox, the CLAUDE.md wording). Then #167 merges with the condition met." | kept, his answer 2026-10-20 |
| UI-U2 | 2026-10-20 | same | Kept, unsure: `gallery-arrow-nav.harness.ts:198` "3 columns at desktop width, so ArrowDown steps by 3", and its phone-width step | keep / drop | Kept: it is keyboard behaviour (the design's Keyboard table), though the step size follows the layout's column count | "keep all seven (UI-U1..U7). They test state and behaviour. One condition: the 280 ms commit test and anything else timing-based must use fake timers, never the real clock." Then, 2026-10-20, verbatim: "Q2, #167: (a). Fix the real-clock waits before merge: Playwright’s page.clock or waiting on the at-rest state, the drag helper without real sleeps, the kabinet form without the 1 s delay, and useReveal flushed with fake timers. Also the review’s other notes (a state-based progress-bar check, my UI-U1..U7 answer in the inbox, the CLAUDE.md wording). Then #167 merges with the condition met." | kept, his answer 2026-10-20 |
| UI-U3 | 2026-10-20 | same | Kept, unsure: `use-swipe-gesture.test.tsx:232` (exit transition is exactly `transform 280ms cubic-bezier(0.3, 0, 0, 1)`) | keep / drop | Kept: the 280ms timeline is the commit timing the gesture logic waits on, not only how it looks | "keep all seven (UI-U1..U7). They test state and behaviour. One condition: the 280 ms commit test and anything else timing-based must use fake timers, never the real clock." Then, 2026-10-20, verbatim: "Q2, #167: (a). Fix the real-clock waits before merge: Playwright’s page.clock or waiting on the at-rest state, the drag helper without real sleeps, the kabinet form without the 1 s delay, and useReveal flushed with fake timers. Also the review’s other notes (a state-based progress-bar check, my UI-U1..U7 answer in the inbox, the CLAUDE.md wording). Then #167 merges with the condition met." | kept, his answer 2026-10-20 |
| UI-U4 | 2026-10-20 | same | Kept, unsure: `use-swipe-gesture.test.tsx:250-251, 512, 518-519` (reduced-motion: opacity transition string, opacity 0, card back at centre) | keep / drop | Kept: honouring `prefers-reduced-motion` is accessibility behaviour; the exact curve string inside it is appearance | "keep all seven (UI-U1..U7). They test state and behaviour. One condition: the 280 ms commit test and anything else timing-based must use fake timers, never the real clock." Then, 2026-10-20, verbatim: "Q2, #167: (a). Fix the real-clock waits before merge: Playwright’s page.clock or waiting on the at-rest state, the drag helper without real sleeps, the kabinet form without the 1 s delay, and useReveal flushed with fake timers. Also the review’s other notes (a state-based progress-bar check, my UI-U1..U7 answer in the inbox, the CLAUDE.md wording). Then #167 merges with the condition met." | kept, his answer 2026-10-20 |
| UI-U5 | 2026-10-20 | same | Kept, unsure: `DeckScreen.test.tsx:101-102` progress fill `style.width` is `"30%"` | keep / drop | Kept: the width carries the computed position (6 of 20), a value, not a style choice | "keep all seven (UI-U1..U7). They test state and behaviour. One condition: the 280 ms commit test and anything else timing-based must use fake timers, never the real clock." Then, 2026-10-20, verbatim: "Q2, #167: (a). Fix the real-clock waits before merge: Playwright’s page.clock or waiting on the at-rest state, the drag helper without real sleeps, the kabinet form without the 1 s delay, and useReveal flushed with fake timers. Also the review’s other notes (a state-based progress-bar check, my UI-U1..U7 answer in the inbox, the CLAUDE.md wording). Then #167 merges with the condition met." | kept, his answer 2026-10-20 |
| UI-U6 | 2026-10-20 | same | Kept, unsure: `gallery-layout:218` every photo decodes (`naturalWidth > 0` after scroll) | keep / drop | Kept: it catches broken image URLs (the bare-storage-key 404), not a size | "keep all seven (UI-U1..U7). They test state and behaviour. One condition: the 280 ms commit test and anything else timing-based must use fake timers, never the real clock." Then, 2026-10-20, verbatim: "Q2, #167: (a). Fix the real-clock waits before merge: Playwright’s page.clock or waiting on the at-rest state, the drag helper without real sleeps, the kabinet form without the 1 s delay, and useReveal flushed with fake timers. Also the review’s other notes (a state-based progress-bar check, my UI-U1..U7 answer in the inbox, the CLAUDE.md wording). Then #167 merges with the condition met." | kept, his answer 2026-10-20 |
| UI-U7 | 2026-10-20 | same | Kept, unsure: gesture position transforms (`use-swipe-gesture.test.tsx` `translate3d` reads, e.g. :122-123, :271, :284, :409, :450, :472, :547, :579, :651) | keep / drop | Kept: the transform is the observable state of the gesture (moved, returned, committed) | "keep all seven (UI-U1..U7). They test state and behaviour. One condition: the 280 ms commit test and anything else timing-based must use fake timers, never the real clock." Then, 2026-10-20, verbatim: "Q2, #167: (a). Fix the real-clock waits before merge: Playwright’s page.clock or waiting on the at-rest state, the drag helper without real sleeps, the kabinet form without the 1 s delay, and useReveal flushed with fake timers. Also the review’s other notes (a state-based progress-bar check, my UI-U1..U7 answer in the inbox, the CLAUDE.md wording). Then #167 merges with the condition met." | kept, his answer 2026-10-20 |

## Deleted, complete list

### Harness (`apps/web/test/harness/`)

| file:line | What it measured |
|---|---|
| `discovery-layout:137` (×5) | action row does not overlap the swipe card (bounding boxes) |
| `discovery-layout:147` (×5) | freshness block contained by the card |
| `discovery-layout:156` (×5) | shelter line contained by the card |
| `discovery-layout:167` (×5) | shelter line's bottom margin ≥ `MIN_SHELTER_MARGIN_PX` |
| `discovery-layout:184` (×5) | photo height ≥ 152px |
| `discovery-layout:208` (×5) | back-to-list button ≥ 48px (per-component size) |
| `discovery-layout:216` (×5) | page does not overflow the viewport in either axis |
| `discovery-layout:265` | photo area exactly 386px at 390×844 |
| `discovery-layout:286` | photo shrinks below 396px at 390×640, shelter line contained, margin floor |
| `discovery-layout:324` (×4), assertion `:334-341` | notice sits below the action row (y positions); the test stays, visibility + text only |
| `discovery-layout:344`, assertions `:354-362` | shelter line contained + margin floor at 320; the test stays, hidden-at-320 only |
| `discovery-layout:378-389` | `test.fail()` marker: deck card > 500px wide at 1280×800 |
| `discovery-layout:406` (×4), assertions `:423-438` | demo banner not clipped (scrollWidth ≤ clientWidth), deck header ≤ 48px tall; the test stays, copy + count + bar hidden |
| `discovery-layout:460, 480 (×2), 532` | focus outline width/offset ≥ 2px; the tests stay as Tab reachability (UI-T1) |
| `discovery-layout:527` | retry button ≥ 56px |
| `gallery-layout:59` (×5) | cards per row (1/2/3/4/6 columns) by bounding-rect rows |
| `gallery-layout:83` (×5) | no sideways scroll |
| `gallery-layout:99` | tablet photo ~120px wide |
| `gallery-layout:111` (×4) | photo keeps a 4:5 ratio |
| `gallery-layout:170` (×6) | first row's span equals the fluid content width / ceiling |
| `gallery-layout:278` (×2) | photo box the same size before and after its image loads |
| `gallery-layout:354` (×3) | mobile toolbar content fits its row; «Фільтри» right edge inside it |
| `freshness-pip-contrast:76` | gallery empty pips ≥ 3:1 contrast (file deleted) |
| `freshness-pip-contrast:100` | deck empty pips ≥ 3:1 contrast |
| `gallery-photo-sizes:246` (×12) | browser picks the expected srcset variant per viewport/DPR (file deleted) |
| `gallery-photo-sizes:270` (×12) | `sizes` resolves within 1px of the laid-out photo box |
| `gallery-pagination:65` | every pagination target ≥ 56px |
| `gallery-pagination:94-101` | active page background is `rgb(16, 17, 18)`; the test (`:81`) stays for aria-current and `<span>` |
| `gallery-pagination:161-176` | skip link ≤ 1px before focus, > 0 after; the test (`:154`) stays for Enter moving focus |
| `gallery-filters:90, 99` | focus outline width/offset; stay as Tab reachability (UI-T1) |
| `gallery-filters:122` | mobile deck-entry link ≥ 48px |
| `site-header:125` (×5) | header height ≥ 64 / 88px |
| `site-header:138` | header nav links ≥ 48px |
| `site-header:152` | footer links ≥ 48px |
| `site-header:198` (×4) | logo mark's threshold line on the wordmark baseline (±1px) |
| `site-header:248` (×3), `:254` | no horizontal overflow (gallery 360/390/tablet, detail 360) |
| `site-header:273, 299`, assertions overflow + `:288-297`, `:307-316` | banner not clipped and page not overflowing at 320; the tests stay, visibility only |
| `site-header:334` (×4) | card name computed font-size 24/22px |
| `site-header:363` (×5) | no card name spills past its card |
| `site-header:409` | a 25+ character name exists and is clipped (`truncate`) |
| `site-header:450, 458` | focus outline width/offset; stay as Tab reachability (UI-T1) |
| `animal-detail:226, 234, 242, 250, 258, 268, 302` | focus outline width/offset; stay as Tab reachability (UI-T1) |
| `detail-photo-gallery:81` | every photo dot ≥ 48px |
| `detail-photo-gallery:96, 106` | focus outline width/offset; stay as Tab reachability (UI-T1) |
| `discovery-reveal:108` | focus outline width/offset; stays as Tab reachability (UI-T1) |
| `gallery-error:118` | focus outline width/offset on retry and «show all»; stays as Tab reachability (UI-T1) |
| `kabinet:134` (×2) | no horizontal scroll at 360/1440; every `dd` box inside the viewport |
| `kabinet:160-161, 164-165` | sign-out ≥ 48px tall; outline-style not none; the test (`:155`) stays as "first Tab stop" (UI-T7) |

### Unit and component (`apps/web/src/`, `packages/ui/src/`)

| file:line | What it measured |
|---|---|
| `app/pro/page.test.tsx:47` | wordmark link className has `focus-visible:outline` (test stays for the href) |
| `features/kabinet/InviteLandingCard.test.tsx:117-118` | `focus-visible:outline`, `min-h-14` (test stays for text and href) |
| `features/kabinet/JoinFailedCard.test.tsx:36` | whole test: retry has `focus-visible:outline`, `min-h-14` |
| `features/kabinet/InviteLandingForm.test.tsx:59-60` | `focus-visible:outline`, `min-h-14` (test stays for `type="submit"`) |
| `features/kabinet/ShelterProfile.test.tsx:143, 158-161` | verified block `border-dashed`, contacts not (test stays for the rows) |
| `features/kabinet/ShelterProfile.test.tsx:272` | support view root has `outline-4` (test stays for banner and buttons) |
| `features/kabinet/ShelterProfile.test.tsx:275` | whole test: every button `focus-visible:outline` + `min-h-1[2-9]`, sign-out `min-h-12` |
| `features/chrome/Footer.test.tsx:36` | whole test: every link `focus-visible:outline` |
| `features/chrome/SiteHeader.test.tsx:49` | whole test: every link `focus-visible:outline` |
| `features/gallery/AnimalCard.test.tsx:167` | whole test: shelter line `text-rg-ink-2` |
| `features/discovery/SwipeCard.test.tsx:83-92` | per-pip colour classes (test stays for which pips are filled, UI-T4) |
| `features/discovery/SwipeCard.test.tsx:156` | whole test: name has `truncate` |
| `features/discovery/DeckScreen.test.tsx:515-517, 541-543` | progress bar classes `hidden` / `block` (tests stay; the second now asserts the bar renders) |
| `features/animal-detail/medical-labels.test.ts:24, 34, 45, 58, 71, 81, 91` | `barClassName` colour token (tests stay for label and status text) |
| `packages/ui/src/freshness-display.test.ts:11, 15, 19` | colour classes per pip (tests stay as filled/empty pattern, UI-T4) |

Kept as the two V-B2 tests: `kabinet-profile-edit.harness.ts` "the shared controls compute a
min-height of at least 48px" and "tabbing to a control shows a focus indicator", unchanged.
