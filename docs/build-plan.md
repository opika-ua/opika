# MVP Build Plan — Swipe Adoption Platform

**Capacity assumption: ~10 h/week, solo.** Every number below is effort-hours, and the calendar column divides by 10. Companion to `stack-decision.md` — that document says *what* to build with; this one says *in what order* and *how long*.

---

## 0. The headline, before the detail

**Full MVP as specified: ~240 h ≈ 24 weeks ≈ 5.5 months.** At 10 h/week that's a launch around late January 2027, and side projects that run 6 months without shipping usually don't ship.

**Recommended: cut to ~150 h ≈ 15 weeks ≈ launch mid-November 2026.** Four cuts get you there, and none of them is architectural — every one is a *deferred feature*, not a *changed foundation*:

| Cut | Saves | Why it's safe |
|---|---|---|
| **No shelter partner dashboard** — you enter listings via an internal admin + CSV import | **~30 h** | At 5–10 shelters you're faster than any dashboard. Shelters will email you photos anyway. Build it when a shelter *asks* for it |
| **No adopter accounts** — anonymous device session, reveal works without signup | **~12 h** | The reveal is free; there's nothing to protect. Better Auth's anonymous plugin means adding real accounts later is additive |
| **You upload the photos** during shelter onboarding, via a script | **~8 h** | The upload *pipeline* still gets built (M6); only the shelter-facing upload UI is deferred |
| **English via machine translation + your review**, not hand-authored | **~6 h** | The i18n *infrastructure* ships from day one. Only the copy quality is deferred |

That's ~56 h — nearly six weeks of your calendar. Everything cut lands in the first post-launch sprint, and none of it touches `packages/contracts`, `packages/domain`, or the schema.

**⚠️ The real critical path is not code.** Launching needs **5–10 verified shelters with photographed, described animals**. That is phone calls, site visits, trust-building, and chasing people for photos — and in a Ukrainian oblast during wartime it will take longer than you think. **Start it in week 1, in parallel.** If code is ready in week 15 and shelters aren't, you launch to an empty feed, which is worse than not launching. Budget ~2 of your 10 weekly hours to this from day one; the code estimates below assume 8 h/week of actual building.

At 8 h/week of code, **~150 h ≈ 19 weeks ≈ launch mid-December 2026.** That's the honest number. Plan to that.

---

## 1. On "backend first" — a qualified yes

You're right that contracts and domain come first. But **pure backend-first for 14 weeks is how side projects die.** You'd have no visible artifact until March, and the swipe feel — the one thing the entire product rests on — would be unvalidated until the end.

The shape that works:

```
Phase A  weeks 1–6    Pure backend. Contracts → domain → persistence → seed data.
                      Nothing visible. This is unavoidable and it is correctly first.

Phase B  weeks 7–10   ⬅ VERTICAL SLICE. Thin API + the swipe deck against real data.
                      By week 10 you can hand someone your phone. Momentum secured.

Phase C  weeks 11–15  Thicken. Reveal flow, images, admin, i18n, PWA.

Phase D  weeks 16–19  Harden and launch. Observability, legal, real shelter data, soft launch.
```

The vertical slice in Phase B is not a detour — it's the same API and the same deck you ship. It just gets built earlier than a strict layer-by-layer order would put it. And it de-risks the single largest unknown (does a hand-rolled `PointerEvent` deck actually feel good?) at week 10 instead of week 22.

---

## 2. Phase A — Backend foundations (weeks 1–6, ~48 h)

### M0 · Repo and tooling — 8 h

