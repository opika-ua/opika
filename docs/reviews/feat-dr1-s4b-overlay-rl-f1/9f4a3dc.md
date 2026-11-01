Verdict for 9f4a3dcfd59ec9b6098ab3aaa990ee7ff97ec1f3: PASS WITH NOTES

Full review (not a delta) of PR #177 (`feat/dr1-s4b-overlay-rl-f1`): designer round 1's S4b (the gallery opens the
animal page in an overlay) plus RL-F1 (a rate limit gets its own state). Not Tier 1; migration: none. It was reviewed
by the local agent under the 2026-10-21 working mode (a non-Tier-1 review), through the `opika-reviewer` subagent
(Opus). The worktree `D:/opika-worktrees/rb-s4` was at exactly that SHA, and its tree was clean afterwards. The local
agent did not build this change; it was built in cloud session
https://claude.ai/code/session_013anCsv3AkGs2KgeDWGN9vJ.

```
VERDICT: PASS WITH NOTES
```

Nothing blocks. Under the working mode, the notes go into the overlay area's follow-up batch.

## Verified vs taken on trust

| VERIFIED (ran it, read the output) | TAKEN ON TRUST / NOT RUN |
|---|---|
| **The rebase.** HEAD is `9f4a3dc`. `range-diff fd0ab25..a51a8e3 origin/main..HEAD` gives `1: a51a8e3 = 1: 9f4a3dc`. The merge-base is `cb9cf27`. The only file shared with #176 is `proxy.test.ts`, and both hunks are there (#176's `kabinet/kabinet-db.ts: ../api/db` at :818, plus this PR's 429 test). `server-client.ts` still exports `anonymousRouterClient` (it wraps `routerClientOver`), so the loader's import and the tests' `vi.mock("../../api/server-client")` hit the real path | The harness locally: Docker wasn't running, so CI's run was used instead |
| **One loader, one component.** Both routes call `loadAnimalPage` and pass `load.view` to `AnimalDetailScreen` (read). A whole-repo grep for `openFull`, «Відкрити повну сторінку» and `AnimalPreviewDrawer` finds only negative assertions, history docs and comments. There are no previous/next arrows | That Next falls back to a full page load on a 429 HTML response (comment at `proxy.ts:163`); not run in a browser |
| **The routes.** `@preview/default.tsx` exists and `@preview/page.tsx` renders nothing. In CI at this SHA, the reload, no-JS, deck-entry and «Не зараз» flows pass. There is no `/zberezheni` yet, so the S8 flow isn't present | Five of the builder's six mutations |
| **Stacked dialogs.** The unit tests and mutation 1 below. A scratch StrictMode probe (overlay plus reveal, then unmount) leaves overflow `""` and focus on the card, and a fresh lock still locks and unlocks: the counter doesn't go negative | Bundle size: not built. Expected: the intercepting page is its own route entry, so the `AnimalDetailScreen` and `RevealFlow` chunks load on the first open, not with `/tvaryny` |
| **Other dialog users are green:** ModalDialog, the kabinet's AnimalList, AdminsManager, ReasonDialog and ProfileEditor, DeckScreen, SwipeDeck and RevealFlow. By grep, no kabinet handler calls preventDefault on Escape or Tab inside a ModalDialog | That `prefetch={false}` is what keeps the harness count at one request (no recorded mutation) |
| **RL-F1.** The loader tests pass. His sentence matches `detail.rateLimited` and `kabinet.password.forgot.throttled` byte for byte. The proxy body is a constant: no request data, no script, and both the content-type and `X-Robots-Tag` are set. The limiter's condition and the paths it covers are unchanged (a one-line diff). The catalogue is imported only on a refusal, and the heavy-import scan is green | The builder's `pnpm check` totals (workspace 5528 passed, 1 skipped; harness 146) |
| **Public data.** `ShelterFreshnessBlock` is untouched and not added anywhere. `AnimalCard` isn't in the diff. The loader goes through `anonymousRouterClient` and never calls `session.bootstrap`. `handlers-implement-contract.test` is green | |
| **CI and records.** CI `check` passes on `9f4a3dc`, harness included: 146 passed, all 14 overlay flows green. §2 and §6 quote him verbatim (§6 matches CLAUDE.md:702). D5, D7 and D8 sit under "Decisions taken" | |

## Findings (most severe first)

