# Review: feat/k4-profile, PR 2: fixes (Tier 1 re-review, pass 2 of 2)

Scope: the uncommitted fixes to blockers 1 and 2 in `D:\opika-worktrees\k4` (base 65f91bc), the earlier notes, and K4-B5. Delta only.

VERDICT: PASS WITH NOTES. Both blockers are resolved and nothing blocks the commit. This is pass 2, so the notes below become PR comments or follow-up rows.

| VERIFIED (ran it, read the output) | TAKEN ON TRUST |
|---|---|
| 1. The footnote renders only under `first_reveal`. M1 rendered it under `current`: ContactRevealDialog.test.tsx:72 went red ("expected <span …(1)></span> to be null"). No UI calls `listMine`, so no live screen gets `first_reveal`. No new copy | The `pnpm check` figures (3098 unit, 230 harness): there is no commit body yet |
| 2. One id. M2 opened the first item of a comma list: 12 tests red across build-env, env and access ("expected '' to match /KABINET_WRITE_ALLOWLIST holds \d+ com…/"). The messages carry no value. #6 says "exactly one" | The 48px message naming the control: I read the code but did not run the harness |
| 3. Fields pinned at the contract and in served responses. `source` is required. No exact address. `animals.reveal` refuses before `findByAdopterAndAnimal` (I read the order in the source). M3 gave a paused shelter's «Мої запити» item `current`: api.test.ts:1275 red | K4-B5's wording. The inbox labels it as relayed, which is accurate |
| 4. Import scan. M4 had `AnimalDetailScreen` import the folder: test-shelter-only.test.ts:135 named that file | The commit body's `mutation:` lines: not written yet |
| 5. Behavioural classification. M5 marked the open policy exempt: 3 tests red ("open_for_tests_only is open: expected false to be true") | |
| 7. The earlier simplifications are done: the re-export is gone, SERVED has one row, the duplicate scans are removed | |
| Worktree restored after every mutation (fingerprint `5d8cfa7` before and after) | |

## FINDINGS (most severe first)

1. **[low, follow-up row] `views/reveal.ts`, `ShelterAtFirstRevealViewSchema.donation`.** Yes, this deserves a line, and "stale" understates it.
   - The view sends the donation link from the first reveal, and no screen reads it.
   - A future «Мої запити» screen built on it would offer a donation link the operator has since replaced.
   - That screen shows money-routing with the destination visible, so the link has to come from the shelter's live approved donation.
   - Failure scenario: a shelter moves its fundraiser, the operator approves the new link, and «Мої запити» still links to the abandoned page.
2. **[low] `docs/design/README.md:740`** still specifies a "snapshot footnote" on the reveal card. No live screen shows it any more. Point that line at K4-Q11, so the next builder doesn't put the deleted claim back "per design".
3. **[low] Commit body.** The original finding 4 (mutation records) stands until the commit exists. The body needs `mutation:` lines for M1–M5 or the builder's equivalents, plus the 48px floor crossing.

No public claim is still false. `liveOnSave.contacts` holds: both `animals.reveal` paths send `current`, and the client has no reveal cache.

## SIMPLIFICATIONS

- `api/handlers/reveal.ts:75`: drop the hand-built `current` and call `shelterContactOf(reveal, shelter)` in `animalsReveal` too. The shelter is already checked as verified there, so the result is `current`. That leaves one rule instead of two. Nothing breaks.
- `views/reveal.ts:28-31`: share one `pick({ contact: true })` const between both union members. Then loosen `shelter.test.ts`'s "exactly 3 picks" count, which is a change-detector, to "no `.omit(`". Nothing breaks.
- Optional: `contactsFootnoteOf`'s `first_reveal` branch serves no screen. Deleting the footnote outright would be smaller. Keeping it is defensible while K4-Q11 is open.

## TESTS

Scoped to the touched suites, not the workspace total:
- contracts (views/shelter, pre-reveal-location, kabinet/text-inputs): 3 files, 84 passed
- i18n (copy-status, template): 2 files, 132 passed
- apps/web without DB (reveal, RevealFlow, SwipeDeck, access, build-env, env, test-shelter-only, test-shelter-copy-gate, no-self-serve-yet, production-sign-in, features/kabinet/**): 21 files, 452 passed
- apps/web with DB (api, api/pre-reveal-location, handlers-implement-contract, kabinet/handlers, home-page, shelter-writes-refused): 6 files, 286 passed
