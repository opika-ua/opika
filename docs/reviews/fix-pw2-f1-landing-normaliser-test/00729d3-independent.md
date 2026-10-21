Verdict for 00729d31416f774309dd6274689f76694422249f: PASS WITH NOTES

# Independent review: PR #173 (`fix/pw2-f1-landing-normaliser-test`, PW2-F1) @ 00729d3

This is an independent review. The reviewer did not build this code and did not read the builder
session's review (`reviews/pr-173-00729d3`) before writing this one. Not Tier 1. A short review,
as Oleksii asked: "A short review."

Scope: `git diff --stat origin/main...HEAD` (merge base `212709a`, the same commit as origin/main)
shows three files. They are one new test (`packages/db/test/kabinet-invite-token-landing.test.ts`,
+166), one changed test title (`apps/web/src/app/kabinet/vkhid/invite-landing-get.test.ts`, 1
line) and one inbox file. **No product code changed.** Migration: none.

## Findings (ranked)

1. **[low, note] The control doesn't check that the seeded link is "otherwise usable".**
   (`kabinet-invite-token-landing.test.ts`, control test.) The control asserts only that the three
   flags are `false`. It doesn't assert `userId` non-null, `status === "pending"` or that the
   expiries are after `NOW`. Yet `invitePasswordStateOf` (`apps/web/src/kabinet/invite-password.ts:63-64`)
   refuses on `userId === null` and on `status !== "pending"` first.
   - Mutation run: the seeded user's email changed to `someone-else@example.org` (so the left join
     finds no user) and the invitation's status set to `canceled`. Result: **7 passed**.
   - So the docblock's claim that the link is "otherwise usable" is in prose but not asserted.
   - The guard the test exists for still holds: every mutation of the normaliser call below goes
     red regardless of the seed. This is why it's a note, not a blocker.
   - Fix: in the control, also assert `row.userId` is not null, `row.status` is `"pending"`, and
     `linkExpiresAt` and `invitationExpiresAt` are both after `NOW`. That way a flag is the only
     thing that could refuse this link.
2. **[info] The wrapper's `if (flag in row)` is a conditional, but it is not an assertion inside
   a conditional.** If a refactor renamed a flag key, the rewrite would skip it. The case would
   then read `false` and fail `toBe(true)`, which is loud, not vacuous. Confirmed by mutation A
   below. No change needed.

No other findings. The assertions aren't conditional. No test compares output with the constant
the code renders: expected `true`/`false` are literals against `'t'`/null inputs. No new
dependencies, brand strings or Ukrainian copy (the Cyrillic names are fixture data).

## Mutations (run by this reviewer on the checked-out tree, each reverted; `git status` clean after)

| # | Mutation | Result |
|---|---|---|
| Builder's | `landingOf` returns `row as InviteTokenRow` instead of `inviteTokenRowOf(row)` | **6 failed / 1 passed.** `AssertionError: operator: expected 't' to be true // Object.is equality`, `… operator: expected null to be true …`, and the same pair for `hasPassword` and `member` |
| A | The wrapper rewrites nothing (`if (flag in row) row[flag] = raw;` replaced with `void raw;`) | **6 failed / 1 passed**, e.g. `AssertionError: operator: expected false to be true`. A wrapper that never touches the row cannot pass vacuously |
| B | Normaliser made fail-open: `isRefusalFlagSet = value === true` | **6 failed / 1 passed**, e.g. `AssertionError: member: expected false to be true` |
| C | Only `hasPassword` left un-normalised (`raw.hasPassword as boolean`) | **2 failed / 5 passed**: `AssertionError: hasPassword: expected 't' to be true` and `… expected null to be true`. A partial call is caught for each flag on its own |
| D | Seed with no matching user and the invitation `canceled` | **7 passed.** See finding 1 |

## Verified vs taken on trust

| Claim | Status |
|---|---|
| Diff is test, test title and inbox only; no product code | **Verified** (`git diff --stat origin/main...HEAD`) |
| The new test calls `kabinetInviteTokenRepo.landingOf` itself through a `db` proxy, not the normaliser alone | **Verified** (read the test; mutations Builder's and C hit `landingOf`'s call site) |
| Control over the real driver reads all three flags `false` | **Verified** (passes against local postgis 17-3.5 via postgres-js) |
| 6 cases ('t' and null × operator, hasPassword, member); each reads as refused, the other two stay `false` | **Verified** (test output lists 6 cases; mutation C shows the other-flag isolation) |
| The seeded link is otherwise usable | **Not verified by the test.** Prose only (finding 1). By reading the seed it is true today: pending, expiry +72h, matching user |
| Builder's mutation text | **Verified**: reproduced the same failure messages |
| New test: 7 passed | **Verified** |
| `@opika/db` full: 53 files, 955 passed / 1 skipped | **Verified** (same numbers) |
| `@opika/web` `vitest run invite`: 5 files, 67 passed | **Verified** (same numbers) |
| `pnpm typecheck` ok; `pnpm lint` 0 errors (159 warnings, 1 info) | **Verified** (same numbers; biome on the two changed test files: clean) |
| Retitled test body unchanged | **Verified** (1-line diff, title only) |
| New title matches PW2-Q1 (a) | **Verified** against his recorded answer in `docs/decisions-inbox/feat-pw-2-invite-password.md:23`, verbatim: "Opening an invite link counts against the per-IP page budget. The lookup itself adds no extra limit." "The lookup charges no budget of its own" says the second sentence, and it doesn't deny the first. The body asserts `charges` (the lookup's own budget) is never called. |
| Inbox row quotes his PW2-F1 words verbatim, as his | **Verified against the wording in this reviewer's brief**: character-for-character identical. Taken on trust that the brief reproduces his message (no repo record before this commit to check against) |
| The test docblock's fail-closed quote | **Verified against the brief's wording**: identical, curly quotes included |
| Notes 1 and 2 are what the 663b00e review asked for | **Verified** (`origin/reviews/pr-171-663b00e:docs/reviews/feat-pw-2-invite-password/663b00e.md`, items 1 and 2) |
| Real Neon (`neon-http`) behaviour | **Not run.** No Neon access, by guardrail. The test injects the non-boolean values itself, so it is driver-independent by construction |
| Full `pnpm check` (build:web, test:harness) | **Not run** (and not run by the builder; stated in the commit). A test-only change with no frontend surface |

## Environment

- Node v24.22.0 (the official tarball; the container's default was v22, and nvm wasn't installed).
- pnpm 11.20.0 via `corepack install`; `pnpm i --frozen-lockfile`.
- Docker daemon started by hand; `docker compose up -d` (postgis/postgis:17-3.5), then
  `docker compose down -v` afterwards.
- No production, Neon or secret access.

## What blocks

Nothing. The note is non-blocking, so the builder may fix it without another review (working mode,
2026-10-17).
