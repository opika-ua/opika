# Review: feat/k4-profile, PR 2 (pre-commit, Tier 1, synchronous)

Scope: `git diff 65f91bc` plus untracked files in `D:\opika-worktrees\k4`. One pass.

VERDICT: STOP (blocks the merge, not the commit: commit, push, then ask Oleksii)

| VERIFIED (ran it, read the output) | TAKEN ON TRUST |
|---|---|
| Touched suites green: i18n 132, contracts 66, web non-DB 372, web DB 227 (counts below) | The commit's `pnpm check`: read from `k4-check.log` (unit 3089 = 520/144/317/10/503/1595; harness 230), not re-run |
| All 75 K4 strings match `k4-copy-uk.md` plus his "K4 copy fixes" exactly (script, 0 diffs). Only `atLeastOne` changes, to U+02BC | #7 note: "no screen until PR 4/5" |
| R1 allowlist grants any shelter → 3 red (access, no-self-serve) | "Shelters are never deleted" (K4-B4 note) |
| R5 padded value read as unset → build-env and env red, naming the variable | Rollout in Vercel Production (his step) |
| R4 `/kabinet` editor not decided by `decideAccess` → home-page red | |
| R2 exempt prefix without the dot → sibling-key test red | |
| R3 «Мої запити» keeps the snapshot → api red | |
| Builder: CG open counted as exempt → 3 red; B4-1 not visible → red; B4-2 note dropped → 4 red; B4-4 re-read believes anything → 2 red | |
| Floor crossed (`--spacing-target: 40px`) → harness red, "Expected >= 48, Received 40", line 173 | |
| Adopter pages are `force-dynamic`, so both liveOnSave «одразу» claims hold | |
| Reveal dialog rendered with a live contact and an old `revealedAt` (finding 1) | |

## FINDINGS (most severe first)

1. **[STOP] `features/reveal/ContactRevealDialog.tsx:316-320,369`.** The footnote «Контакти збережено такими, якими вони є сьогодні · {date}» uses the date of the first reveal. After K4-B4 it sits under the shelter's current contacts.
   - Failure scenario: someone reveals on 8 Aug, the shelter changes its number, and the repeat reveal returns the same reveal (`api.test.ts` asserts the same id) showing the new number captioned "saved as they are today · 8 серпня".
   - Evidence: a temporary render showed exactly that.
2. **[STOP] `kabinet/write-allowlist.ts:35`.** K-Q17 approved "one id … one open path for that id". The diff accepts two (K4-T13, taken without approval). The variable is wider than he approved for a temporary mode.
3. **[medium] `test-shelter-only.test.ts:32`.** The scan looks for the name `testShelterOnly` but never checks who imports `test-shelter-only/`.
   - Evidence: R6 rendered `<AllowlistedShelterArea/>` in `AnimalDetailScreen` with a pending namespace string. The scan, the mount tests and the animal-detail tests all stayed green. The only failures were the live-catalogue tests in `production-sign-in.test.ts`, which object to *any* pending string. The first PR that legitimately uses the namespace has to loosen those tests, and at that point a public page could import the area unnoticed.
   - Fix: add an import scan that only `ShelterProfile.tsx` passes.
4. **[low] Missing mutation records.** The builder's mutations exist only in scratch files (`m-cg.js`, `m-b4.js`). The commit body needs `mutation:` lines. The 48px floor and the focus test have no mutation recorded.
   - The focus test stays green with `FOCUS_RING` removed from the shared fields, because Chromium's default outline satisfies it. That is acceptable under "presence, never appearance", but the test does not guard the shared ring.
5. **[low] `kabinet-profile-edit.harness.ts:173`.** A floor failure doesn't name which of the four controls failed. Add a message argument to the `expect`.
6. **[low] Classification is by hand.** `test-shelter-copy-gate.test.ts:33` decides "open" with a hand-written table by policy kind. A stronger check derives it from behaviour: a policy is open if `decideAccess` grants an arbitrary unlisted shelter.

## SIMPLIFICATIONS

- `production-sign-in.ts:100`: drop the `testShelterCopyExemptUnder` re-export and import it from `access.ts`. Only test imports change.
- `test-shelter-copy-gate.test.ts` SERVED: `SHELTER_WRITE_POLICY` and `shelterWritePolicyOf({})` are the same object. Keep one row.
- `shelter-writes-refused.test.ts`: the two new scans repeat `no-self-serve-yet.test.ts`'s last test. Keep the one K-Q17 named.

## STOP REASON

1. **The footnote, for Oleksii.** Options:
   - delete it (no approval needed; the builder can do it now and record it as narrowed);
   - show it only when the live contacts equal the snapshot;
   - new wording from him.

   Nothing should merge with the false sentence live.
2. **The id count.** Either narrow to one id (no question needed), or get his explicit yes to two. Update the #6 register text ("one or two") either way.

## TESTS

- i18n `copy-status`, `template`: 2 files, 132 passed
- contracts `text-inputs`, `views/shelter`: 2 files, 66 passed
- apps/web non-DB (build-env, env, SessionControls, ShelterProfile, access, no-self-serve-yet, production-sign-in, test-shelter-copy-gate, test-shelter-only, profile-edit/*, test-shelter-only/*): 13 files, 372 passed
- apps/web DB (api, handlers, home-page, shelter-writes-refused): 4 files, 227 passed
- Harness `kabinet-profile-edit` under the floor mutation: 4 passed, 1 failed (the intended failure)
- The worktree was restored after every mutation (sha1 of the diff plus untracked files is unchanged: `27195cd`)
