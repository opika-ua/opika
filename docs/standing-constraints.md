# Standing constraints

Applies to every phase, every pull request, every agent. Imported by `CLAUDE.md`.

These exist because each one was violated, and each violation cost real time. The reasoning
is recorded so it survives after the incident is forgotten.

---

## Time is not a decision input

There is no deadline on this project unless the owner states one explicitly in a phase's
brief. Absent that statement, assume none, and never infer one from context, tone, or a
previous phase's framing.

**When two options differ in quality and cost, choose quality.** The gate exists to
surface what something costs so the owner can decide, not to justify a shortcut.

**"Faster" is never a reason in a decision record.** If a cheaper option is chosen, the
record must state what quality was traded and what would trigger revisiting it. A
deviation documented for speed becomes permanent — the documenting is what makes it feel
resolved.

**Do not offer speed as a dimension when presenting options to the owner.** Describe what
each option achieves and what it costs in work. Do not label one "recommended (fast)" or
contrast "ships tonight" against "real rearchitecture." If time matters, the owner will
say so; presenting it as a variable invites trading away quality that was never offered
for trade.

The 150%-of-estimate gate condition (`.claude/commands/phase.md`, Phase 1) stays, but its
purpose is to inform the owner that something is larger than planned — not to prompt
cutting scope. Report and wait.

*Why:* a phase framed around an unstated deadline led to two options being presented as
"document the deviation (fast)" vs. "real rearchitecture" — a false economy that would
have shipped a home page contradicting its own design spec, on a deadline nobody had
actually set.

## How work is verified

**A user-interface item may not be marked done on the basis of inspecting markup.** It
requires a rendered assertion — a component test or a harness run — or a documented manual
device test with a screenshot. Text appearing in HTML is not evidence that anything works.

*Why:* `/discovery` was reported as rendering because its HTML contained the expected card
text. An action row was sitting on top of the card and the swipe gesture was completely
dead.

**A claim of "passes" requires having run it.** Not believing it would pass.

*Why:* M0 reported `pnpm check` green when `node_modules` did not exist on disk.

**A test count is reported as the workspace total, or with each figure's scope named.** A
bare number ("272 unit tests") reads as the whole suite by default; a per-package count
handed over unlabelled invites exactly that misread, and the misread reads as a test loss.

*Why:* the fourth such incident in this project. E5's PR summary cited "272 apps/web unit
tests" with no total figure, against a real workspace total of 662 (607 at #39, before E5's
own 46 new tests) — the PR body itself had it right, scoped to `apps/web`; the chat summary
that repeated the same number without repeating the scope is what set off the alarm.

**Ask of every test: would this fail if the thing it guards were broken?** If you cannot
answer, the test is decoration.

*Why:* a harness lock measured wall-clock event delivery rather than gesture velocity, so
it passed under load and failed when idle — silently, on a shared runner.

**"Theoretically possible but practically unlikely" is not a review verdict.** Verify, or
record as unverified. Never as unlikely.

*Why:* three findings dismissed that way — listener churn on every render, a commit path
depending solely on `transitionend`, and a conflict between two stated photo dimensions —
were all real.

**An accessibility technicality never closes a design requirement.** `docs/design/README.md`
is the authority on what the product must do; WCAG is the floor beneath it, not the ceiling
above it. "The markup doesn't carry a role that would make this mandatory" answers a
different question than "does the design specify this," and only the second one closes a
follow-up.

*Why:* E1.5's residue check closed a 2D arrow-key-navigation follow-up as won't-do because
the gallery grid carries no ARIA `grid` role — a correct answer to a WCAG question nobody
had actually asked. `docs/design/README.md`'s own "Keyboard" table specifies exactly that
behaviour, independent of ARIA role, and had been sitting unread the whole time.

**When a mock exists, open the mock.** A prose summary of a design is not the design. If a
surface has a mock file, build from that file — a README's description of it is a lossy
secondary source.

