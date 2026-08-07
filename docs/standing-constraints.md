# Standing constraints

Applies to every phase, every pull request, every agent. Imported by `CLAUDE.md`.

These exist because each one was violated, and each violation cost real time. The reasoning
is recorded so it survives after the incident is forgotten.

---

## How work is verified

**A user-interface item may not be marked done on the basis of inspecting markup.** It
requires a rendered assertion — a component test or a harness run — or a documented manual
device test with a screenshot. Text appearing in HTML is not evidence that anything works.

*Why:* `/discovery` was reported as rendering because its HTML contained the expected card
text. An action row was sitting on top of the card and the swipe gesture was completely
dead.

**A claim of "passes" requires having run it.** Not believing it would pass.

*Why:* M0 reported `pnpm check` green when `node_modules` did not exist on disk.

**Ask of every test: would this fail if the thing it guards were broken?** If you cannot
answer, the test is decoration.

*Why:* a harness lock measured wall-clock event delivery rather than gesture velocity, so
it passed under load and failed when idle — silently, on a shared runner.

**"Theoretically possible but practically unlikely" is not a review verdict.** Verify, or
record as unverified. Never as unlikely.

*Why:* three findings dismissed that way — listener churn on every render, a commit path
depending solely on `transitionend`, and a conflict between two stated photo dimensions —
were all real.

---

## How work is kept

**Commit after each task, not at the end of a session.**

*Why:* nine files containing a test harness and six verified bug fixes were destroyed by a
branch switch, having sat uncommitted for three hours. Recovery via stash, `fsck` and build
sourcemaps all came back empty.

**One document per subject.** When a document is superseded, replace it or reduce it to a
pointer. Never leave a stale one looking authoritative.

*Why:* a build plan whose later milestones no longer applied, and a state document naming a
folder that had since moved. Both were true when written.

**Check a document's claims before relying on them.** Paths, files, branches. A handoff
describes a moment.

---

## Code

- **No `any`.** Biome errors on it.
- **Every state that isn't a boolean is a discriminated union**, generics over string
  enums, distinguishing field named consistently within a type (`kind`, `status`, or
  `source` — pick one per type). If a boolean flag needs a comment explaining what it
  means in each state, that comment is the union struggling to get out.
- **`now` is a parameter** to any function that should be pure. Never read the clock inside
  one.
- **Public views are built with `pick`, never `omit`.** `omit` is allow-by-default: a field
  added to a domain object appears in the API silently. The fields being withheld are
  shelters' exact addresses and phone numbers.
- **Every handler goes through `implement(contract)`**, which is what applies output
  stripping. The type system cannot enforce this; a test does.
- **Comments explain *why*.** Update any comment your change invalidates — a wrong
  rationale is worse than none, because the next reader trusts it.
- **No brand strings** in `packages/domain` or `packages/contracts`.
- **Justify every dependency** beyond what is already in the catalog.
- **Keyset pagination, never `OFFSET` — with one named exception.** `gallery.list` and
  `gallery.relaxationCounts` may use `OFFSET`, because the gallery's numbered pages
  (`?stor=N`, indexed, degrading to a plain list without JS) are a product requirement a
  keyset cursor cannot serve at all — not a discipline question, a shape one. Bounded at
  2,000 matching rows per filter combination (~83 pages at 24/page); beyond that,
  `gallery.list` caps navigable pages at the boundary rather than serving unbounded depth.
  `feed.list` (the deck) stays keyset — this exception does not extend to it, and any
  other `OFFSET` in the codebase is the finding it always was. Full reasoning in
  `docs/gallery-contract-decisions.md` §1.

  ⚠ The 2,000-row bound is a proposal, not a specification, in the same sense CLAUDE.md's
  decision #6 flags its verification-evidence thresholds — the *exception's shape* is
  settled; the number is negotiable.

---

## Product rules that are not negotiable

**Freshness is honest and never alarming.** Three pips plus the day count in words, always
both. Never red, never amber, never opacity as a carrier of meaning. An unknown field reads
as «Не записано» — never as "no", never as an error.

**A fostered animal never gets a map pin.** City-precision location renders as a place
name. A pin would claim precision that does not exist, and no exact address of a foster
carer is ever stored or shown.

**The swipe is filtering, not judging.** «Не зараз», never "nope". A right swipe is an
inquiry, not a match — the shelter is not swiping back. No stamps, scores, streaks or
celebration.

**The platform never touches money.** Donations are external links to the shelter's own
payment page, with the destination domain visible before the user taps.

**No real shelter data in the repository.** It is public. Seed data is fictional.

---

## Where the gates are

- `pnpm check` — typecheck, lint, tests, `next build`, and the rendering harness.
- Branch protection on `main`: pull request required, CI must pass, no bypass. The agent
  pushes with your credentials, so bypass would apply to it too.
- A `PreToolUse` hook refuses pushes to protected branches. It is a convenience gate;
  GitHub's rule is the authority.
