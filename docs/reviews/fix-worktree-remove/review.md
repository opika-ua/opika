# Review: b8720c8 (WIP, worktree:remove + harness orphan check + per-checkout port). Tier 1, synchronous

VERDICT: PASS WITH NOTES (findings 1 to 3 must be fixed before commit, then re-reviewed)

| VERIFIED | TAKEN ON TRUST |
|---|---|
| tools.test.ts: 12/12 pass | Builder's full `pnpm check` (1757 tests, harness 217, port 3304). The WIP commit body has no pasted output; the real commit needs it |
| Playwright 1.62.1: webServer uses `launchProcess` (runner/index.js:856), and that kills with `taskkill /pid … /T /F` or `process.kill(-pid)` (coreBundle.js:8988/8995) | That the orphan seen earlier came from killing the runner itself |
| Next 16 `next start` serves in-process (cli/next-start.js:102), so the matched pid is the one holding the port | POSIX paths (`ps`, killTree), not run |
| Orphan check end to end: a fake `node <wt>/fake.cjs next start --port 3179` makes harness-orphans exit 1 and name the pid. It exits 0 once the fake is killed. `run-harness.mjs --list` exits 0 clean and 1 with the orphan | Builder's other 4 mutations (claimed, each described concretely) |
| Spot-checked mutation: `includes(root)` instead of `` `${root}/` `` gives 2 red, as claimed | |
| CIM query: about 0.55s, 174 KB | |
| Probes against real temp repos (findings 1 to 3) | |

## FINDINGS

1. **[high] worktree-remove.ts:111–134. Uncommitted and untracked work is deleted silently, with exit 0.** Nothing like `git status` runs before `rm`. Plain `git worktree remove` refuses a dirty tree; this tool doesn't.
   Failure scenario: a review worktree holds an unsaved fix (the "nine files destroyed" incident in standing-constraints), and the fix is gone.
   Evidence: I put an untracked file in a worktree and the tool printed `Removed …` and exited 0. The fix: refuse when `git -C <wt> status --porcelain` is non-empty, and also refuse `locked` worktrees. If an override flag is wanted, that is Oleksii's decision, not a default.
2. **[high] worktree-remove.ts:125. A registered worktree nested inside the target is deleted too**, and its work with it. No check covers registered worktrees that sit beneath the target.
   Evidence: with `wt3/inner` registered and holding a file, removing `wt3` deleted both and exited 0. The fix: refuse if any other registered worktree `isInside` the target. That also covers the main checkout by construction.
3. **[medium] worktree-remove.ts:125. `rm(target)` runs on the raw path while every check runs on `canonical(target)`.** Passing a junction to a worktree deletes only the link, then prints "Removed …, and git pruned it" and exits 0. The worktree is still there.
   Evidence: probe output, `wt2 exists: true`, and it's still in `git worktree list`. The fix: `rm(canonical(target))`.
4. **[medium] processes.ts:79–84 + killTree. `--kill` ends any process whose command line merely *mentions* the path, and its whole tree.** Example: a VS Code main process first launched as `code D:\wt`. `taskkill /T` on it closes every VS Code window, other projects included. Oleksii said "processes found inside the worktree". The fix: kill only where the image or script path is inside the worktree. Processes that only mention it get listed, never killed.
5. **[medium] processes.ts:17–33. Listing fails open.** PowerShell or `ps` exiting non-zero or empty gives `[]`, which reads as "nothing running". `rm` then proceeds, and `harness-orphans` reports a false green. There's no `timeout` either. The fix: check `status`/`error`, add a timeout, and throw.
6. **[low] worktree-remove.ts:125–131. `rm` throws after its retries, so the `FAILED` branch is unreachable for EBUSY.** You get a half-deleted, still-registered tree and a stack trace, and `prune` never runs.
7. **[low] run-harness.mjs:8. `shell: true` re-splits the forwarded args.** `--grep "gallery layout"` lists 28 tests through the wrapper and 0 when run directly.
8. **[low] harness-orphans.ts:8. The doc claims "no process the harness started" may outlive it. It checks only `next start` on the port**, so the comment should be narrowed to that.
9. **[low] processes.ts:97. On POSIX a non-leader falls back to a single-pid kill**, so the "and its children" log is false there. `-pid` itself is safe: it only hits a group that pid leads.

**Deviation.** It honours the intent. Tree-kill is verified as already done by Playwright, and the check is behavioural: red on a real survivor. Telling Oleksii is the right call. No decision is needed unless he wants teardown owned in-repo.

**Same-checkout `next start` on the derived port.** A false positive here is acceptable: it's rare, and it's loud with the pid named.

## SIMPLIFICATIONS
- worktree-remove.ts:35–49: `samePath`/`isInside` re-implement `normalise` from processes.ts. Export one helper. Risk: none, the behaviour is identical.
- tools.test.ts:179: `mkdtempSync` is never removed, so every run leaks repos in %TEMP%. Add an `rm` to `afterAll`.

## TESTS
packages/db test/tools.test.ts: 12 passed (12). Under mutation: 2 failed | 10 passed. Restored, tree clean.

---

# Re-review, delta only: a1ba8ee (second and final pass)

VERDICT: PASS. The two low notes below go to the PR comments, not to a third pass.

| VERIFIED | TAKEN ON TRUST |
|---|---|
| tools.test.ts: 30/30 pass. apps/web unit: 744/744 | Builder's full `pnpm check` (1775 unit, harness 217, orphan check clean on port 3304) |
| My mutation: drop `mentioning.length > 0` from the block → 2 red, including the real-process test "never ends a process that only mentions it, even with --kill" | The "12 mutations recorded": none appear in a1ba8ee's commit body (the message is just "WIP: review fixes 1-9"). The real commit must carry them, plus the pasted `pnpm check` |
| My mutation: dirty refusal disabled → 2 red, including the real-repo untracked-work test | rm(canonical) on its own: the builder's point stands, because the link refusal comes first |
| Findings 1–3, 5 and 6 each have a real-repo or injected-failure test (lines 349–405), and none of those assertions is conditional | |
| Wrapper test (tools.test.ts:419) guards `expected > 0`, so it can't pass on 0 = 0 | |
| `listProcesses` throws on error, timeout, non-zero exit or empty output, and both callers catch it and exit 1 | |

Findings 1–9 and both simplifications are resolved as described.

## Notes (low, non-blocking)

1. **processes.ts:211. `killTree` returns `"tree"` on Windows without checking taskkill's exit code.** An access-denied failure still logs "Ended pid … and its process tree", the kind of over-claim finding 9 removed. The later `rm` failure does surface it, so this one is cosmetic.
2. **processes.ts:163. `programPaths` takes the first non-flag token as the script, so a flag's value can be misread.** `node -r D:\wt\hook.js C:\elsewhere\app.js` is classed as owned, so `--kill` would end it. It does hold a worktree file, so the outcome is defensible, but the classification is wrong in principle. Misreads in the other direction only block removal, which is safe.

## TESTS
packages/db test/tools.test.ts: 30 passed (30). Under each mutation: 2 failed | 28 passed. apps/web: 744 passed (744). Both mutations restored. `git status` shows only this review file.
