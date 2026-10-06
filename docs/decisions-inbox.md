# Decisions inbox

One table, on `main` only, append-only. Replaces `docs/decisions-pending-review.md`'s
per-branch narrative copies for every decision made from 2026-10-04 onward — see
`docs/handoff-2026-10-04.md` §4.4 and `CLAUDE.md`'s working loop, "Decisions stop blocking."

`docs/decisions-pending-review.md` is superseded and kept as read-only history; its own entries
are not migrated here.

## How this file is used

- A **Tier 2 decision never blocks the builder.** Take the recommended default, add a row here,
  continue. Oleksii answers in bulk when he reviews the PR; an override becomes a small
  follow-up commit, and the row's **Status** column is updated to `overridden` with a pointer to
  that commit. **This is not the STOP list** (`CLAUDE.md`'s "Stop and ask, regardless of what the
  reviewer said") — an ambiguous design with no mock, a new or changed user-facing claim, and the
  rest of that list still stop and wait, never take a default, no matter which tier the
  surrounding code is.
- A **Tier 1 decision still blocks the merge** — but not the rest of the branch. Add the row,
  commit the work, move to the next row that doesn't depend on it.
- **Ukrainian copy never blocks code.** New strings ship as `[COPY PENDING]`, pinned by
  `copy-status.test.ts`; the English sense and key name go in the **Question**/**Options**
  columns here. The only copy that *does* block a merge is a `/prytulkam` commitment sentence
  (`docs/standing-constraints.md`'s register), because a false sentence must never be live.
- **Branches write new rows to `docs/decisions-inbox/<branch>.md`** (same columns, one table, no
  header boilerplate needed beyond the column row) rather than editing this file directly — this
  file lives on `main` only. **Appending the branch's rows to the table below is part of merging
  the PR** — Oleksii's own action, since the agent never merges — done at the same time as
  deleting the branch's own `docs/decisions-inbox/<branch>.md`. A branch's rows are not "in" the
  inbox for his bulk-answer pass until that append has happened; say so explicitly in the PR body
  rather than assuming it's automatic.
- **Status** is one of: `open` (Tier 1, awaiting Oleksii), `default-taken` (Tier 2, no response
  needed unless he overrides), `answered` (he responded — see his answer column), `overridden`
  (he changed a default-taken row after the fact).

## Table

| ID | Date | Row | Question (one line) | Options | Default taken | Oleksii's answer | Status |
|----|------|-----|----------------------|---------|----------------|-------------------|--------|
| B1-1 | 2026-10-04 | `docs/handoff-2026-10-04.md` block 1, "RATE_LIMITED сьогодні/завтра wording" | `uk.errors.rateLimited.body` ("Наступні — завтра.") reads as a calendar-day reset; the real mechanism is a rolling 24h window counted from each reveal's own timestamp, not midnight — a unit freed at 11:00 yesterday frees again at 11:00 today, not "tomorrow." Is the current wording close enough, or does it need revising to describe the rolling window honestly? | (a) leave as-is — it under-promises rather than over-promises, a minor inaccuracy in the safe direction; (b) revise to name the rolling window directly (new Ukrainian, not mine to write) | none — not a Tier 2 default, this is his call on his own prior wording, not a reversible implementation judgement | | open |
| MK-1 | 2026-10-06 | build-plan BR-1 (brand-review C1) | `reveal.reflection1` «Це 10–15 років разом, а не вихідні.» renders for every animal, seniors (8 yr+) included, where it's false. Sense wanted: "this is years together, not a weekend" — true at any age. | (a) brand-review proposal «Це роки разом, а не вихідні.»; (b) your own wording; (c) delete the line now, replacement later | none — Ukrainian copy | | open |
| MK-2 | 2026-10-06 | build-plan BR-1 (brand-review C2) | `location.lineFostered` «м. {city} · у домі волонтерки» and `cardMeta.fosteredHousing` «живе у волонтерки, м. {city}» assert a female carer; the model stores only a city. Dormant `location.fostered` has the same issue. Sense wanted: "in foster care, in {city}", no gender. | (a) brand-review proposal «м. {city} · на перетримці» / «на перетримці, м. {city}»; (b) «у тимчасовій родині» variant; (c) your own wording. Dormant `location.fostered`: rewrite to match, or delete | none — Ukrainian copy | | open |
| MK-3 | 2026-10-06 | build-plan BR-1 (brand-review C3) | `exhausted.newAnimals`' second sentence «Зазвичай раз на кілька тижнів.» is a frequency claim nothing measures. | (a) delete the second sentence, keep the first unchanged; (b) keep it | (a) — a pure deletion, which needs no copy approval (`docs/standing-constraints.md`, "Removing a false claim is not the same gate as adding one"); listed so you see it | | default-taken |
| MK-4 | 2026-10-06 | build-plan BR-1 (brand-review C4) | `about.free` (`/pro`) says the registry «лишиться безкоштовним» (an unconditional promise), then concedes it might change. Commitment #3 is "notice before change", not "free forever". `docs/prytulkam-argument.md` §2 praised this string and said not to hedge it; the register and the marketing handoff §3 are newer. | (a) align with `forShelters.cost` — brand-review proposal «Реєстр безкоштовний для притулків — сьогодні і далі. …»; (b) delete «і лишиться безкоштовним» only (a deletion, no new copy); (c) keep as is, per the prytulkam-argument | none — your prior wording, your call | | open |
| MK-5 | 2026-10-06 | build-plan BR-2 (brand-review D2) | Dormant `exhausted.footnote` «…напишіть нам, і ми з ним поговоримо» uses «ми» for one person's work (commitment #6). Nothing renders it. | (a) delete the key; (b) keep it for a future render site, rewritten — brand-review proposal «…напишіть мені, і я з ним поговорю.» | (a) delete — dormant, and deletion needs no copy gate | | default-taken |
| MK-6 | 2026-10-06 | build-plan BR-3 (brand-review M5) | `detail.shelterVerifiedYears` «Перевірений вручну · {years} на Opika» reads «0 років» for a shelter's whole first year, and holds the working name. Sense wanted: "manually verified · in the registry since {month year}". Constraint: `Intl` month+year in `uk` gives the nominative «жовтень 2026 р.», not the genitive «з жовтня 2026» — the sentence has to read correctly around that form. Must land before `REGISTRY_HAS_NO_REAL_SHELTERS` flips. | (a) a since-date wording of yours that fits `Intl`'s nominative output; (b) keep years and accept «0 років» | none — Ukrainian copy | | open |
| MK-7 | 2026-10-06 | build-plan BR-5 (brand-improvements #1) | Non-affiliation footer line. Sense: "An independent project run by one person. Not a state or city service." Placement: `Footer` renders on the gallery, detail, `/pro` and `/prytulkam`, not on the deck. | Copy: (a) brand-improvements proposal «Незалежний проєкт однієї людини. Не є державним чи міським сервісом.»; (b) your own wording. Deck: (i) footer pages only; (ii) also in the deck — needs a design, no mock exists | none — Ukrainian copy, and the deck placement is a design with no mock | | open |
| MK-8 | 2026-10-06 | build-plan BR-6 (brand-improvements #3) | The `fresh` pip is `#1B3A6B`, which `docs/design/README.md` defines as "confirmed by the state registry" and, at line 273, as "someone confirmed this". Commitment #7 forbids calling the freshness date a confirmation. | (a) the blue means the state registry only; the fresh pip goes ink `#101112` — states stay distinct by count and position, ink clears 3:1 easily; costs a token change, the contrast harness and spec text; the brand is left with no colour of its own. (b) keep blue, rewrite the spec to "updated recently" — about 1 h, but one colour then carries two meanings. Interaction: H2 adds `last_confirmed_at` (a real confirmation), after which a blue "confirmed" pip could be honest if keyed to that column instead of `last_updated_at`. Answering (a) now doesn't block that later | none — yours | | open |
| MK-9 | 2026-10-06 | — (brand-improvements #2) | Keep "Opika" or rename? A rename is cheapest now, before H6's first shelter contact. After that it also costs trust ("promise and vanish"). | (A) keep «Opika», Latin wordmark — no cost; record it as settled in `standing-constraints.md`. (B) keep the name, Cyrillic «Опіка» wordmark — ~3 h, strengthens the legal-guardianship connotation. (C) rename — 6–10 h plus a naming exercise with trademark/domain checks. The marketing doc leans A | none — yours | | open |
| MK-10 | 2026-10-06 | Part 5, `SITE_IS_PUBLICLY_DISCOVERABLE` (adopter-launch-plan D1) | Lift `noindex` at the first verified shelter or the fifth? | (A) at shelter 1 — starts the search clock, and the copy already handles a small registry honestly; a near-empty registry is what Google visitors see. (B) at shelter 5 — fuller first impression, search starts weeks later. The marketing doc leans A. Either way, Part 5's shared-store rate limiter and pre-launch-gate removal come first | none — yours | | open |
| MK-11 | 2026-10-06 | build-plan BR-7 | The per-animal OG card's content list (brand-improvements #5) includes age. The age bucket is derived at read time (CLAUDE.md #4), so a cached preview can go stale, e.g. a puppy still shown as «малюк» months later. That is the same reason relative dates are excluded. | (a) leave age out of the image; (b) include it, accepting the staleness | none — this picks what permanent content appears on a public-facing surface with no mock for its exact field list, overriding brand-improvements' own proposed content list; reviewer-caught (`docs/reviews/`), not a Tier 2 default despite the clean technical argument for (a) | | open |
| MK-12 | 2026-10-06 | build-plan BR-7 | Demo gate for the per-animal OG card while `REGISTRY_HAS_NO_REAL_SHELTERS` is true: carry the disclosure, or don't render the card? | (a) render with the existing `uk.demo.*` disclosure; (b) suppress — keep today's raw-photo preview | (a) — `docs/standing-constraints.md`'s "anything demo mode suppresses needs harness coverage of its non-demo state" argues for rendering rather than hiding; the rehearsal (block 10) also runs with the flag on and checks Telegram/Viber previews, so a suppressed card would never be rehearsed either way. Non-demo state still covered by its own test | | default-taken |

**B1-1:** not a Tier 2 decision — flagged first in `docs/decisions-pending-review.md` (R3's
"сьогодні… завтра" entry, 2026-09-13) as "not a reason to change his wording unilaterally... it's
his call," carried forward here unchanged rather than re-litigated or defaulted. No code or copy
changed that row.

**MK-1 through MK-12:** from a marketing/brand review pass (`docs/marketing/`,
`docs/marketing-handoff-2026-10-06.md`, PR #66), checked against the actual code before each row
was written (file/line evidence in each row), not taken from the source docs' own claims.

Appended from `docs/decisions-inbox/chore-finish-line-block-1.md` (PR #65) and
`docs/decisions-inbox/docs-marketing-findings-2026-10-06.md` (PR #66) on merge, 2026-10-06; both
branch-local files are deleted in the same commit as this append, per this file's own rule above.
