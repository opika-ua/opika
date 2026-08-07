---
description: Audit a pull request the way a sceptical reviewer would — claims against evidence, not code style.
argument-hint: <PR number, or a branch name>
---

Audit **$ARGUMENTS**. This is not a code-style review — the `reviewer` subagent already ran
during implementation. This asks a different question: **is what the pull request claims
actually true?**

Read `CLAUDE.md`, `docs/standing-constraints.md`, `docs/build-plan.md` and the relevant
sections of `docs/design/README.md` first.

Fetch the pull request body and diff (`gh pr view`, `gh pr diff`). Run the tests. A review
that did not run the tests is an opinion.

## 1. Test every claim in the body

For each definition-of-done item marked done: **find the thing that would fail if it were
false.** A test, a harness assertion, a documented device test with a screenshot.

If nothing would fail, the item is **asserted**, not verified — regardless of what the
body says. Say so plainly.

This project has been misled three times by exactly this: a milestone reported `pnpm check`
passing when `node_modules` did not exist; a milestone ticking its definition of done while
noting "no integration tests" in the same document; a page reported as rendering because
its HTML contained the expected text, while an action row sat on top of the card and the
gesture was dead.

**Text present in markup is not evidence. A file existing is not evidence. A type
compiling is not evidence.**

## 2. Look for the recurring failure patterns

- **A test that passes for the wrong reason.** Does it fail when the thing it guards is
  broken? One harness lock in this repo measured runner latency rather than gesture
  velocity, and so passed under load and failed when idle. If you cannot tell, say the
  test is unverified.
- **A green check on a broken artifact.** Typecheck passed for weeks on an application
  that could not build, because nothing ran `next build`.
- **Denormalised values that can drift.** This schema has several; ask what keeps them in
  step and whether a test would notice if it stopped.
- **A safe path that depends on remembering.** If the only available implementation of
  something security-relevant is the unsafe one, that is a finding.
- **`omit` where `pick` belongs**, or any domain field reaching a client without passing
  through an explicit projection.
- **Stale rationale.** A comment or document the change invalidated. The next reader
  trusts it.

## 3. Check it against the design

Where the pull request touches UI, compare against `docs/design/README.md`. The design
specifies exact values — colours, spacing, motion timings, thresholds, pip geometry. A
deviation is a finding whether or not it looks fine, because the next surface built will
inherit the drift.

Two rules override everything: freshness is never signalled with red, amber or opacity;
and a fostered animal never gets a map pin.

## 4. Ask what it costs later

Does this turn a planned future phase into a migration? Does it add a second source of
truth? Does it introduce a value that will need changing in two places?

## Output

```
VERDICT: merge | merge with follow-ups | do not merge

WHAT'S GOOD — brief, specific, and only if true

FINDINGS — most severe first
  <file:line> — the defect, how it fails, what it costs

CLAIMS THAT DON'T HOLD
  <the claim> — what the body says, what is actually true

VERIFIED vs ASSERTED — the honest ledger for this PR's definition of done

BEFORE MERGING — what must change, if anything
AFTER MERGING — what should become an issue
```

State findings plainly. Do not soften a real defect to be agreeable, and do not manufacture
findings to look thorough — "merge, nothing found" is a legitimate and useful result. If
the work is good, say so briefly and stop.
