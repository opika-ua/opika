# PR 6 build checklist: shelter writes open for every shelter (K milestone)

Every code, test, copy and doc change PR 6 must make, with the file(s), the reason and how each is
verified. Nothing here is built. The copy itself (what goes false and the English of each true
replacement) is `docs/pr6-copy-sheet.md` (on main since #109): this list doesn't repeat it, it
points to it and says what changed since.

**Status:** being built on `feat/pr6-open-writes` as one draft PR, the switch to open writes as its
final commit (his round-3b answer 2, in `docs/decisions-inbox/feat-pr6-open-writes.md`, P6-B1).

**What PR 6 is, in his words** (verbatim; sources in brackets):
- "K-Q3: live immediately. PR 6 rewrites commitment #6." (K-B1, `docs/decisions-inbox/feat-k-groundwork.md`)
- "K-Q4: allowlist containing only my test shelter's id, from PR 2, so I can test each PR on
  production; removed in PR 6 when the policy opens for everyone." (same)
- "K-Q17: (a). Allowlist from PR 2 … PR 6 deletes all of it. Approved as a temporary mode with that
  fixed end." (same; abridged with …)
- "F6: PR 6 merges BEFORE the first real shelter's invite." (`docs/decisions-inbox/docs-k-future-decisions.md`)
- CG-B1: "At runtime, sign-in ignores those strings only while the write policy is allowlist or
  refused. Under the open policy, any pending string turns sign-in off." and "A CI test fails when
  the policy is open and any pending string exists, so PR 6 can't merge with one left."
  (`docs/decisions-inbox/feat-k4-profile.md`)
- RU-B4: "Sequencing: PR 4 (K3 form) → PR 5 (K2 list) → PR 6 (open writes, allowlist gone)." and
  the dress-rehearsal gate "after PR 6 and the operator screens, before any public posting or
  marketing." (`origin/docs/r-ui-scope:docs/decisions-inbox/docs-r-ui-scope.md`)

**Tier 1** (auth and access, the copy gate, public claims): review before commit in a worktree,
his decisions asked at the start in one batch, full inbox records (CLAUDE.md, working-mode
amendment).

**Read at** `1b2b3d3` (main) unless marked. PR 4 and PR 5 are not on main: items that depend on
them say "(after PR 4/5)", and their line numbers will move. `uk.ts` = `packages/i18n/src/messages/uk.ts`.
`P6CS` = `docs/pr6-copy-sheet.md`. `K2CS` = `docs/k2-copy-sheet.md`. `K3DS` =
`origin/feat/k3-form:docs/k3-draft-shapes.md`. `K3UK` = `D:\opika-worktrees\k3-copy-uk.md`.
`D4` = his answer to K3DS §12 D4, sent to the coordinating session on 2026-10-17 and due in PR 4's
inbox file, verbatim: "D4 / RH-B7: approved, option (i), with your §7.3 wording for commitment #7 as
written. B1/B2 copy still due by PR 6."

**Owner:** **[code]** the builder · **[Oleksii]** his (production, env, copy, decisions). He merges.

---

## 0. At PR 6's start

| # | Item | Owner | Source |
|---|---|---|---|
| 0.1 | P6CS §7's nine questions answered, K-Q14 among them ("K-Q14: decide by PR 6.") | [Oleksii] | P6CS §7; K-B1 |
| 0.2 | His Ukrainian for P6CS §1.1-§1.5 (§1.6 too if K-Q14 changes it), B1 included. B1 must now describe photo changes as well (6.3) | [Oleksii] | P6CS §1; D4/RH-B7 ("B1/B2 copy still due by PR 6") |
| 0.3 | The questions this checklist adds, each with a recommendation: **(a)** delete the CG-Q1 mechanism once the allowlist is gone (3.5; recommend yes: it strengthens the gate); **(b)** `refused_until_edit_screens` and its trail (1.4; this is P6CS Q8; recommend delete); **(c)** ~~the onboarding runbook's "before PR 6" allowlist step~~ resolved by his round-2 answer 3 (2026-10-17) and applied in #117 (7.5); **(d)** `kabinet.email.invite.intro`'s «у реєстрі» and `about.data`'s «реєстр зберігає» (`origin/docs/r-ui-scope:docs/copy-reyestr-hits.md` #7, #12) sit in the two strings PR 6 rewrites anyway (recommend fixing them in the same rewrite, his wording; both are drafted in #123 under CB-B2); **(e)** how PR 6 proves the allowlist variable is dead (2.5): a source scan that no code reads `KABINET_WRITE_ALLOWLIST` (merge not coupled to his Vercel step 8.1), or a build/boot failure while it is still set (forces the env step before the deploy). An env-var question, so his (recommend the scan, plus 8.1 as his post-deploy step) | [Oleksii] | this checklist |
| 0.4 | PR 4 and PR 5 merged. List every key under `uk.kabinet.testShelterOnly` and every component in `apps/web/src/features/kabinet/test-shelter-only/` | [code] | RU-B4; CG-B1 |
| 0.5 | At most two open feature PRs, touching different areas | [code] | WM-B1 item 5 |

## 1. The open write policy

| # | Change | Files | Why | Verified by |
|---|---|---|---|---|
| 1.1 | Add a production `open` variant to `ShelterWritePolicy`, point the frozen `SHELTER_WRITE_POLICY` at it, and serve it: the route and the page pass the constant instead of `shelterWritePolicyOf(process.env)` | `apps/web/src/kabinet/access.ts:82-107`; `apps/web/src/app/api/kabinet/[...rpc]/route.ts:61-62`; `apps/web/src/app/kabinet/page.tsx:65` | K-Q3, K-Q4; the plan written into `access.ts:55-61` ("What lifts it") | the access matrix as served (`access.test.ts:99-132`) gives a shelter admin's write on its own shelter `allow_shelter_write`; `api/kabinet-cross-tenant.test.ts` still answers FORBIDDEN on another shelter's animal. **Mutation:** point the constant back at the refusal → every write case in 5.1 red |
| 1.2 | Delete `open_for_allowlisted_shelter`, `shelterWritePolicyOf`, the allowlist case in `writeGrantFor`, and `WriteGrant`'s `"allowlist"`, with `grantedBy` on `AccessDecision` and on `ProfileEditing` | `access.ts:17-38, 84-97, 109-146`; `apps/web/src/features/kabinet/home.ts:45-66, 74, 180` | K-Q17: "PR 6 deletes all of it" | `git grep -n -E "open_for_allowlisted_shelter\|shelterWritePolicyOf\|grantedBy" -- apps packages` returns nothing; typecheck |
| 1.3 | Delete `open_for_tests_only`, its production guard `assertShelterWritePolicyPermitted` and the scan that keeps its literal in `access.ts`. The suites that passed it use the production policy | `access.ts:69-80, 98, 177-196`; `apps/web/src/kabinet/router.ts:17, 65-68`; `shelter-writes-refused.test.ts:309-430`; `access.test.ts:165-191`; callers in `handlers.test.ts`, `registry.test.ts`, `photos.test.ts`, `api/kabinet-cross-tenant.test.ts`, `production-sign-in.test.ts`, `test-shelter-copy-gate.test.ts` | `access.ts:55-61`: the lifting PR "deletes `open_for_tests_only`, its production guard and its source scan, all in the same change"; KH-T1's switch had no other use | `git grep -n open_for_tests_only -- apps packages` returns nothing; those suites green |
| 1.4 | **[Oleksii decides, 0.3b / P6CS Q8]** `refused_until_edit_screens`. If deleted: the `SHELTER_WRITES_NOT_YET_AVAILABLE` deny code and error (`access.ts:35`; `packages/contracts/src/errors.ts:118-121`; `procedures.ts:130-138`), `kabinet.profileEdit.errors.notAvailable` (uk.ts:1031, its `en.ts` twin and pins), and the shelter-admin `read_only` branch of `home.ts` (the support view stays read-only). If kept as an off switch: keep them, and say in `access.ts` what flipping it back does | as listed | P6CS §1.8, Q8. Recommend delete: flipping it back needs a deploy anyway, and dead branches decay | the contract test pins each procedure's errors; `git grep SHELTER_WRITES_NOT_YET_AVAILABLE` matches the decision |
| 1.5 | **Unchanged, and re-checked:** a support view writes nothing; another shelter's animal is FORBIDDEN; memberships come only from the operator's invitation and the automatic accept | `access.ts:240-250`; `shelter-writes-refused.test.ts:202-213`; `no-self-serve-yet.test.ts:83-202, 224-278` | S5 ("No write endpoint may accept a request from an impersonation session"); commitment #6's successor (P6CS §4) | those tests unchanged and green |

## 2. Delete the allowlist

| # | Change | Files | Why | Verified by |
|---|---|---|---|---|
| 2.1 | Delete the module | `apps/web/src/kabinet/write-allowlist.ts` (whole file; its own doc comment, :31-32, says so) | K-Q17 | file gone |
| 2.2 | Delete the build and boot checks | `apps/web/src/api/build-env.ts:3, 222-224`; `apps/web/src/api/env.ts:4, 293-296, 303` | K-Q17 ("validated KABINET_WRITE_ALLOWLIST … PR 6 deletes all of it") | build-env and env suites green without them |
| 2.3 | Delete or rewrite the tests | `build-env.test.ts:505-556`; `env.test.ts:496-521`; `access.test.ts:193-319`; `home-page.test.ts:153-176` (the allowlist cases become the open policy's); `shelter-writes-refused.test.ts:215-307`; `no-self-serve-yet.test.ts:280-341`; `production-sign-in.test.ts:355-409`; `test-shelter-copy-gate.test.ts:53-61`; `ShelterProfile.test.tsx:339-375` (with 3.5) | K-Q17 | `pnpm test` green |
| 2.4 | The harness stops passing it | `apps/web/test/harness/kabinet-profile-edit.harness.ts:1-18` (header), `:33` (title «(allowlisted shelter)»), `:54-56`; `apps/web/test/harness/sign-in-server.ts:56-63` (the `extraEnv` comment; drop the parameter if nothing else passes it); any PR 4/5 spec that sets it | the open policy needs no variable | the K2/K3/K4 harness flows pass with no allowlist variable anywhere |
| 2.5 | **New guard:** a source scan that no file under `apps/` or `packages/` names `KABINET_WRITE_ALLOWLIST` (the scan itself aside), so a variable left in Vercel can never be read again | new test, beside `no-self-serve-yet.test.ts` | **[Oleksii decides, 0.3e]** an env-var question under his rules, so it's in the start-of-PR batch (recommend a scan, not a build failure on a set variable, so the merge isn't coupled to the env step 8.1) | **Mutation:** add `process.env.KABINET_WRITE_ALLOWLIST` to `route.ts` → the scan names the file |

## 3. The copy gate after PR 6 (CG-B1)

| # | Change | Files | Why | Verified by |
|---|---|---|---|---|
| 3.1 | **Empty `uk.kabinet.testShelterOnly`** (after PR 4/5). Each key there gets his final text and moves to its real key, or is deleted. Known candidate: `kabinet.animalForm.listed.dateUnchanged` (PR 4 parks it, as his final text, not pending, under `testShelterOnly.animalForm` via `AnimalFormTestShelterLines.tsx`, and relaxed the empty-namespace pin in `copy-status.test.ts`; PR 6 restores the pin) (K3UK §10, his note: "If K2's confirmation buttons aren't shipped yet when PR 4 merges, this line waits under testShelterOnly until PR 5."), which PR 5 should already have moved (K2CS §13, P10). Plus any K3/K2 string the PR 4/5 builders parked as false against code | `uk.ts:962-975`; `en.ts:430` | CG-B1: "PR 6 can't merge with one left" | `copy-status.test.ts:155-158` asserts the namespace's keys are `[]` (restore it if PR 4/5 relaxed it) |
| 3.2 | **Move every component out of `features/kabinet/test-shelter-only/`** to its feature folder and mount it on the open grant | `apps/web/src/features/kabinet/test-shelter-only/`; `ShelterProfile.tsx:10, 204-208` | that folder mounts only on `editing.grantedBy === "allowlist"`: once the allowlist is gone, anything left there renders for nobody, silently | the harness flows find each K2/K3 screen by role, label or text with no allowlist variable. **Mutation:** leave one component behind → its flow fails |
| 3.3 | **Production sign-in strict.** Under the open policy `testShelterCopyExemptUnder` is false, so `signInBlockingCopy` returns every pending path | `access.ts:148-175`; `apps/web/src/kabinet/production-sign-in.ts:89-117` | CG-B1, the runtime half | `production-sign-in.test.ts:215-246` passes with `expect(kabinetPendingCopy()).toEqual([])` unfiltered; the leaf-count pin (:264) set to the new total |
| 3.4 | **CI strict.** `copy-status.test.ts`'s "nothing under kabinet.* outside testShelterOnly is pending" loses its filter. `test-shelter-copy-gate.test.ts` classifies the new variant `strict` (its `never` switch, :39-51, stops compiling until it does), or goes with 3.5, its guarantee then held by 3.3 and `copy-status.test.ts` | `packages/i18n/src/copy-status.test.ts:131-145`; `apps/web/src/kabinet/test-shelter-copy-gate.test.ts` | CG-B1, the CI half | **Mutation:** one `[COPY PENDING]` string anywhere in `kabinet.*`, the namespace included → `copy-status.test.ts` red naming its path, and 3.3's test red with `copy_pending` |
| 3.5 | **[Oleksii decides, 0.3a]** Delete the mechanism: the namespace, `AllowlistedShelterArea.tsx` and its test, `test-shelter-only.test.ts`, the mount and its tests, `TEST_SHELTER_ONLY_PREFIX` and `signInBlockingCopy` (collapsing to "any pending path blocks"), `testShelterCopyExemptUnder`, and the namespace's copy-status cases | `uk.ts:962-975`; `en.ts:430`; `features/kabinet/test-shelter-only/`; `apps/web/src/kabinet/test-shelter-only.test.ts`; `ShelterProfile.tsx:10, 204-208`; `ShelterProfile.test.tsx:10-13, 339-375`; `production-sign-in.ts:24-27, 89-107`; `access.ts:148-175`; `copy-status.test.ts:131-138, 155-171` | its only condition, a refused or allowlist policy, no longer exists after 1.2 (and 1.4); left in, it is a dormant exemption from the copy gate. Recommend yes | `git grep -n -i "testShelterOnly\|test-shelter-only" -- apps packages` returns nothing |
| 3.6 | Docs say the exemption ended: the "Copy gate scope" bullet under "What that changes" (his verbatim WM-B1 quote above it stays as written) | `CLAUDE.md:670-671`; `uk.ts:962-974` comment if the namespace stays | one document per subject | read |

## 4. `no-self-serve-yet.test.ts`

| # | Change | Lines | Why | Verified by |
|---|---|---|---|---|
| 4.1 | Rewrite the header and `COPY_GATE`: B1 no longer waits for "a later merge"; PR 6 is the edit-screens gate, for everyone | `:13-40`, `:79-81` | HS-Q3; B1 moved to the edit-screens gate (his 2026-10-14 answer, quoted at `:23-24`) | read |
| 4.2 | Delete the K-Q17 block | `:280-341` | K-Q17 | — |
| 4.3 | Invert A2: `not.toContain` «лише для перегляду» and his new §9 third paragraph, transcribed. Keep «не хочу обіцяти кабінет, якого не існує» gone. A1 stays while his §7 keeps the line; add his new §7 last paragraph. A3 stays | `:185-200` | commitment #6 (P6CS §1.1, §1.2) | **Mutation:** restore A2's old paragraph in `uk.ts` → red naming it |
| 4.4 | Add: B1 live (his §8, transcribed). Keep the membership scans: after PR 6 a shelter still can't create a membership or an invitation | new `it`; `:83-161, 224-278` kept | P6CS §4, #6's successor | **Mutation:** a second `auth_member` writer → red |
| 4.5 | Keep the file name, rewrite the header (decision taken, reversible): `docs/standing-constraints.md` #6 and the test messages cite it by name | — | avoids breaking references | — |

## 5. `shelter-writes-refused.test.ts` and the access matrix

| # | Change | Lines | Why | Verified by |
|---|---|---|---|---|
| 5.1 | Invert the walk: it still finds every shelter write (the count pin at `:137`, 16 today, set to the total after PR 4/5), and each now passes access for its own shelter's admin under the production policy, through the served router: a 200, or the handler's own typed error, never `SHELTER_WRITES_NOT_YET_AVAILABLE`. Keep the support-view block (`:202-213`) and the reads (`:183-200`). Rename to `shelter-writes-open.test.ts` (decision taken) and rewrite the header (`:17-27`) | as listed | K-Q3, K-Q4 | **Mutation:** the served constant back at the refusal → every write case red |
| 5.2 | The matrix tests: "refuses shelter writes until K2/K3 ship" and "as served (shelter writes refused)" become the open policy's matrix | `access.test.ts:99-132` | same | the matrix test, cell by cell |

## 6. Copy: his Ukrainian, transcribed and pinned (merge blockers)

Each pin is transcribed from his answer, never read back from `uk.ts` (standing constraints: "A test
may not compare output against the same constant the code renders."). [Oleksii] writes, [code]
transcribes.

| # | Key (`uk.ts` line) | What | Pins to change | Source |
|---|---|---|---|---|
| 6.1 | `forShelters.whatToPrepare`, last paragraph (:793) | commitment #6: «ви розкажете, а я внесу все сам» goes false | `copy-status.test.ts:609-624`; `no-self-serve-yet.test.ts:193-196`; comments `uk.ts:781, 790-791` | P6CS §1.1, Q3 |
| 6.2 | `forShelters.whenAnimalFindsHome`, third paragraph (:828-829), and ¶1 if Q4 says so | commitment #6: "read-only" goes false; K2 (PR 5) ships «Уже вдома» and withdraw | `copy-status.test.ts:580-607`; 4.3; comment `uk.ts:816-822` | P6CS §1.2, Q4 |
| 6.3 | `forShelters.whyThatSentence` §8 (:808-815): B1, plus «один раз» (his K4 answer 10, verbatim: "10. Rewrite in PR 6: «Речення пишете ви, коли вам зручно, і можете змінити його будь-коли.»") | commitment #7. **Correction to P6CS:** its §1.3 English ("Fixing a typo or changing a photo doesn't move it") and §2's "Never set by: … a photo change" predate RH-B7. From PR 4, a photo add, reorder or removal on a published or reserved card moves the date (D4, option (i); K3DS §7.2-§7.3). B1 must say so | new describe in `copy-status.test.ts`; 4.4; comment `uk.ts:794-807` | P6CS §1.3, Q2; D4 |
| 6.4 | `freshness.updatedAgo` (:251), B2: **K-Q14** | (a) keep «Оновлено» or (b) a confirmation word (P6CS §2). Either way the strings that quote «Оновлено» by name follow the answer: K3's `listed.dateUnchanged` and `photos.dateMoves` (K3UK §7, §10), K4's `voice.emptyMeans` / `voice.previewEmpty` (uk.ts:1067, 1072), K2's `confirm.done` and `stale.caption` (K2CS §5, §8), KABINET.md:164-165. **H2-15 rides with it** (verbatim: "keep updatedAt on the wire until the «Оновлено» copy decision. Rename in the same PR as that copy."): rename `Freshness.updatedAt` (`packages/domain/src/discovery/freshness.ts:68`, `FreshnessSchema`) to the confirmation's name, with `packages/ui` and `apps/web/src/features/discovery/mock-data.ts:32-33` | if (b): `card-text.ts` (the aria-label), `en.ts:93`, the design README lines, and the non-negotiable plural/freshness suite re-pinned at 1, 2, 5, 11, 21, 22 days (`packages/ui/src/freshness-display.test.ts`, `SwipeCard.test.tsx`) | P6CS §2; K-B1; H2-15 |
| 6.5 | `forShelters.whatHappensToAnimals` ¶4 (:738-740) «кого оновлювали найновіше» | follows K-Q14; commitment #1 unchanged. With it, K2's ordering sentence if F-T1 is still open (K2CS §10) | none today; add one if it changes | P6CS §1.6; F-T1 |
| 6.6 | `kabinet.email.invite.what` (:1179), and `invite.intro` (:1177-1178) if 0.3d | the first real shelter gets this email after PR 6 (F-B6) | `copy-status.test.ts:272-273`; `apps/web/src/kabinet/email-message.test.ts:177`; `apps/web/src/kabinet/email-delivery-test.test.ts:106`; `production-sign-in.test.ts:272` keeps it in the screenless list | P6CS §1.4 |
| 6.7 | `/pro` `about.data` (:649) | his answer 11, verbatim: "11. Yes, in PR 6: /pro says profile changes are recorded with who made them." Facts P1-P10 (P6CS §3), updated: **P6 and P7 are built** (PR 3: metadata stripped, with a GPS canary test; random keys for kabinet and onboarding uploads, P-B2, P-T9); **P8 still holds** (no takedown script: `packages/db/package.json` has no DR-F3 entry); P3 gains K-Q18 (a withdrawal's note is never in history) | `copy-status.test.ts:626-646`; `apps/web/src/app/pro/page.test.tsx:13, 27-36` | P6CS §1.5, §3, Q5-Q7 |
| 6.8 | `kabinet.profileEdit.errors.notAvailable` (:1031) | dead after PR 6, or kept with the off switch | its `copy-status` pin | P6CS §1.8; 1.4 |
| 6.9 | **Checked, not changed:** P6CS §5's list. Add `detail.notFound.body` (:311), what a person sees after «Уже вдома» or a withdrawal: true whoever removed the card, but its «з реєстру» is hit #18 (his wording, not PR 6's blocker) | — | — | P6CS §5; `copy-reyestr-hits.md` |

## 7. Docs

| # | Change | File | Why |
|---|---|---|---|
| 7.1 | Commitment #6: P6CS §4's replacement row, quoting his final §7, §9 and §10 lines; the K-Q17 conditional deleted | `docs/standing-constraints.md:359` | K-Q3 ("PR 6 rewrites commitment #6") |
| 7.2 | Commitment #7: B1 live (quoted), his K-Q14 answer (quoted), RH-B7's wording (applied in PR 4) kept; "It stops being true the day the kabinet ships editing or confirming" and the allowlist parenthesis deleted | `:358` | P6CS §4 |
| 7.3 | Commitment #2: note that every shelter now has K2's list and its own history, inventory and its own actions only; the watch items stay | `:354` | P6CS §4 |
| 7.4 | Commitment #1: note §6.5 and F-T1 | `:353` | P6CS §4 |
| 7.5 | **Done in #117 (his round-2 answer 3).** Was: the retiring section's step 4 keeps only "after PR 6: delete the variable, then redeploy". Its "before PR 6: switch it from the rehearsal id to the real shelter's id" (his RH-B6) contradicts commitment #6's register ("Falsified by a real shelter's id in `KABINET_WRITE_ALLOWLIST`") and K-Q4 ("only my test shelter's id"), and RU-B4's order (PR 6, then the dress rehearsal, then the first real shelter) never reaches it. Also :434-437 (the overwrite probe "before uploads open to any shelter, the allowlisted test shelter included": passed, P-B5), and the dress-rehearsal section's "`KABINET_WRITE_ALLOWLIST` serves only that interim" (on `origin/docs/r-ui-scope`) | `docs/onboarding-a-shelter.md:349-354, 434-437` | RH-B6; RU-B4 |
| 7.6 | Code comments the change invalidates | `access.ts:22-29, 42-81`; `home.ts:45-66, 74`; `apps/web/src/kabinet/context.ts:39`; `rpc-route.ts:103`; `route.ts:61`; `production-sign-in.ts:24-27, 89-98`; `procedures.ts:130-135`; `uk.ts:781, 790-791, 794-807, 816-822, 962-974`, the `invite.what` provenance comment; `shelter-writes-refused.test.ts:17-27`; `access.test.ts:100` | "Update any comment your change invalidates" (standing constraints) |
| 7.7 | Status lines: `docs/h2-copy-sheet.md` (A2, B1, B2), `docs/pr6-copy-sheet.md` (done in PR 6; the 6.3 correction), `docs/build-plan.md` Part 5 launch order item 1, the branch inbox file | as listed | one document per subject |

## 8. Oleksii's production and env steps

| # | Step | When | Verified by |
|---|---|---|---|
| 8.1 | **Delete `KABINET_WRITE_ALLOWLIST` from Vercel** (Production, where it was set, RH-B1), then redeploy. His words: "after PR 6: delete the variable, then redeploy" (RH-B6); "KABINET_WRITE_ALLOWLIST is only for that interim and goes away with PR 6" (RU-B5) | after PR 6's production deployment is live. Until then it keeps the rehearsal shelter's id | `vercel env ls production` doesn't list it; the dress rehearsal (§9) opens writes for a shelter nothing names |
| 8.2 | No migration is expected: nothing in §1-§7 touches SQL. If the build turns one up, it is Tier 1 with his real-Neon run (the block in `docs/onboarding-a-shelter.md`, "Migrating production": `db:check-hashes` → `db:migrate --prod --expect <production ep- id>` → `db:check-hashes`), drafted in the PR, never run by the builder | — | — |
| 8.3 | Re-run `email:delivery-test` if the invite body changed length (inbox placement was tested on today's body) | after 6.6 lands | his report |
| 8.4 | The copy and decisions in §0 | PR 6's start | inbox rows |
| 8.5 | Merge | after review and a green `pnpm check` | — |

## 9. The dress rehearsal gate (RU-B1, RU-B4, RU-B5)

Not part of PR 6's diff; PR 6 is what makes it possible. His script is
`origin/docs/r-ui-scope:docs/onboarding-a-shelter.md`, "Dress rehearsal (UI only)". His condition,
verbatim (RU-B1): "No console rpc, no scripts, no KABINET_WRITE_ALLOWLIST. … The only non-UI piece
allowed is the pre-launch gate cookie." **Before it:** PR 6 deployed, 8.1 done, R-UI 1-3 merged.

| Step (his script) | What must work through the UI | Shipped by |
|---|---|---|
| 1. Create «Притулок «Генеральна»» and verify it | create with the first admin (RU-Q6), then «Взяти на розгляд» → «Схвалити» (RU-Q4) | R-UI 2, R-UI 3 |
| 2. Resend, or invite a second address | the admins section | R-UI 3 |
| 3. The admin signs in on a phone, fills the profile, adds 2-3 animals with phone photos, publishes | K4; K3 with photos; publish from K3 or K2; all under the open policy | PR 2, PR 3, PR 4, PR 5, **PR 6** |
| 4. The adopter finds them in the deck and the gallery, reveals contacts, writes to the shelter | public surfaces; visible because the shelter is verified | shipped |
| 5. The shelter marks one adopted and hides one; he approves a donation link, suspends and reinstates the shelter, and checks the history | «Уже вдома» and withdraw; donation approval, suspend, reinstate; history | PR 5; R-UI 3; R-UI 1 |
| 6. Retire both test shelters | "Retiring the rehearsal shelter" (after the rehearsal; its step 1 uses the console `rpc` helper for admin removal, which R-UI 3's admin removal can replace) | runbook |

**What step 5's history deliberately leaves out**, so its absence isn't read as a bug: «Ще шукає»
and its undo (K-B2, S1: "no history for «Ще шукає» / undo"), a withdrawal's note (K-Q18), and the
values of animal edits (field names only, K-Q7). **Verified by:** his report, recorded verbatim in
the inbox. Then the launch order's item 3 (first real shelter, F-B6, F-B7, RH-B5), which is not
PR 6's.

## 10. At merge

- `pnpm check` green on the committed content, with the workspace unit total and the harness total
  in the PR body.
- The reviewer before commit, in a worktree (Tier 1).
- Mutations, recorded in the commit message as `mutation: <what> → <failure>`: 1.1, 2.5, 3.2, 3.4,
  4.3, 4.4, 5.1.
- Harness: the K2, K3 and K4 flows, by role, label and text, with no allowlist variable.
- Real Neon: only if 8.2 turns up SQL.

## Decisions this checklist takes (reversible; "Decisions taken" in PR 6)

- ~~**PC-T1.**~~ Moved to his batch as 0.3(e) (review of #118: an env-var question is his, not a builder decision).
- **PC-T2.** `no-self-serve-yet.test.ts` keeps its name (4.5). Reverse: rename it and its citations.
- **PC-T3.** `shelter-writes-refused.test.ts` becomes `shelter-writes-open.test.ts` (5.1). Reverse:
  keep the old name.