1. **[Note] `AnimalOverlay.tsx:83-90`: the Safari fallback that hands focus back to the card by its href no longer
   has a test.** Its drawer test was deleted.
   - Scenario: a click that leaves focus on `<body>` means focus doesn't return to the card after close.
   - Evidence: mutation 2 survived, 18/18 green.
   - Fix: restore the old test. Focus `body`, mount, unmount, and expect the card to be focused.
2. **[Note] T6, `prefetch={false}`, is a new guard with no recorded mutation.** It sits on the three links back to
   the gallery in `AnimalDetailScreen` and on the `SiteHeader` wordmark.
   - Site-wide, `/pro`, `/prytulkam` and the animal page no longer prefetch `/tvaryny` from the wordmark.
   - Fix: record `mutation: prefetch on → <harness text>`.
3. **[Note] RL-F1 in the overlay is reachable only as a full page load.**
   - When the per-IP 429 hits, the visitor loses the gallery and its scroll position, and the reload is charged
     again. The proxy page has no link back.
   - The in-dialog `rate_limited` notice can't be reached today.
   - This is recorded in RL-F1-T4, and «Це не помилка» never shows for a rate limit. But he asked for a state "on …
     the drawer", so tell him this in plain words.
4. **[Note] T9: the overlay does show the shelter's freshness sentence, against his literal "isn't in the overlay
   either".** It is flagged, not silent. The overlay shows exactly what the page shows, and on main the page still
   carries the sentence; it leaves both together in S6, with `/prytulkam` §8 (commitment 7). Keep it in front of him
   at merge.
5. **[Note] `gallery-animal-overlay.harness.ts:320`: the title says "the list where it was", but the test checks
   only the URL, focus and the lock.** Either read `scrollY` as line 149 does, or rename the test.
6. **[Doc] Comments the drawer's deletion made stale.**
   - They name the drawer: `useModalFocus.ts:16-22` (a file this diff touches), `ModalDialog.tsx:17`, `layout.tsx:5`,
     `default.tsx:2`, `CoatFact.tsx:11` and `detail-text.ts:10`.
   - They cite the deleted `gallery-preview-drawer.harness.ts`: `DeckEntryLink.tsx:26-30`, `FilterRail.tsx:94-97`,
     `GalleryPagination.tsx:95-98` and `SortControl.tsx:60-63`.
   - `(.)[animalId]/page.tsx:27-30` says the page shows a 404 or the error page whenever it has no animal, but the
     rate-limited case has its own screen.

## Simplifications

- `CoatFact.tsx` and `detail-text.ts` now have one caller each. They were split out "so the drawer can't differ".
  Fold them back into `AnimalDetailScreen`, or fix the comments. Nothing breaks.
- `overlayNoticeTitle`, `AnimalOverlayNoticeView` and the page's `notice()` closure have one caller between them.
  They could be one component that renders `AnimalOverlay`. If this is wrong, nothing breaks except the import
  names.

## Mutations

- The builder's, re-run: the reveal's lock put back to save/restore → `back with the reveal open closes both…
  AssertionError: no scroll lock left behind: expected 'hidden' to be ''`. It matches the commit body.
- Mine, 1: dropped `if (event.defaultPrevented) return;` in `useModalFocus` → `with the reveal open, the first Escape
  closes only the reveal… AssertionError: the overlay stays open: expected "vi.fn()" to not be called at all, but
  actually been called 1 times`.
- Mine, 2: removed the opener fallback by href → **survived** (finding 1).
- Mine, 3: the overlay passes a different animal id → `is one animals.reveal request with the same input, either
  way: AssertionError: expected [ Array(1) ] to deeply equal [ Array(1) ]`.

## Tests (the reviewer's runs)

- `apps/web`, the touched suites: 11 files, 239 passed.
- Other dialog users, plus the gallery and `app/tvaryny`: 348 passed, 7 skipped. `app/tvaryny/page.test.tsx` didn't
  start: it needs the database (ECONNREFUSED :5433, Docker down), and the diff doesn't touch it.
- `packages/i18n`: 686 passed, of which copy-status is 657.
- `pnpm typecheck`: exit 0. `pnpm lint`: exit 0, with 159 warnings, none in the changed files.
- CI at `9f4a3dc`: `check` passes, harness 146 passed.
- Not run: the harness locally (Docker down; CI ran it), `build:web` and route sizes, and `app/tvaryny/page.test.tsx`
  (needs the database).