*Why:* E3's pagination was built from the design doc's prose summary rather than the mock.
It shipped bare chevrons with a conflicting aria-label (WCAG 2.5.3 failure), no «з N»
count, and spacing off the design's scale.

**When no mock exists, the prose is the spec.** Companion to the rule above. If a surface
has no mock frame, the design document's prose is its specification and must be read
before building. Not finding a frame does not mean the surface is unspecified.

*Why:* the home page was built as a standalone route while `docs/design/README.md:427`
specified a band above the gallery grid. The frame search returned nothing and the prose
was never read.

**A test may not compare output against the same constant the code renders.** Assert
against the design's own literal copy, transcribed from the mock. A test that checks a
variable equals itself passes against any value.

*Why:* two E3 harness tests did exactly this and survived to round two.

**An interactive element ships with its focus-visible styling and a test.** Focus is not
polish applied later; a keyboard user has no other way to know where they are.

*Why:* V2 shipped five components — filter chips, reset, sort links, pagination controls,
no-match buttons — with no focus indication at all. The reviewer caught it; nothing in the
gate would have.

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

**Deduplication is a lossy operation — verify it, the same way you'd verify code.** After
removing content because another document now covers it, check that every requirement
still exists exactly once: not zero times (silently dropped, not merely restated) and not
twice (the duplication you meant to remove). "I removed the duplicate" is a claim about
where content ended up, not just that it left the first place.

