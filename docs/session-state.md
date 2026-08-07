# Opika — where things stand

**Paused:** 6 August 2026 · Read alongside `docs/course-correction.md`, which supersedes
`docs/build-plan.md` from M5 onward.

---

## Merged and working

**Backend and domain are in good shape.** `packages/domain` (entities as discriminated
unions, shelter verification FSM, freshness, scoring), `packages/contracts` (8 oRPC
procedures, views built with `pick` so fields can't leak by default), `packages/db`
(Drizzle, migrations, keyset feed query, HMAC location fuzzing), a seed script producing
320 animals across 8 shelters, and `apps/web/src/api` with all eight handlers, a
hand-rolled anonymous session, signed cursors and split rate limiting.

**Verification infrastructure landed (PR #15).** A Playwright rendering harness at
`apps/web/test/harness`, `next build` gated in CI, happy-dom + Testing Library so React
components can be asserted on at all, and the six M5 layout/gesture fixes restored — this
time each locked by a harness assertion or a unit test.

Test counts at that point: 362 vitest, 15 harness.

---

## Open right now

**PR #16 — merge this first.** Tailwind migration, `next/font` typography, the
`implement(contract)` security lock, and measurable margin enforcement. One decision was
pending and is now made: **dropping IBM Plex Mono is approved** — 11.2% of font payload for
the `measure`/`eyebrow` roles isn't worth it, and Commissioner 500 at 11px with `0.12em`
letter-spacing uppercase substitutes cleanly. Note for the record that those roles include
the filter group labels, not just error screens.

**Design handoff v2 is in place** at `docs/design/` — it has replaced v1, and `README.md`
(34.5 KB) is the version carrying the gallery and the desktop breakpoints. One leftover:
delete `docs/design/support.js` (69 KB of prototyping runtime, not part of the design), and
confirm the `CLAUDE.md` import resolves.

**`docs/ios-swipe-investigation.md` does not exist.** It was written during M5 debugging and
lost with the nine uncommitted files. It recorded hypotheses about an iOS failure nobody has
reproduced since, and the deck is off the critical path, so do not reconstruct it — the
investigation starts fresh whenever the deck is picked up.

---

## Next: the contract reconciliation pass

**Do this before any gallery code.** The v2 design specifies five things that don't exist
in the contracts or the schema. Building first is exactly the M5 mistake.

1. **Pagination.** The gallery wants numbered pages with `?stor=N`. `feed.list` is
   keyset-paginated and structurally cannot serve "page 7" or a page count. Proposed:
   OFFSET for the gallery, keyset stays for the deck — at ~320 animals / 24 per page that's
   14 pages and the cost is negligible. **This is the first deliberate exception to a rule
   the codebase has enforced since M2**, so it needs writing into `CLAUDE.md` with a guard,
   or the reviewer's "OFFSET is a blocking finding" check will fight the design forever.
2. **Sort.** Two orderings — freshest first, and longest-waiting. The second needs a
   different column, a different keyset tuple, and its own index.
3. **`feed.count`** returning matching animals *and* distinct shelters. Load-bearing for
   both the result line and the page numbers.
4. **Relaxation counts.** The no-match state names each relaxation's yield
   ("Прибрати «розмір» (+11 тварин)"). Design as one grouped query, not N round-trips.
5. **Server rendering.** "Degrades to a plain list without JS" means the gallery is a
   Server Component fetching server-side, not a client calling oRPC. Decide how it reaches
   data and write it down. This is also the SEO path for animal profile pages.

Then: `packages/ui` and `packages/i18n` extraction (tokens and strings are still inside
`features/discovery`, and **there is still no English string file**), a real home page with
navigation, and then the gallery.

---

## Still merely asserted

From the M0–M5 audit, unverified as of the pause:

- **M3** — seed determinism and distributions. `db:seed` has never been run in a
  verification pass.
- **M4** — session security properties: timing-safe comparison, `__Host-` in production,
  30d/7d expiry, per-IP rate limiting on bootstrap.
- **M5** — everything visual that isn't geometry. No visual regression baseline. The 6°
  rotation cap, the 0.03deg/px factor, the 40px affordance ramp and the stack offsets have
  no assertions.
- **M2** — an audit claimed nothing verifies index usage, but
  `packages/db/test/feed-explain.test.ts` appears to assert exactly that. **Unresolved
  contradiction — settle it.** An inaccurate ledger is worse than none.

Known and deliberately deferred: `onPointerCancel` ignores `prefers-reduced-motion`
(pre-existing); 27 Biome console warnings in the seed script; the desktop responsive gap is
`test.fail()`-marked so it reports an unexpected pass when the work lands.

**iOS swipe still does not work.** Investigation notes in `docs/ios-swipe-investigation.md`.
It is off the critical path — the deck is a mode, not the front door — so it ships when it
works.

---

## The rules that exist because they were broken

Three milestones were reported complete on checks that confirmed shape rather than
behaviour: M0 claimed `pnpm check` passed with no `node_modules`; M4 ticked its DoD while
noting "no integration tests" in the same document; M5 verified "/discovery renders" by
grepping HTML while an action row sat on top of the card and the gesture was dead.

- **A UI item may not be marked done on markup inspection.** Rendered assertion or a
  documented device test with a screenshot.
- **"Theoretically possible but practically unlikely" is not a review verdict.** Three
  findings dismissed that way in M5 were all real. Verify, or record as unverified.
- **Commit after each task, not at the end.** Nine files of fixes were lost to a branch
  switch because they sat uncommitted for hours.

---

## The thing that actually sets the launch date

**Shelter recruitment has not moved.** Launch needs 5–10 verified shelters in Kyiv oblast
with photographed, described animals, each having written one sentence in their own words
about how current their listings are (the `freshnessSentence` field the design depends on).

The revised timeline is ~17 weeks of build from the pause, landing early February. None of
that matters if the feed is empty. Shelter #1 fully verified with ten photographed animals
was a week-6 milestone and is still outstanding.