| Task | h |
|---|---|
| pnpm 11 workspace, catalogs in `pnpm-workspace.yaml`, `packageManager` pinned + corepack | 2 |
| Base `tsconfig` (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Biome for lint+format (one tool, not ESLint+Prettier — lean deps) | 2 |
| `docker-compose.yml` with `postgis/postgis:17-3.5`, `.env` handling, `direnv` or `dotenvx` | 2 |
| GitHub repo (**public** — unlocks free Actions, Crowdin OSS, Blacksmith), CI skeleton: typecheck → lint → test | 2 |

**Done when:** `pnpm i && pnpm check` passes on a clean clone, CI is green, `docker compose up` gives you a PostGIS database.

> Leave `minimumReleaseAge: 1440` at its pnpm 11 default. It's your best supply-chain defense and it costs nothing.

### M1 · Contracts + domain — 22 h ⭐ the most important milestone in the plan

Pure TypeScript. **No database, no Next.js, no I/O.** This is contract-first taken literally, and it's the code you'd keep if you threw everything else away.

| Task | h |
|---|---|
| Branded ID types, `Money`, `LocalizedText`, base primitives | 2 |
| `Shelter` schema + verification FSM (`pending → under_review → verified \| rejected \| suspended`) with an exhaustive transition table test | 5 |
| `Animal` schema — discriminated unions for vaccination/spay-neuter (`unknown \| in_progress \| confirmed`, with `source` in the discriminant), `DocumentReadiness` stub, required `lastUpdatedAt` | 5 |
| `AdopterProfile` + `FeedFilters` (city, type, size, age) | 2 |
| `ContactReveal` with shelter contact snapshot | 1 |
| `Freshness` union + `freshnessOf(lastUpdatedAt, now)` + tests at uk plural boundaries (1, 2, 5, 11, 21, 22 days) | 3 |
| `scoreAnimal(animal, filters) → number` ranking function + table-driven tests | 2 |
| oRPC contract definitions (`@orpc/contract`) for the ~8 MVP procedures | 2 |

**Done when:** `packages/domain` has zero dependencies beyond Zod, ≥90% test coverage on the FSM and freshness functions, and `packages/contracts` type-checks with no implementation in existence.

> **Do not skip the exhaustive FSM test.** It's ~50 lines and it's the only thing standing between you and "we forgot the case where a suspended shelter gets re-verified" three months from now.

### M2 · Persistence — 18 h

| Task | h |
|---|---|
| Drizzle schema mirroring the contracts + first migration. `city_id` FK (btree) **and** `lat`/`lng` columns. PostGIS available but **not enabled** | 5 |
| Repositories: `animalRepo`, `shelterRepo`, `revealRepo`, `adopterRepo` — expose domain types, never the Drizzle client | 5 |
| **Keyset-cursor feed query** with filter combinations + seen-set exclusion. Never `OFFSET` | 4 |
| Integration-test harness: docker PG, per-test transaction rollback | 4 |

**Done when:** repository integration tests pass against real PostGIS, and `EXPLAIN ANALYZE` on the feed query shows an index scan with no sort.

> The seen-set is the design problem here, not the pagination. Start with a `seen_animal_ids` array on the session row; move it to Redis only if it hurts.

---

## 3. Phase B — Vertical slice (weeks 7–10, ~32 h)

**Goal: by the end of week 10 you can hand your phone to a friend and they can swipe through real animals from a real database.** Nothing else in this phase matters as much as that.

### M3 · Seed data — 6 h

| Task | h |
|---|---|
| Seed script: 8 fictional shelters across one oblast, **300+ animals** with realistic Ukrainian names, ages, sizes, mixed vaccination states, and `lastUpdatedAt` spread from today to 90 days ago | 4 |
| Placeholder photos at correct aspect ratios and file sizes (~500 KB) so the feed's loading behaviour is honest | 2 |

> **300 animals, not 20.** You cannot evaluate a swipe feed — pacing, exhaustion, filter usefulness, the freshness badge distribution — on a handful of records. This is the highest-ROI 6 hours in the plan and it's tempting to skip. Don't.

### M4 · Minimal API — 10 h

| Task | h |
|---|---|
| oRPC router implementing the contract, mounted in a Next route handler | 4 |
| Anonymous device session (Better Auth anonymous plugin) — enough to track the seen-set | 3 |
| Error mapping, Zod parse failures → typed responses, basic rate limiting | 3 |

### M5 · The swipe deck — 16 h

| Task | h |
|---|---|
| `PointerEvent` + `transform` card drag: `setPointerCapture`, `touch-action: pan-y`, transforms written directly to the node (not through React state) | 6 |
| Release physics — threshold on distance **or** velocity, spring-back, exit animation | 4 |
| Deck component: prefetch next page at N-5 remaining, empty/exhausted state, error state | 4 |
| Test on a real Android device **and** a real iPhone. Not a simulator | 2 |

**Done when:** someone who has never seen the app swipes 30 cards without a hitch, on both platforms, on a mid-range Android over 4G.

> This is the highest-risk 16 hours in the plan. If the deck feels wrong at week 10, you have 9 weeks to fix it. If you discover it at week 22, you don't.

---

## 4. Phase C — Thicken (weeks 11–15, ~40 h)

### M6 · Filters + animal profile + reveal — 14 h

| Task | h |
|---|---|
| Filter sheet (city / type / size / age), state in URL so it's shareable and back-button-correct | 4 |
| Animal profile page — full photos, description, **freshness badge**, shelter card, donate button (external link, `rel="noopener"`, destination domain visible) | 5 |
| Reveal flow: like → contact + location shown, `ContactReveal` written server-side with the shelter snapshot | 3 |
| "My reveals" list from local storage + server events | 2 |

### M7 · Image pipeline — 10 h

| Task | h |
|---|---|
| R2 bucket, presigned upload from a server action | 3 |
| `sharp` variant generation at upload: thumb 400px, detail 1200px, OG card 1200×630, AVIF + WebP | 4 |
| Cloudflare CDN domain, custom `next/image` loader pointed at R2 | 3 |

> **Never point `next/image` at Vercel's optimizer on this project**, and no wildcard `remotePatterns`. That combination is the documented cause of the four-figure Vercel bills.

### M8 · Internal admin — 12 h

Replaces the partner dashboard for MVP. Route group `app/(admin)/`, gated on an admin role.

| Task | h |
|---|---|
| Animal CRUD via Server Actions + `react-hook-form` with the Zod schemas from `packages/contracts` | 5 |
| Shelter CRUD + verification transitions (drives the FSM from M1) | 4 |
| CSV bulk import for initial listings | 3 |

### M9 · i18n — 4 h

| Task | h |
|---|---|
| next-intl wiring, `[locale]` routing, uk + en message files, `Intl` formatters in `packages/i18n` | 3 |
| Boot assertion that the runtime has full ICU (`…format(new Date(2026,0,5)) === 'січень'`) | 1 |

> Translate in Server Components and pass strings down. Zero dates, numbers, or currency in the message JSON — `Intl` handles those, correctly, including Ukrainian's four plural forms.

---

## 5. Phase D — Harden and launch (weeks 16–19, ~30 h)

### M10 · PWA + performance — 8 h

Serwist service worker, manifest, install prompt for Android, offline shell for the feed, Lighthouse pass, React Compiler on with an **exactly pinned** version, bundle audit.

### M11 · Observability + legal — 10 h

| Task | h |
|---|---|
| Sentry (errors + 1 uptime monitor), PostHog (domain events: `animal_revealed`, `feed_exhausted`, `donation_link_clicked`, `stale_listing_shown`) | 4 |
| Privacy policy + terms, **written to GDPR** (satisfies Ukraine's 2297-VI today and bill 8153 whenever it lands, and is mandatory the moment a Polish adopter uses it) | 4 |
| Cookie/consent handling — minimal, since PostHog can run cookieless | 2 |

### M12 · Real data + soft launch — 12 h

Onboard the first 5–10 shelters for real, import their animals, verify each through the FSM, spot-check every listing, then soft-launch to one shelter's own audience before any wider announcement.

---

## 6. Week-by-week, first eight weeks

The part you'll actually work from. After week 8, plan a milestone at a time.

| Wk | Code (8 h) | Shelters (2 h) |
|---|---|---|
| 1 | M0 repo + tooling | List every shelter in the oblast; find who runs each |
| 2 | M1: branded IDs, `Shelter` + verification FSM + tests | First 3 intro calls |
| 3 | M1: `Animal` unions, `DocumentReadiness`, `AdopterProfile` | Ask 1 shelter for a sample of their current listing data, in whatever format they have |
| 4 | M1: `Freshness`, `scoreAnimal`, oRPC contracts. **Milestone: domain complete** | Verify shelter #1 (NGO registration, bank account, reference) |
| 5 | M2: Drizzle schema, migration, repositories | Calls 4–6 |
| 6 | M2: keyset feed query + integration tests. **Milestone: backend complete** | Photo-quality conversation — this is where listings live or die |
| 7 | M3 seed data + M4 API start | Verify shelters #2–3 |
| 8 | M4 API finish. **Milestone: `GET feed` returns real filtered data** | Collect real animal data from shelter #1 |

---

## 7. Definition of done, per milestone

Aim these at "I could stop here and the thing still works," not at "it compiles."

| Milestone | Done when |
|---|---|
| M0 | Clean clone → `pnpm i && pnpm check` green; CI green; Postgres up |
| M1 | Zero non-Zod deps in `packages/domain`; FSM transition table exhaustive; freshness correct at all uk plural boundaries |
| M2 | Integration tests green against real PostGIS; feed query `EXPLAIN` shows index scan, no sort |
| M3 | 300+ animals, realistic distribution of freshness and vaccination states |
| M4 | Feed endpoint returns correct pages under every filter combination; cursor is stable across inserts |
| M5 | 30 uninterrupted swipes on a real mid-range Android and a real iPhone |
| M6 | Reveal writes a `ContactReveal` with a contact snapshot; freshness badge visible on every card and profile |
| M7 | One uploaded photo produces all variants in R2 and renders through the CDN |
| M8 | You can add a shelter, verify it, and publish 10 animals without touching SQL |
| M9 | Locale switch preserves route and state; no English leaks into the uk UI |
| M10 | Installable on Android; Lighthouse ≥90 on the feed |
| M11 | A thrown error appears in Sentry within a minute; domain events land in PostHog |
| M12 | 5+ verified shelters, 50+ live animals, one real adoption conversation started |

---

## 8. Decision points

Things you should *not* decide now, with the moment to decide them:

| Decision | Decide at | Default if you don't |
|---|---|---|
| oRPC 1.x → 2.0 migration | When 2.0 hits stable and you're between milestones | Stay on 1.x through launch. All contracts live in one package, so migration stays a one-package job |
| Add Turborepo | When CI exceeds ~3 min | Stay on plain pnpm workspaces |
| Enable PostGIS | When you add radius search or Polish voivodeship polygons | `city_id` FK only. `lat`/`lng` are already stored |
| Extract `apps/partner` from the web app | When a shelter asks for dashboard access **and** you have ≥15 shelters | Route group inside `apps/web` |
| Adopter accounts | When someone asks for their reveal history across devices | Anonymous session, upgradeable |
| Redis for the seen-set | When the `seen_animal_ids` array query shows up in slow logs | Postgres array column |
| Telegram bot for notifications | Post-launch | No notifications at MVP |

---

## 9. If you fall behind — cut in this order

Side projects slip. Decide the cut order *now*, while you're calm:

1. **English copy** → uk only at launch, en right after. (i18n infra stays; only the copy is deferred.)
2. **PWA install + service worker** → plain mobile web works fine. (~8 h)
3. **CSV import** → paste listings in one at a time for the first 50. (~3 h)
4. **"My reveals" list** → the reveal itself is the product; the history isn't. (~2 h)
5. **Admin CRUD** → seed script + direct SQL for the first 5 shelters. Ugly, works. (~12 h)

**Never cut:** the exhaustive FSM test, the freshness display, keyset pagination, or seed-data volume. Each of those is cheap now and expensive to retrofit — the first two because they're correctness, the last two because they're the shape of the system.

---

## 10. What this plan deliberately does not include

So the omissions read as decisions, not oversights:

- **Shelter partner dashboard** — deferred to post-launch, gated on a shelter actually asking (§0)
- **Payments of any kind** — donate is an external link; nothing is stored or processed (per the ADR, this is what keeps Phase 3 additive)
- **Push notifications** — Telegram is the better channel in Ukraine and it's post-launch either way
- **Native app** — Phase 3+ at the earliest, as a separate Expo app sharing `packages/contracts`
- **Registry / Diia integration** — the registry holds ~6,000 records and has no public API. The `VaccinationSource` port exists in M1; the adapter does not
- **Cross-border / EU document readiness** — the `DocumentReadiness` field shape ships in M1 as `{ kind: 'unknown' }`. The feature waits on the open regulatory question in the ADR
- **Content moderation** — 5–10 verified shelters are human-reviewable
- **Load testing beyond the seed set** — you are ~290 RPS away from needing it, and you'll launch at roughly 3

---

## 11. Summary

| Phase | Weeks | Hours | Output |
|---|---|---|---|
| **A — Backend foundations** | 1–6 | 48 | Contracts, domain, persistence. Nothing visible, everything load-bearing |
| **B — Vertical slice** | 7–10 | 32 | A working swipe feed over real data on a real phone |
| **C — Thicken** | 11–15 | 40 | Reveal, images, admin, i18n |
| **D — Harden + launch** | 16–19 | 30 | Observability, legal, real shelters, soft launch |
| | **19 wks** | **~150 h** | **Soft launch ~mid-December 2026** |

Running in parallel throughout: **~2 h/week of shelter recruitment**, which is the actual gate on launch date.

**The three things most likely to go wrong**, in order:

1. **Shelter recruitment takes longer than 19 weeks.** Most likely failure mode by a wide margin. Mitigate by starting week 1 and treating "shelter #1 fully verified with 10 photographed animals" as a *week-6* milestone, not a week-16 one.
2. **The swipe deck doesn't feel right and eats 20 h instead of 16.** Mitigated by scheduling it at week 10, with slack behind it.
3. **Scope creep from the partner dashboard.** The moment you start building it, the MVP becomes a two-sided product with two auth models and two release cadences. Hold the line until a shelter asks.