*Why:* trimming `CLAUDE.md` against a new standing-constraints document, on the
instruction to remove what was now duplicated, dropped a real requirement — the
affirmative "every non-boolean state is a discriminated union" rule — because the
replacement text covering it was narrower than the original. Caught by a reviewer diffing
the actual requirement set, not by re-reading the instruction.

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
  2,000 matching rows per filter combination (~83 pages at 24/page) — not because
  Postgres struggles with the row-skip (it wouldn't, even at 20,000), but because past
  that depth numbered pagination has stopped being a sensible way to browse anything, and
  the fix is better filtering, not a higher cap. Beyond it, `gallery.list` caps navigable
  pages at the boundary rather than serving unbounded depth.
  `feed.list` (the deck) stays keyset — this exception does not extend to it, and any
  other `OFFSET` in the codebase is the finding it always was. Full reasoning in
  `docs/gallery-contract-decisions.md` §1.

  ⚠ 2,000 is confirmed, not a placeholder — but it is a number to revisit if the corpus
  legitimately approaches it, not a permanent ceiling, in the same sense CLAUDE.md's
  decision #6 treats its verification-evidence thresholds as reviewable rather than fixed
  forever.

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

## Commitments the «Для притулків» page makes

`/prytulkam` (Phase T) is the page a shelter is *sent* to in an outreach message.
Everything on it is deliberately a description of how the system behaves rather
than a promise about the future, so that each claim **breaks loudly** — someone
reading the relevant code sees the page contradicting it — instead of quietly
becoming false.

That only works if the list is written down. These are the claims, the key each
lives in (`packages/i18n/src/messages/uk.ts`, `forShelters.*`), and the change
that would falsify each one. Any work in those areas has to walk into this list
rather than around it.

⚠ Activates when the copy lands. `forShelters.*` currently holds `COPY_PENDING`
placeholders; the draft is `docs/prytulkam-copy-draft.md`. The commitments below
are already settled in substance — what is pending is the final Ukrainian.

| # | Commitment | Key | Falsified by |
|---|---|---|---|
| 1 | **Ordering inputs are date, plus card completeness in the deck — and nothing else.** «Це все, що впливає на порядок.» | `whatHappensToAnimals` | Any new ranking input. Paid placement obviously, but equally a "featured shelter" flag, a manual boost column, or a relevance score on the list surface. The list is date-only today (`GallerySortSchema` is closed at `freshest`/`longest_waiting`, and `gallery-repo.ts` deliberately does not call `scoreAnimal`); the deck re-ranks within a page on freshness 0.5 / completeness 0.3 / preference 0.2 (`DEFAULT_SCORING_POLICY`). **Phase 2 is rewarded-video ads (`docs/stack-decision.md`, "Phase 2 — rewarded-video ads"). Ads sitting *beside* listings leave this true; ads influencing *order* make it false.** |
| 2 | **A shelter is never told that someone looked at a card.** «Ви не дізнаєтеся, що хтось дивився картку, поки ця людина сама вам не напише.» | `noObligation` | Any shelter-facing surface that reports adopter engagement. This is closer than it looks: the data already exists and is already indexed for exactly that query — `reveals` stores `(adopter_id, animal_id, shelter_id, revealed_at)` **with `reveals_shelter_id_idx` on `shelter_id`**, and `swipes` stores `(adopter_id, animal_id, direction, swiped_at)`. It is true today only because no shelter-facing surface exists at all. **H2 (internal admin) is where this breaks by accident** — a "12 people took your contact this week" tile is one query, not a migration. |
| 3 | **Free today and later, with advance notice if that ever changes.** «Якщо це колись зміниться, ви дізнаєтеся заздалегідь, а не з рахунку.» | `cost` | Introducing any shelter-side charge without notifying every onboarded shelter first. Note the commitment is not "free forever" — it is *notice before change*, which is a promise about conduct and survives a pricing decision made honestly. |
| 4 | **Opika never contacts an adopter on a shelter's behalf, and never speaks for them.** «Opika не пише за вас, не пише від вашого імені і не спілкується з нею замість вас.» | `whoContactsWhom` | Any messaging, auto-reply, or notification feature that puts the registry between the adopter and the shelter. Including a well-meant "we let the shelter know you're interested." |
| 5 | **The registry never touches money.** «Реєстр не бере і не переказує грошей…» | `money` | Payment handling of any kind, including donation collection routed through the platform. Already a standing product rule above; listed here because the shelter-facing page states it as a commitment *to them*, which is a second, independent reason it cannot quietly change. |
| 7 | **The freshness date says only what it measures: «коли інформацію востаннє оновлювали».** Not "when you last confirmed" — the page must never claim a confirmation the data model does not record. | `whyThatSentence` | Already the narrower of two available truths, chosen after checking. `freshnessOf` reads `animals.last_updated_at` directly, and that column's own schema comment calls it edit time — "a shelter fixing a typo would make a four-month wait read as freshly available". Today it never moves at all: `animalRepo.update` writes whatever `lastUpdatedAt` its caller passes, does not auto-bump, and **has no callers outside tests**, so the date currently means "when the listing was created". **When H2 builds the edit path this becomes live**, and the honest fix is a real confirmation concept — a separate column and a shelter-facing "still looking" action — not a wider sentence. Widening the copy to match a sloppier field is the one exit that is not available, because §8's entire argument is that the number can be read literally. |
| 6 | **The work on our side is done by a person, and the page says so in three places.** «ви розкажете, а я внесу все сам» (§7) · «напишіть, і я приберу» (§9) · «коли ви пишете на цю адресу, відповідаю я» (§10) | `whatToPrepare`, `whenAnimalFindsHome`, `whoIsBehindThis` | All three are true today and all three are load-bearing for trust — a volunteer is being asked to rely on a named human rather than a form. **H2 (internal admin) is where they stop being true**, and the failure mode is not that a shelter dashboard is wrong to build; it is that shipping one while these sentences still say "write to me and I'll do it" makes the page describe a product that no longer exists. When self-serve arrives, this copy gets rewritten in the same change — not left to be discovered by a shelter following an instruction that no longer matches the screen. |

---

## Where the gates are

- `pnpm check` — typecheck, lint, tests, `next build`, and the rendering harness.
- Branch protection on `main`: pull request required, CI must pass, no bypass. The agent
  pushes with your credentials, so bypass would apply to it too.
- A `PreToolUse` hook refuses pushes to protected branches. It is a convenience gate;
  GitHub's rule is the authority.
