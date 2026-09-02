# Stack Decision Record — Swipe-Based Shelter Adoption Platform (Ukraine)

**Date:** 5 August 2026 · **Author:** research + recommendation for a solo TS/React developer
**Status:** Proposed · **Scope:** MVP (one Ukrainian oblast) with an explicit path through Phases 2–4

> Every version number, price, and free-tier limit below was verified against a live source on 2026-08-05. Where something could not be verified, it is marked ⚠️ rather than guessed. Sources are listed at the end of each section and consolidated at the bottom.

---

## 0. The recommendation in one table

| Layer | Choice | Why (one line) |
|---|---|---|
| **Client** | Next.js **16.3** App Router, mobile-first **PWA** (Serwist), React 19.2, React Compiler pinned | You already know it; one codebase; SEO on animal profiles is a free acquisition channel a native app cannot give you |
| **Swipe deck** | **Hand-rolled `PointerEvent` + `transform`** (0 KB), `motion` w/ `LazyMotion`+`domAnimation` for everything else | The only gesture lib with the right physics (`@use-gesture`) has not shipped since March 2024; the drag itself is ~150 lines |
| **API contract** | **oRPC** in contract-first mode (`@orpc/contract`), Zod 4 schemas | Contract-first is literally your stated principle; same contract emits OpenAPI → native app + registry partners later, without a second source of truth |
| **Server runtime** | **Node 24 LTS**, inside the Next.js app (route handlers), domain logic in a framework-free package | One deployable at MVP; the domain package is the thing you extract later, not the framework |
| **DB** | **Postgres 17 on Neon (Launch, `aws-eu-central-1`)** — PostGIS available, not enabled at MVP | Plain Postgres, `pg_dump` out at any time; scale-to-zero; PostGIS present so the Poland phase is not a migration |
| **ORM** | **Drizzle 0.45.x** (→ 1.0 when it ships) | Prisma closed geometry/geography support as *not planned*; your primary query is proximity search |
| **Images** | **Cloudflare R2** + variants pre-generated with `sharp` at upload, served through Cloudflare CDN | Zero egress cost. ~$6/mo at 300k MAU vs ~$530/mo for Supabase transforms, ~$700/mo for Cloudinary |
| **Auth** | **Better Auth 1.6.x**, self-hosted, `organization` plugin for shelters | $0 at any scale. Clerk at 300k MAU = **$4,625/mo** — more than a year of every other line item combined |
| **i18n** | **next-intl 4.13.x** + native `Intl` for all dates/numbers/plurals | Paraglide's own docs tell you to use next-intl on Next.js; `Intl` handles Ukrainian's 4 plural forms and month declension correctly for free |
| **Hosting** | **Vercel Pro ($20/mo)** at MVP, images off-platform, spend cap on day one. Exit ramp: OpenNext → Cloudflare Workers | Ops time is your scarcest resource; the $30/mo you'd save self-hosting is noise against a $25–50k grant |
| **Repo** | **pnpm 11 workspaces + catalogs**. Add Turborepo the day CI exceeds ~3 min | Turborepo has nothing to cache until you have real build steps between packages |
| **Testing** | Vitest 4 + RTL 16 + MSW 2 + **4–6** Playwright specs; plain Docker PostGIS | Test the matcher, the verification FSM, and Ukrainian plural boundaries. Skip the rest |
| **CI** | GitHub Actions on a **public repo** ($0, unlimited) | Also unlocks free Crowdin OSS and free Blacksmith runners |
| **Observability** | Sentry Developer + PostHog free | $0 at MVP, ~$180/mo at 300k MAU (or ~$75 with self-hosted Umami absorbing pageviews) |
| **Backend language** | **TypeScript. Not Go.** | See §11 — at your load profile the language delta is ~3 ms against a query that dominates by 10–100× |

**All-in infrastructure cost: ~$25/mo at MVP, ~$110–190/mo at 300k MAU.** Under 1% of the grant. The naïve version of this same stack (Clerk + Cloudinary + Vercel images) costs **~$5,500/mo at 300k MAU** — $66k/year, more than the entire grant. Two decisions account for essentially all of that delta: **hosted auth SaaS** and **per-image/per-delivery media pricing**. Get those two right and nothing else you choose can hurt you financially.

---

## 1. Frontend: PWA, React Native, or cross-platform

**Recommendation: mobile-first PWA on Next.js 16.3. Native comes later as a separate Expo app that shares your contract package, not a shared-UI codebase.**

### Why not React Native / Expo now

Expo is in good health (SDK 57, RN 0.86, New Architecture mandatory since SDK 55), and if this were a native-first product it would be the answer. Three things rule it out for *this* MVP:

1. **Expo for web is not ready for a web-primary product.** Expo's own docs: static rendering is stable, but **server rendering and data loaders are ALPHA**, and React Server Components in Expo Router are **beta with 11 documented limitations**, including a literal *"production deployment is limited and not recommended yet."* React Native Web also costs ~30–40 KB gzipped over React DOM and gives up `<div>`/`<a>`/`:hover`/`position: fixed` in shared code. RNW is genuinely production-grade when mobile is primary and web is the companion (X, MLS). You are the inverse.
2. **Distribution kills your acquisition loop.** An animal profile page that ranks in Google and shares cleanly into Telegram/Facebook groups *is* your growth channel in a single oblast with no marketing budget. A native app cannot be linked to. Shelters will share links; they will not ask people to install an app.
3. **Cost and process friction.** $99/yr Apple + $25 Google, plus **EAS Update's Production tier caps at 50,000 MAU** — 300k MAU puts you into Enterprise pricing for OTA updates alone. And a *new personal* Google Play account must run a closed test with **≥12 testers opted in for 14 continuous days** before you can ship publicly (organization accounts are exempt — register the legal entity first if you ever do go native).

### What the PWA actually gets you in 2026, honestly

The good, verified against WebKit's own docs rather than the folklore:

- **Installed home-screen web apps are exempt from ITP's 7-day storage cap** and get the same origin quota as in-browser (up to 15% of disk). The "50 MB / 7-day wipe" claim in 2026 blog posts is wrong for installed PWAs.
- **Web Push works on iOS** since 16.4 (home-screen install required), and **Declarative Web Push** since iOS 18.4 removes the service-worker JS requirement entirely.
- **Ukraine is Android-majority** — 61.7% Android / 38.3% iOS, Chrome 63% / Safari 30% (StatCounter, July 2026). The iOS constraints apply to a minority of your users.
- Safari 26.4 moved scroll-driven animations to the compositor thread; View Transitions are at 88.5% global support.

The honest limitations:

- **iOS Safari caps web content near 60fps by default** — the *"Prefer Page Rendering Updates near 60fps"* feature flag is on by default, so ProMotion devices give native apps 120Hz and your web app 60Hz. For a gesture-driven product this is the single real "feels less premium" gap, and you cannot fix it. It is invisible to your Android majority.
- No Background Sync, no Periodic Background Sync, no `beforeinstallprompt` on iOS — installation is a manual Share → Add to Home Screen, and that funnel loses most users.
- **Plan Telegram as your primary notification channel in Ukraine**, with web push as a bonus. Telegram penetration in Ukraine dwarfs web-push opt-in rates, and a Telegram bot is a weekend of work.

### The swipe deck: build it, don't install it

The Tinder-deck stack people reach for is `@use-gesture/react` + `@react-spring/web`. It works, and it's 28 KB gzipped — but **`@use-gesture` has not published a release since 21 March 2024**. `react-tinder-card` is worse (last publish 2023, 16k weekly downloads).

What a library actually gives you here is *release-spring physics and velocity math* — maybe 40 lines. The event handling is:

```
pointerdown → setPointerCapture
pointermove → write transform: translate3d(x,0,0) rotate(x * k) directly to the node
              (NOT through React state — that's a re-render per frame)
pointerup   → decide (threshold on x OR velocity), animate out or spring back
CSS         → touch-action: pan-y on the card, will-change: transform
```

That's ~150 lines, 0 KB of dependency, no frozen-maintainer risk, and full control over the passive-listener and `touch-action` behaviour that causes most "the browser scrolled instead of swiping" bugs. **This is the highest-leverage piece of custom code in the whole product** — it's the interaction the entire brand rests on, it's small, and it's the one place where a dependency would constrain you.

Use `motion` (the Framer Motion rebrand, v12.43) with `LazyMotion` + `domAnimation` (~20 KB gzip, no `domMax`/drag needed) for the surrounding UI animation.

### Two Next.js decisions you should make deliberately

- **Do not turn on `cacheComponents` (`use cache`) for the MVP.** It's opt-in in 16.3, Vercel has pre-announced it becomes default in a future major, and the caching API already broke once in 16 (`revalidateTag` signature change). Ship dynamic-by-default; adopt it when it's the default.
- **Budget for monthly security patching.** This is the most under-priced risk in a solo-dev Next.js plan. December 2025 brought **CVE-2025-55182 "React2Shell," a CVSS 10.0 unauthenticated RCE** in the RSC Flight protocol, exploited in the wild. July 2026 brought **9 CVEs in a single batch**, including a middleware/proxy auth bypass and two SSRFs. Vercel now ships security releases on a monthly pre-announced cadence. Pin to an LTS line (16.2 Active LTS, or track 16.3), turn on Dependabot, and treat the patch cadence as a standing calendar item.
- **React Compiler: turn it on, pin the exact version** (`babel-plugin-react-compiler@1.0.x`, not `^`) — that's the React team's own guidance for projects without deep test coverage.

**Sources:** [Next.js 16](https://nextjs.org/blog/next-16) · [Next.js 16.3](https://nextjs.org/blog/next-16-3) · [July 2026 security release](https://nextjs.org/blog/july-2026-security-release) · [Unit 42 on React2Shell](https://unit42.paloaltonetworks.com/cve-2025-55182-react-and-cve-2025-66478-next/) · [WebKit tracking prevention](https://webkit.org/tracking-prevention/) · [WebKit storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/) · [Declarative Web Push](https://webkit.org/blog/16535/meet-declarative-web-push/) · [Expo Server Components (beta)](https://docs.expo.dev/guides/server-components/) · [Expo pricing](https://expo.dev/pricing) · [Google Play closed testing rule](https://support.google.com/googleplay/android-developer/answer/14151465) · [StatCounter Ukraine mobile OS](https://gs.statcounter.com/os-market-share/mobile/ukraine) · [Motion bundle size](https://motion.dev/docs/react-reduce-bundle-size) · [React Compiler 1.0](https://react.dev/blog/2025/10/07/react-compiler-1)

---

## 2. API layer and end-to-end type safety

**Recommendation: oRPC in contract-first mode, with Zod 4 schemas living in a shared `packages/contracts`.**

### The shortlist, current as of 2026-08-05

| Option | Health | Verdict |
|---|---|---|
| **oRPC** `@orpc/server` 1.14.14 (2026-08-04) | Very active; 887k wk DL; **2.0.0-beta.25 shipping now** | **Choose this.** Contract-first builder + OpenAPI emission from the same definitions + Server Actions support + 3.8 KB gzip client (vs tRPC's 10.9) |
| **tRPC v11** `@trpc/server` 11.18.0 (2026-06-17) | Healthy, 4.7M wk DL, six minors in March 2026 alone, **no v12 in sight** | The conservative fallback. But TS-only clients, no OpenAPI, and tRPC's *own* RSC docs say *"RSC on its own solves a lot of the same problems tRPC was designed to solve, so you may not need tRPC at all"* |
| **Hono RPC** | Runtime is excellent (56.5M wk DL) | Hono's own guide: *"the more routes you have, the slower your IDE will become"* — the fix is pre-compiling client types with `tsc`. A language server that degrades as the app grows is a real solo-dev tax |
| **ts-rest** 3.52.1 (2025-03-04) | 17 months stale; a live [*"Future of ts-rest"* issue](https://github.com/ts-rest/ts-rest/issues/797) | Don't |
| **Server Actions alone** | Native to Next | Fine for shelter-dashboard mutations. **Not consumable by a future native client** — it's an RSC-internal transport, not an HTTP API. Also the heaviest CVE surface in Next 16 |

### Why oRPC, on principle rather than hype

Your stated principle is *contract-first development: data interfaces defined before implementation*. oRPC's `@orpc/contract` package is the only option in this list where that's the **native** authoring model rather than something you impose on top:

```ts
// packages/contracts/src/animals.ts  — no implementation in sight
export const animalsContract = oc.router({
  feed: oc
    .input(FeedQuerySchema)      // Zod 4
    .output(FeedPageSchema),
  reveal: oc
    .input(z.object({ animalId: AnimalId }))
    .output(RevealResultSchema),
})
```

The router implements the contract; the client consumes the contract; neither can drift, because TypeScript checks both against the same object. That is Dependency Inversion applied at the network boundary — both sides depend on the abstraction, not on each other.

Three concrete downstream payoffs, each of which maps to a roadmap item:

1. **Phase 3/4 native app.** The same contract emits a real OpenAPI spec, so a Swift/Kotlin client can be generated. tRPC would leave you hand-writing it.
2. **Partner/registry integration.** Whether you consume the pet registry or expose data to a partner, a published spec is the deliverable they'll ask for — and you get it from the code you already wrote, not from a second artifact you have to keep in sync.
3. **Bundle.** 3.8 KB gzip client vs tRPC's 10.9 KB. Small, but it's on the critical path of a mobile-first feed.

**The risk, stated plainly:** oRPC 2.0 is in beta *right now*, so starting on 1.x means a major migration inside your build window, and starting on 2.0-beta means shipping on a beta. Its download share is ~19% of tRPC's. **Mitigation, and it's a real one:** if all your procedure definitions live in `packages/contracts` as thin declarative objects, the migration surface is one package, not the whole app. If that mitigation doesn't reassure you, **take tRPC v11 and generate OpenAPI separately when Phase 3 arrives** — the architectural shape is identical and you lose maybe two days later.

### Where Server Actions still belong

Use them for the **shelter dashboard's** forms — progressive enhancement, no client-side fetch code, and the dashboard will never be consumed by a native client. Use oRPC for everything the adopter app touches. This is not inconsistency; it's picking the transport that matches the consumer, which is the whole point of having a contract layer separate from the framework.

**Sources:** [oRPC docs](https://orpc.dev/docs/getting-started) · [tRPC RSC docs](https://trpc.io/docs/client/react/server-components) · [Hono RPC guide](https://hono.dev/docs/guides/rpc) · [ts-rest #797](https://github.com/ts-rest/ts-rest/issues/797) · npm registry, 2026-08-05

---

## 3. Database, geo-filtering, and image storage

### 3.1 Database: Neon Postgres, `aws-eu-central-1`

**Postgres, obviously** — you have state machines, relational integrity, discriminated unions to model, and eventual geo. The question is only who runs it.

| | Verdict |
|---|---|
| **Neon Launch** ⭐ | Pay-as-you-go with no monthly minimum ($0.106/CU-h, $0.35/GB-mo, 500 GB egress included). Frankfurt region. **PostGIS 3.5/3.6**, pgvector, PgBouncer + an HTTP serverless driver. Scale-to-zero (~few hundred ms resume) |
| Xata Cloud | Genuinely underrated: PostGIS 3.6.3, ~1s wake, per-minute billing, **and an open-source self-hostable version** — the best anti-lock-in story of the managed set. ⚠️ EU region availability not confirmed on their live pricing page; verify before committing |
| Supabase | Fine at Pro ($25/mo), good EU coverage. **Avoid the free tier specifically**: projects pause after 1 week of inactivity, which means your MVP is *down* when a grant reviewer clicks the link |
| Hetzner + self-hosted PG | €10–21/mo, unbeatable price. Costs you backups, patching, failover, and PITR — i.e. days you don't have |
| **Prisma Postgres** ❌ | **No PostGIS**, and bills per *ORM operation* — the least predictable model on the list for a browse-heavy app |
| **PlanetScale** ❌ | No free tier since 2024, default region us-east-1, EU on request |
| **Railway** ⚠️ | Removed its perpetual free tier; now a 30-day trial then a $1/mo minimum |

⚠️ **Neon was acquired by Databricks (May 2025).** Fallout so far is limited to Azure region deprecation and a move to pure consumption pricing. It is a real ownership-change risk, but it is mitigated to near-zero by the fact that Neon is *plain Postgres* — `pg_dump` moves you to Xata, Supabase, RDS, or your own box in an afternoon. This is the correct way to think about lock-in: not "will this vendor be fine forever" but "what does leaving cost."

### 3.2 Geo: you do not need PostGIS at MVP, and you should still choose a provider that has it

**Model `city_id` (FK, btree) as the primary filter, and store `lat`/`lng` from day one.**

Reasoning:

- **It matches the product.** Adoption is a logistics-constrained decision — people drive to a shelter. A Ukrainian adopter searches *«Львів»*, not "within 37 km." City granularity gives you clean i18n, clean SEO URLs (`/lviv/dogs`), and clean cache keys, all of which a radius query destroys.
- **At ~100k rows, the index choice is not measurable.** A bounding-box query on plain lat/lng floats with a composite btree delivers sub-100ms and is documented as working well "for tens of thousands of rows in a single metro area." `earthdistance`+`cube` would give you a real GiST radius index, but if you're going to add an extension anyway, add the one with a future.
- **The trigger to actually enable PostGIS is the Poland expansion**, where "all shelters in Mazowieckie" becomes a polygon-containment query (`ST_Contains`). At that point the migration is `ALTER TABLE … ADD COLUMN geog geography(Point,4326)`, a backfill, and a GiST index — roughly 30 minutes at 100k rows.

So: **PostGIS support is a hard selection criterion for the provider, and enabling it is a deferred decision.** That's option value at zero cost, and it's exactly why Prisma Postgres is disqualified.

### 3.3 The feed query is where your performance actually lives

Language choice is irrelevant here (see §11); these three things are not:

1. **Use keyset/seek pagination, never `OFFSET`.** A swipe feed is *the* pathological OFFSET case — users paginate deep into a filtered set. Measured Postgres timings: offset 0 → 468 µs; offset 10,000 → 3 ms; offset 1,000,000 → **87 ms**. Postgres walks and discards every skipped index row. Switching to a keyset cursor is one afternoon and is a bigger latency win than any language change in this document.
2. **Kill the N+1 on the feed page.** 20 cards × (shelter + photos + status) = 61 queries instead of 1.
3. **The "already seen" set** is the real design problem in a swipe feed. Keep it in a compact per-user structure (a `seen_animal_ids` array or a Redis set), and exclude it in the query rather than filtering client-side.

### 3.4 ORM: Drizzle

**Prisma 7 (Nov 2025) is a genuine turnaround** — Rust engine gone, ~90% smaller bundle, ~3× faster queries, generated code in your source tree. The historical complaints are substantially fixed. But:

> **Prisma closed [issue #25768](https://github.com/prisma/prisma/issues/25768) — geometry/geography support — as "not planned."**

You'd model spatial columns as `Unsupported("geometry")`, which Prisma Client cannot read or write, and run every geo query through `$queryRaw` with hand-written types. For a product whose core query is proximity search, that puts your most important code path outside the ORM permanently.

Drizzle has first-class PostGIS: `geometry('location', { type: 'point', mode: 'xy', srid: 4326 })`, GiST indexes via `.using('gist', …)`, the `<->` KNN operator, and `ST_*` functions through a composable, type-inferring `sql` template tag. Plus: no codegen step, ~7.4 KB core, and SQL you can read at 2am when you're the only person who can.

Take the stable **0.45.x** line. ⚠️ Note that Drizzle's v1.0 has been in RC for over a year (`1.0.0-rc.4`, June 2026) — that's an unusually long RC, but with 18.1M weekly downloads on the stable line it's a low-risk place to sit.

### 3.5 Images: R2 with pre-generated variants

Scenario: 20,000 listings × 5 photos = 100k images (~50 GB), ~3.9 MB served per user/month → **~1.17 TB/mo egress at 300k MAU**, ~16.5M image requests.

| Approach | Cost at 300k MAU | Risk |
|---|---|---|
| **R2 + pre-generated variants + CF CDN** ⭐ | **~$6/mo** | 🟢 R2 egress is $0. Nothing can run away |
| Bunny Storage + Bunny Optimizer | ~$22/mo | 🟢 Optimizer is **$9.50/mo flat, unlimited transformations** — the only pricing structure here where transforms cannot scale with traffic |
| Cloudflare Images (storage mode) | ~$320/mo | 🟡 The **$1 per 100k delivered** fee is what kills it |
| Vercel Blob + `next/image` | ~$100–150/mo on top of Pro | 🔴 See below |
| Supabase Storage transforms | **~$530/mo** | 🔴 $5 per 1,000 origin images with only **100 included** on Pro. 100k images ≈ $500/mo |
| Cloudinary | **~$700+/mo** | 🔴 Fungible-credit model makes forecasting near-impossible |

**Do this:** generate 2–3 variants (thumb / detail / OG-card) with `sharp` at upload time, write them to R2 as static objects, serve through Cloudflare. You pay a one-time CPU cost per photo and $0.015/GB-month forever. Point `next/image`'s `loader` at R2 — **never serve images through Vercel's optimizer on this project.**

On the Vercel bill-shock stories: the canonical case ([Metacast](https://metacast.app/blog/engineering/postmortem-llm-bots-image-optimization), ~$7,000) was **wildcard `remotePatterns` + LLM crawlers + no spend cap**, billed on the *legacy* $5-per-1,000-source-images model. Vercel's current transformation-based pricing is 60–100× cheaper per unit. The rate wasn't the problem; the configuration was. But for a grant-funded project with no revenue, an uncapped usage-based bill is a structural risk regardless of rates — which is why images go to R2 and **Spend Management gets configured on day one**.

**Sources:** [Neon pricing](https://neon.com/pricing) / [extensions](https://neon.com/docs/extensions/pg-extensions) · [Databricks–Neon](https://www.databricks.com/blog/databricks-neon) · [Supabase pricing](https://supabase.com/pricing) · [Xata pricing](https://xata.io/pricing) · [Prisma extensions](https://www.prisma.io/docs/postgres/database/postgres-extensions) · [Prisma #25768](https://github.com/prisma/prisma/issues/25768) · [Drizzle PostGIS guide](https://orm.drizzle.team/docs/guides/postgis-geometry-point) · [Why you probably don't need PostGIS](https://blog.rebased.pl/2020/04/07/why-you-probably-dont-need-postgis.html) · [Keyset vs offset pagination](https://blog.sequinstream.com/keyset-cursors-not-offsets-for-postgres-pagination/) · [R2 pricing](https://developers.cloudflare.com/r2/pricing/) · [Bunny Optimizer](https://bunny.net/optimizer/) · [Supabase image transformations](https://supabase.com/docs/guides/storage/serving/image-transformations) · [Vercel image pricing](https://vercel.com/docs/image-optimization/limits-and-pricing)

---

## 4. Authentication

**Recommendation: Better Auth 1.6.x, self-hosted, with the `organization` plugin.**

This is the single highest-stakes cost decision in the document.

| Provider | Free tier | **Cost at 300k MAU** |
|---|---|---|
| **Better Auth** (MIT, self-host) ⭐ | ∞ | **$0** |
| **WorkOS AuthKit** | **1,000,000 MAU** | **$0** |
| Auth.js / NextAuth | ∞ | $0 — but **no organization primitives**, you build multi-tenancy yourself |
| Supabase Auth (hosted) | 50k–100k | $675/mo |
| **Clerk** | 50,000 MRU | **$4,625/mo** 🔴 |
| **Kinde** | 10,500 MAU | **~$5,090/mo** 🔴 |

Clerk deserves a fair note: their free tier is now **50,000 MRU** (Monthly *Retained* Users — only counting people who return at least a day after signup), which is a materially better unit for a marketplace with lots of drive-by browsers. **Clerk would genuinely be free through your entire Ukraine MVP.** The problem is that it becomes $4,625/mo at exactly the moment you succeed — and by then it's load-bearing and painful to remove. Take the $0 option that never has that cliff.

### Why Better Auth over WorkOS (which is also $0 at 300k)

Better Auth's `organization` plugin models your two-sided requirement natively: organizations (shelters), members, invitations, teams, and `owner`/`admin`/`member` plus custom roles with dynamic access control. Your shelter verification FSM (`pending → under_review → verified | rejected`) becomes an org-level field with role checks hanging off it, not a parallel permission system you maintain by hand.

Structurally: **auth data lives in your Postgres, so auth cost scales with your database — which you're already paying for.** There is no per-user cliff, ever. And an authoritative local `users`/`organizations` table is what lets you write a single join for "animals from verified shelters in this city" instead of an API call to a third party.

**WorkOS AuthKit is the strong managed fallback** if you'd rather not own auth at all — $0 at 300k MAU, real organizations, exportable data.

⚠️ **Do not build on NextAuth v5.** `next-auth@latest` is still **4.24.15**; v5 sits at `5.0.0-beta.32` (July 2026), with six betas spanning sixteen months and no GA after three years in beta. It also has no organization primitives.

### The two identity models, concretely

- **Adopter:** low-friction. Email OTP or Google/Apple. Do **not** require signup to *browse* — require it only at the reveal moment. Anonymous swiping with a device-scoped session that upgrades to an account on first reveal is the right funnel, and Better Auth's anonymous plugin supports exactly this.
- **Shelter partner:** high-friction on purpose. Invitation-only into an organization, created by you after manual verification (NGO registration, bank account in the org's name, external reference). **Verification is a human process with a database field, not a feature.** Don't build a self-serve shelter signup flow at MVP — it's the single largest source of fraud risk in this product, and manual review of ~15 shelters is an afternoon.
- **Worth knowing for later:** **Дія.Підпис (Diia.Signature) is available to businesses today** — free, contract-based, used by Nova Poshta and AUTO.RiA — and is the natural upgrade path for strongly verifying a shelter representative's identity when manual review stops scaling. It requires certifying no ties to Russia or Belarus.

**Sources:** [Better Auth organization plugin](https://www.better-auth.com/docs/plugins/organization) · [Clerk pricing](https://clerk.com/pricing) · [WorkOS pricing](https://workos.com/pricing) · [Kinde pricing](https://www.kinde.com/pricing/) · [Diia integration](https://integration.diia.gov.ua/) · npm registry, 2026-08-05

---

## 5. Internationalization

**Recommendation: `next-intl` 4.13.x, plus native `Intl` for every date, number, currency, and plural.**

### Why not Paraglide, despite the bundle-size story

Paraglide's compile-time, tree-shakable approach is real (their measured 47 KB vs 205 KB for 5 locales × 200 messages), but **inlang's own Next.js documentation says:**

> *"The setup has been reported as fragile for advanced use-cases. **Use next-intl if you need a more stable setup.**"*

Corroborating: `@inlang/paraglide-next` is **deprecated on npm** with no replacement adapter; there is **no Turbopack plugin** (Paraglide ships unplugin-based bundler plugins, and Turbopack doesn't support unplugin), which means on Next 16 you'd have to run `next build --webpack` and `next dev --webpack`, giving up the default supported path; and their RSC docs contain a live workaround with two `@ts-expect-error`s because *"NextJS does not support AsyncLocalStorage."* Next.js isn't on Paraglide's supported-framework list at all.

### next-intl, with two disciplines

1. **Translate in Server Components and pass finished strings down.** The default `NextIntlClientProvider` ships *all* messages to the client. Where a Client Component genuinely needs the hook, wrap only that subtree and pass a slice: `<NextIntlClientProvider messages={pick(messages, 'AnimalFilters')}>`. next-intl 4.x is ESM-only with a strictly-typed `Locale` and ICU argument type inference — so adding Polish is a type-level change in one config file, not a component refactor. That is exactly the Open/Closed behaviour you want.
2. **Put zero dates, numbers, currency, or lists in your message JSON.** This eliminates ~40% of what would otherwise be translatable strings and makes them automatically correct when Polish lands.

### Ukrainian specifics — verified by execution, not recall

Ukrainian has **four cardinal plural categories plus `other`**:

```
1 → one     2,3,4 → few     0,5,11,25 → many     1.5, 0.5 → other   (decimals only)
21 → one    22 → few        101 → one
```

Do **not** omit `other` — it fires for fractional values ("1,5 кг корму"). ICU/`Intl.PluralRules` handles all of this correctly.

The month-declension issue you may have heard about (*«5 січня»* genitive vs *«січень»* nominative) is **fixed in modern ICU/V8** — `Intl.DateTimeFormat` correctly selects the formatting vs stand-alone variant based on whether a day is present. Verified:

```js
new Intl.DateTimeFormat('uk-UA',{day:'numeric',month:'long'}).format(d)  // "5 січня"   ✅
new Intl.DateTimeFormat('uk-UA',{month:'long'}).format(d)                // "січень"    ✅
```

Four remaining gotchas, all avoidable:

- **`formatToParts` leaks genitive** — cherry-picking parts gives you `"січня"` in a month-picker header. Always call `format()` with the full option set.
- **Never hand-roll a `MONTHS` array.** It will be wrong in one of the two contexts.
- **`date-fns` token confusion:** `MMMM` = formatting context (січня), `LLLL` = stand-alone (січень). Backwards is the most common Ukrainian date bug.
- **Small-ICU Node builds** (some Alpine/serverless images) silently degrade `uk-UA` to English. Add a boot assertion: `new Intl.DateTimeFormat('uk',{month:'long'}).format(new Date(2026,0,5)) === 'січень'`.

### The `lastUpdatedAt` requirement, specifically

Your honest-freshness requirement maps directly to `Intl.RelativeTimeFormat`, which produces correct Ukrainian plurals for free (`1 день тому`, `2 дні тому`, `5 днів тому`, `21 день тому`, `22 дні тому`), and `numeric: 'auto'` gives you *«учора»*. ⚠️ `Intl.DurationFormat` is **undefined in Node 22** — don't reach for it.

Design note: don't just render the string. **Model freshness as a domain value, not a display detail:**

```ts
type Freshness =
  | { kind: 'fresh';  updatedAt: Date }              // < 7 days
  | { kind: 'aging';  updatedAt: Date }              // 7–30 days
  | { kind: 'stale';  updatedAt: Date }              // > 30 days — de-rank in the feed
```

A discriminated union here means the feed ranking, the badge colour, and the "please confirm this animal is still available" nudge to the shelter all derive from one source of truth. That's the DRY win, and it's the difference between "we show a date" and "we're honest about data quality" as a product property.

### Translation management

**Crowdin** — Ukrainian-founded (Serhiy Dmytryshyn, 2009) — offers a **completely free Open Source program** (OSI license, public source, no associated commercial product, 3+ months active). Their free commercial tier is 60k hosted words / 1 private project. If the repo stays private, **Tolgee's free tier** (500 keys, 3 seats) is the better start.

**Sources:** [next-intl docs](https://next-intl.dev/docs/getting-started/app-router) · [next-intl 4.0](https://next-intl.dev/blog/next-intl-4-0) · [Paraglide Next.js docs](https://github.com/opral/paraglide-js/blob/main/docs/getting-started/next-js.md) · [@inlang/paraglide-next (deprecated)](https://www.npmjs.com/package/@inlang/paraglide-next) · [CLDR plural rules](https://www.unicode.org/cldr/charts/47/supplemental/language_plural_rules.html) · [Crowdin OSS program](https://crowdin.com/page/open-source-project-setup-request)

---

## 6. Hosting and infrastructure

**Recommendation: Vercel Pro ($20/mo) at MVP with images off-platform and a spend cap. Exit ramp to Cloudflare Workers via OpenNext, pre-validated but not taken.**

### Realistic monthly cost

| Platform | MVP (~5k MAU) | 300k MAU | Notes |
|---|---|---|---|
| **Vercel Pro** | $20 | **~$50–150** | 1 TB Fast Data Transfer included then $0.15/GB; 10M Edge Requests then $2/1M. Fluid/Active-CPU billing only charges while your code runs — a real saving for a DB-bound app |
| **Cloudflare Workers** (OpenNext) | $5 | **~$9–15** ⭐ | Free egress, free unlimited static assets. Extraordinary economics |
| Hetzner CAX31 + Coolify | €10.49 | €21–42 | 20 TB traffic included. You own backups, patching, failover |
| Railway | $5 | ~$55–80 | Egress $0.05/GB is the sting |
| Render | $13 | ~$140 | Only 25 GB bandwidth included on Pro, $0.15/GB over |

⚠️ **Vercel Hobby is contractually non-commercial personal use.** A public adoption platform surfacing donation links is at best a grey zone. Budget for Pro from launch — $20/mo is the correct answer, not a workaround.

### Why Vercel and not the cheaper options

The cost delta at MVP is roughly **$10–20/month**. Against a $25–50k grant that is noise. What it buys is: zero-config Next.js deployment on the exact platform Next.js is built for, preview deployments per branch, a WAF that gets mitigations for Next CVEs pushed *ahead* of patches (materially relevant given §1's security picture), and zero hours spent on backups and TLS renewal. **Your scarcest resource is your own attention, and it is worth far more than $20/mo.**

The counter-case is honest: at 300k MAU, Cloudflare Workers is 10× cheaper than Vercel, and Hetzner is cheaper still. But the difference is $50–150/mo — recoverable, not existential — and by then you'll know your actual traffic shape.

### The exit ramp, and why it's real

**OpenNext's Cloudflare adapter supports all Next.js 16 minor/patch versions**, including App Router, SSR, ISR, PPR, and Turbopack, running Next's **Node.js runtime** on Workers (not the Edge runtime, so you keep real Node APIs). Not supported: Node Middleware (the 15.2 feature).

Concretely, keep the exit open by: **not using Node middleware in `proxy.ts`**, **not depending on Vercel-specific APIs** (`@vercel/*` packages, `waitUntil` outside a shim), and **keeping images off Vercel** (already decided). Then the migration is a build-config change, not a rewrite. Validate it once early — deploy a branch to Workers in week 3 and confirm it builds — so the ramp is tested rather than theoretical.

### Non-negotiables on day one

1. **Configure Vercel Spend Management** with a hard cap and a webhook. This is the difference between a bad week and a dead project.
2. **Block LLM/AI crawlers** on dynamic routes via `robots.txt` and Cloudflare bot rules — but *allow* them on animal profile pages, which you want indexed.
3. **No wildcard `remotePatterns`** on `next/image`.

### Region and data-residency

Host in **Frankfurt (`eu-central-1`)** or Warsaw. Verified: Ukraine has **no data-localisation mandate for private-sector personal data**; the cloud-services law (2075-IX) governs *state bodies*, not you. Under Law 2297-VI Art. 29, transfers to EEA states are treated as going to adequate-protection jurisdictions.

⚠️ Ukraine's GDPR-aligned data protection bill **№8153 is not in force** — adopted in first reading Nov 2024, **returned to committee 19 Dec 2025**, still in second-reading preparation. The operative law is still the 2010 Law 2297-VI, which is *weaker* than GDPR. **Build to GDPR anyway:** it satisfies 2297-VI today, satisfies 8153 whenever it lands, and is mandatory the moment you serve Polish adopters (GDPR Art. 3(2) applies extraterritorially).

**Vendor screen — this is a hard constraint, not a preference.** CMU Resolution No. 1335 (Oct 2025) bans sanctioned software; currently mandatory for state/critical-infrastructure entities and advisory for private business, but **Draft Law No. 13505 proposes fines up to 2% of annual turnover**. Independently, **Diia integration requires certifying no ties to Russia or Belarus**, and **USF grant eligibility requires the same**. Avoid Yandex (metrics/maps/cloud), VK, Mail.ru, Kaspersky, 1C/BAS, and any SDK with obscured RU-origin ownership. **This will matter most when you pick an ad SDK in Phase 2** — vet ownership before integrating.

**Sources:** [Vercel pricing](https://vercel.com/pricing) · [Vercel Hobby terms](https://vercel.com/docs/plans/hobby) · [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) · [OpenNext Cloudflare](https://opennext.js.org/cloudflare) · [Hetzner June 2026 price adjustment](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/) · [Bill 8153 card](https://itd.rada.gov.ua/billinfo/Bills/Card/40707) · [BDO on the sanctioned-software ban](https://usubc.org/bdo-in-ukraine-legal-guidance-for-businesses-amid-the-ban-on-sanctioned-software/)

---

## 7. Repository organization

**Recommendation: pnpm 11 workspaces + catalogs. Add Turborepo the day CI exceeds ~3 minutes.**

```
repo/
├─ pnpm-workspace.yaml          # catalogs live here — one version of React, Zod, Next
├─ apps/
│  ├─ web/                      # adopter PWA (Next.js 16)
│  └─ partner/                  # shelter dashboard — see note below
├─ packages/
│  ├─ contracts/                # ⬅ the load-bearing package: Zod schemas + oRPC contract
│  ├─ domain/                   # pure TS: matching, verification FSM, freshness. No I/O.
│  ├─ db/                       # Drizzle schema + migrations + repositories
│  ├─ ui/                       # shared primitives (Button, Card, Field)
│  └─ i18n/                     # message catalogues + Intl formatters
└─ infra/                       # docker-compose for local PG+PostGIS, CI workflows
```

Inside `apps/web`, organize **by feature/domain**, not by technical type — matching your stated principle:

```
apps/web/src/features/
├─ animals/     { components/, hooks/, server/, types.ts }
├─ shelters/
├─ matching/
├─ donations/
└─ discovery/   # the swipe deck itself
```

### Four notes that matter more than the tool choice

1. **`packages/domain` is framework-free and I/O-free.** No Next, no Drizzle, no `fetch`. Pure functions: `scoreMatch(animal, prefs) → number`, `transition(shelter, event) → Shelter`, `freshnessOf(lastUpdatedAt, now) → Freshness`. This is where your SOLID discipline pays off concretely: it's trivially testable (§8), it's the *only* thing you'd ever need to port if you extracted a service (§11), and it forces the dependency direction outward.
2. **`packages/db` exposes repositories, not the Drizzle client.** `animalRepo.feedPage(cursor, filters)` rather than a query builder leaking into feature code. This is what makes the ORM replaceable and the queries testable — and it's the boundary that makes §11's "extract later" story real rather than aspirational.
3. **Ship the partner dashboard as a route group inside `apps/web` first** (`app/(partner)/…`), not a separate app. It shares auth, contracts, and UI; splitting it costs you a second deployment, a second auth session domain, and CORS, in exchange for nothing at 15 shelters. Split it into `apps/partner` when it needs a different release cadence or a different auth posture — the feature-folder structure means that's a directory move.
4. **pnpm catalogs are the feature to adopt immediately.** Define versions once in `pnpm-workspace.yaml`, reference as `"react": "catalog:"` everywhere. This kills the #1 monorepo papercut (adopter app and dashboard drifting to different React/Zod versions) with zero build tooling.

### Why not Turborepo yet, and why not Nx ever

**Turborepo (2.10.8) is healthy** — Vercel-maintained, 100% Rust since 1.11, monthly-ish releases, and **remote caching is free even on Vercel Hobby** (100 GB/mo upload, works from GitHub Actions via OIDC). But it caches *task outputs*, and with 2–3 packages consumed as raw TypeScript source there are no build steps to cache. Adopting it early buys nothing; retrofitting it later is ~30 lines of `turbo.json` and one afternoon. **The trigger is: "CI takes >3 minutes and most of it is rebuilding things that didn't change."**

**Nx: no.** Not because of the [s1ngularity incident](https://nx.dev/blog/s1ngularity-postmortem) (26 Aug 2025 — a `pull_request_target` misconfiguration in GitHub Actions, not an Nx design flaw; their remediation with npm Trusted Publisher + OIDC was better than most), but because a solo dev on a TS-only repo gets almost none of Nx's payoff — generators, cross-team module-boundary enforcement, distributed execution, polyglot support — for a substantially larger plugin and postinstall surface.

⚠️ **Supply chain is a real 2026 risk and pnpm 11 gives you the best single defense for free.** npm saw two worm-class incidents in 2025 (Shai-Hulud: 500+ packages, then 640 packages / 25k repos, a CISA alert; the Nx compromise seeded it). **pnpm 11's `minimumReleaseAge` now defaults to 1440 minutes** — newly published versions don't resolve for 24 hours, which would have blocked the entire 4-hour Nx compromise window. Don't turn it off. Also pin `packageManager` in `package.json` and use corepack.

**Sources:** [pnpm catalogs](https://pnpm.io/catalogs) · [pnpm 11.0 release](https://pnpm.io/blog/releases/11.0) · [Turborepo governance](https://turborepo.dev/governance) · [Vercel Remote Caching](https://vercel.com/docs/monorepos/remote-caching) · [Nx s1ngularity postmortem](https://nx.dev/blog/s1ngularity-postmortem) · [CISA npm alert](https://www.cisa.gov/news-events/alerts/2025/09/23/widespread-supply-chain-compromise-impacting-npm-ecosystem)

---

## 8. Testing and CI/CD

**Recommendation: Vitest 4 + RTL 16 + MSW 2 + 4–6 Playwright specs. Plain Docker PostGIS, not Testcontainers. GitHub Actions on a public repo.**

### The 80/20, mapped to your three critical paths

| Path | Test | Why this shape |
|---|---|---|
| **Matching** | Pure Vitest unit tests, table-driven, no DOM, no DB | Highest bug-density-per-line in the app, cheapest possible test. **If it needs a DB to test, that's a design smell in `packages/domain`, not a testing problem** |
| **Shelter verification FSM** | Pure Vitest, **exhaustive** transition table — assert every `(state, event)` pair including the ones that must be rejected | This is where "we forgot the case where a shelter is re-verified after suspension" lives. ~50 lines catches all of it. A discriminated-union reducer is enough; reach for XState only past ~6 states |
| **Freshness display** | Vitest with `vi.useFakeTimers()` + `vi.setSystemTime()`, asserting **Ukrainian** output at 1, 2, 5, 11, 21, 22 days | The one place i18n and logic intersect. `Intl.RelativeTimeFormat` gives correct forms free, but you must test you're calling it with the right unit and sign |

**Four to six Playwright specs, no more:**

1. Browse → filter by city/type → open an animal profile
2. Swipe → like → contact revealed (the money path)
3. Shelter logs in → creates a listing → `lastUpdatedAt` reflects it
4. **Locale switch uk ↔ en preserves route and state** — your i18n regression net, worth more than 50 component tests
5. (later) Donation link opens the correct external URL with correct attribution

**Don't:** chase coverage percentages, unit-test components that are just markup, or write E2E for anything assertable at the unit level. Skip Playwright component testing (now graduated out of experimental, but you don't need it) and Vitest browser mode.

**Testcontainers vs plain Docker: use plain Docker.** Testcontainers solves per-test-file isolation for teams running concurrently on shared infra. Solo, it adds 3–8s of container startup per suite and a Docker-in-Docker headache in CI to solve a problem you don't have. Use one `docker-compose.yml` with `postgis/postgis:17-3.5`, and per-test transactions that roll back. In GitHub Actions, a native `services:` Postgres container. Revisit Testcontainers if you ever build the registry-integration service.

### CI/CD

**Public repos get unlimited free GitHub Actions minutes.** Private: 2,000 min/mo on Free, then $0.006/min Linux. For a Ukrainian nonprofit-adjacent adoption platform, open-sourcing is likely mission-aligned anyway — and it simultaneously unlocks **free Crowdin OSS** and **free Blacksmith runners** (3,000 min/mo free for everyone, free-for-OSS beyond).

Minimal pipeline:

```
PR:    typecheck → lint → vitest → build → (Vercel preview deploy)
main:  ↑ + drizzle-kit migrate (gated job) → deploy → playwright smoke against preview
```

**Migrations:** `drizzle-kit generate` locally, commit the SQL, `drizzle-kit migrate` in a **separate CI job that gates deploy**. Never `drizzle-kit push` against production — it's a diff-and-apply with no migration history. ⚠️ **Drizzle has no built-in advisory lock** (Prisma's `migrate deploy` does), so wrap the step in a GitHub Actions `concurrency: { group: migrate-prod, cancel-in-progress: false }` or take a `pg_advisory_lock` yourself. And never run migrations from the app's boot sequence — that's N serverless instances racing on the same schema.

### Observability from day one

- **Sentry Developer** (free: 5k errors, 5M spans, 30-day retention) for errors + 1 uptime monitor.
- **PostHog free** (1M events/mo, 5k replays, 1M feature-flag requests) for product analytics, session replay, and — the underrated part for a solo dev — **feature flags**, which let you ship matching-algorithm v2 dark and enable it for 5% of traffic.
- **Instrument the domain events, not the clicks:** `animal_revealed`, `shelter_listing_updated`, `feed_exhausted`, `donation_link_clicked`, `stale_listing_shown`. These are the numbers a grant report needs and the numbers that tell you whether the product works.
- At 300k MAU: ~$136/mo PostHog (4.5M events) + $26 Sentry. Halve it by putting self-hosted **Umami** (MIT) in front for pageviews — which also keeps visitor data under your control, a nice posture for a Ukrainian platform.
- **Defer OpenTelemetry** until you have a second service to trace across. Axiom's permanently-free Personal tier (500 GB/mo ingest) is the one to pick up then.

**Sources:** [Vitest 4](https://voidzero.dev/posts/announcing-vitest-4) · [GitHub Actions billing](https://docs.github.com/en/billing/managing-billing-for-your-products/about-billing-for-github-actions) · [Blacksmith pricing](https://www.blacksmith.sh/pricing) · [drizzle-kit overview](https://orm.drizzle.team/docs/kit-overview) · [Sentry pricing](https://sentry.io/pricing/) · [PostHog pricing](https://posthog.com/pricing)

⚠ **Amendment, Phase F:** `@vercel/analytics` + `@vercel/speed-insights` were added ahead
of this schedule, by explicit owner instruction, not a re-derivation of this ADR. They
displace only the pageview/RUM slice above — Speed Insights covers real-device Core Web
Vitals this line never specified a source for at all; Analytics covers what the
self-hosted Umami line above would have. Sentry + PostHog (errors, session replay,
feature flags, the `animal_revealed`/`shelter_listing_updated`/… domain events above)
remain unbuilt and still belong to their original phase. `docs/build-plan.md`'s H5 row
still owns the privacy policy and consent handling that would normally accompany
analytics going live; Phase F's «Про проєкт» addition (`uk.about.analytics`) is a
stopgap disclosure, not a substitute for it — H5 must still land before real shelter
traffic depends on this being someone's only privacy notice.

---

## 9. Refining the data contract

Your draft is sound. Four adjustments, each of which prevents a rewrite:

**1. `Match` is misnamed for what the product does.** In your description a *like* instantly reveals contact — there is no mutual matching. Call it what it is:

```ts
type ContactReveal = {
  id: RevealId
  adopterId: AdopterId
  animalId: AnimalId
  revealedAt: Date
  shelterSnapshot: ShelterContactSnapshot  // ⬅ denormalized at reveal time
}
```

The **snapshot** matters: if a shelter changes its phone number, the adopter's history should still show what they were told. It also makes the reveal an immutable append-only event, which is what you want for analytics, for abuse investigation, and for the Phase 2 ad-reward ledger.

**2. Model verification as a state *machine*, not a status field.** You already said FSM — make the transition function live in `packages/domain` and take an actor + reason:

```ts
type ShelterVerification =
  | { status: 'pending';      submittedAt: Date }
  | { status: 'under_review'; reviewerId: UserId; startedAt: Date }
  | { status: 'verified';     verifiedAt: Date; verifiedBy: UserId; evidence: VerificationEvidence }
  | { status: 'rejected';     rejectedAt: Date; reason: RejectionReason }
  | { status: 'suspended';    suspendedAt: Date; reason: string; priorStatus: 'verified' }  // ⬅ add this
```

`suspended` is the state you will need and haven't modelled — a verified shelter that stops responding or gets a complaint. Adding it later means backfilling; adding it now is free.

**3. Make the freshness contract structural, not a timestamp.** Covered in §5.3 — `Freshness` as a discriminated union derived from `lastUpdatedAt`, so ranking, badge, and shelter-nudge all share one definition.

**4. Add `DocumentReadiness` to `Animal` now, as an empty-by-default union.** Phase 4 needs microchip / rabies / titration / vet-certificate status per animal. Adding the *field shape* now (all `{ kind: 'unknown' }`) costs nothing and means Phase 4 is a UI feature rather than a schema migration across 100k rows. It also lets Ukrainian shelters start capturing chip numbers opportunistically today.

**Naming discipline that pays off:** use branded ID types (`type AnimalId = string & { __brand: 'AnimalId' }`) from the start. It costs one line each and makes `revealContact(adopterId, animalId)` uncallable with the arguments swapped — a bug class that is otherwise invisible in a codebase where everything is a `string`.

---

## 10. Phases 2–4: what changes, and does the core survive?

**Short answer: yes, with one important correction to your Phase 4 premise and one to your Phase 3 timeline.**

### Phase 2 — rewarded-video ads

**Stack additions:** an ad SDK (client), a server-side reward verification endpoint, a `RewardGrant` ledger table.

**Architectural fit: clean.** Reward verification is a stateless server callback — validate the SDK's signature, write one idempotent row keyed on the SDK's transaction ID, credit the shelter's fund. It slots into `packages/domain` as a pure function plus one repository call. This is also, incidentally, the *cheapest possible thing to extract into a separate service* if you ever want to (see §11).

**⚠️ Two real constraints:**
- **PWA vs ad SDK.** Rewarded video SDKs are overwhelmingly built for native apps. Web rewarded-video inventory exists but fill rates and CPMs are materially worse than in-app, and eCPMs in Ukraine are low to begin with. **Model the revenue conservatively before you build for it** — this may be the phase that finally justifies a native app, and that's a business decision, not a technical one.
- **Vendor screen.** Per §6, check ad-network ownership against the Russia/Belarus constraint before integrating. This is the phase where that risk is live.

**Design decision to make now, for free:** the donate button already points at an external URL. Model *donation intent* as a first-class event (`donation_link_clicked` with animal + shelter + source) even though you can't confirm completion. When Phase 2 adds a reward-funded donation, it becomes another variant of the same union rather than a parallel system.

### Phase 3 — registry integration + recurring guardianship

**⚠️ The registry integration is not realistically available, and you should plan for the port without planning the feature.**

Verified facts as of August 2026:

- Ukraine's pet registry (**Єдиний державний реєстр домашніх тварин**, vet.pet.gov.ua) is an *experimental project* under CMU Resolution 1171 (Nov 2023), **relaunched by a new resolution in early July 2026** under the Ministry of Economy, Environment and Agriculture.
- **It holds roughly 6,000 animals** against ~17.7 million pets in Ukraine.
- Registration is **free, voluntary, and can only be performed by authorised vets** — not by owners, not by shelters directly (shelters go through an authorised clinic or a house call).
- **Diia integration is gated at 100,000 records** per the registry's own FAQ. At 6,000, that is not a 2027 milestone.
- **There is no published API spec, developer portal, sandbox, or onboarding process.** Resolution 1171 does authorise private operators to connect "integrated cabinets" by contract, and four vet-practice systems (Jet.Vet, Enote, Animal-ID.net, BuBiBo) are already connected — so the precedent exists, but the path is a partnership conversation with the ministry, not a signup form.
- What *is* open and useful today: animal identification + **rabies vaccination data is the public/searchable layer** (owner data is restricted). And **Дія.Підпис is available now, free, by contract** — a far more actionable near-term integration.

**What to do architecturally:** define a `VaccinationSource` port in `packages/domain`:

```ts
type VaccinationStatus =
  | { source: 'shelter_declared'; state: 'unknown' | 'in_progress' | 'confirmed'; declaredAt: Date }
  | { source: 'registry';         state: 'confirmed'; registryRef: string; verifiedAt: Date }
```

Your existing discriminated union already almost does this — just add `source` as part of the discriminant. Then the registry becomes an adapter implementing the port, and "confirmed by the state registry" becomes a trust badge that renders differently. **Cost today: one field. Cost if you skip it: a migration plus a UI rework across every surface that displays vaccination status.** This is the single highest-value hour in the whole roadmap.

**Recurring payments — three verified constraints:**

1. **Stripe does not support Ukraine** (verified against Stripe's own country list; third-party aggregators claiming otherwise are wrong). Your rails are **LiqPay `subscribe`**, **Fondy** (which has explicit recurring *and* marketplace/split-payout products), WayForPay, or Portmone. Card-on-file is the only rail that supports recurring — monobank/Privat24 local methods generally don't.
2. **⚠️ monobank's personal API forbids what you'd want to build.** It *does* expose jars (`sendId`, `balance`, `goal`), but monobank explicitly states that services centralising client data on their own servers must use the corporate API — and **the corporate API has no jar endpoints at all**. So a server-side "donation progress bar" aggregating shelters' jar balances is a TOS breach, not a clever feature. Don't build it.
3. **⚠️ Collecting on behalf of shelters is the structural problem, and nonprofit status doesn't solve it.** If donations land in your account before reaching shelters, you're doing public charitable fundraising (Law 5073-VI) and potentially money transmission requiring NBU authorisation as a payment institution. Неприбутковий status is a *tax* status, not a licence to move other people's money. Two clean architectures: **(a) PSP split/marketplace payouts** where Fondy or LiqPay is the money-mover and each shelter is a sub-merchant of record — technically and legally the cleanest; or **(b) register your own благодійна організація** and genuinely receive-and-regrant, with the reporting that entails. ⚠️ The precise threshold at which an intermediary needs an NBU licence could not be verified by research — **this needs a Ukrainian fintech lawyer, and it's worth a few hundred dollars of the grant well before you write payment code.**

**Architectural fit: clean, if you keep the MVP's discipline.** Because the MVP stores *zero* payment data and models payment details as a structured external link, adding a PSP is additive: a new `PaymentMethod` variant, a webhook route handler, a `Subscription` aggregate. Nothing existing changes. **Your instinct to keep payments out of the MVP entirely is the single best architectural decision in the brief** — it's what makes Phase 3 an addition rather than a retrofit.

### Phase 4 — cross-border to Poland/EU

**⚠️ Your regulatory premise is out of date, in two ways that change the data model.**

**First: Regulation 576/2013 no longer applies.** It was repealed by the Animal Health Law (EU) 2016/429 and ceased to apply on **21 April 2026**. From 22 April 2026 the governing instruments are:

| Instrument | Role |
|---|---|
| **Delegated Reg. (EU) 2026/131** | Animal-health requirements for non-commercial pet movement |
| **Implementing Reg. (EU) 2026/705** | Model passports, health certificates, declarations |
| **Implementing Reg. (EU) 2026/636** | Lists of third countries (Annex I / Annex II) |

**Ukraine is in neither Annex I nor Annex II of 2026/636** (verified against the regulation text). Consequence: **every dog and cat from Ukraine requires a rabies antibody titration test** — blood drawn ≥30 days after vaccination, at an EU-approved lab, result ≥0.5 IU/ml, and **≥90 days must elapse between sampling and entry**. Also new from 22.04.2026: EU pet passports are valid only for EU residents, so a Ukraine-resident owner needs an animal health certificate (valid 10 days) every trip.

**Second, and more important: adoption is a transfer of ownership, which makes it *commercial* movement.** Non-commercial movement is defined as movement that does **not** involve transfer of ownership or sale. An adoption is precisely that transfer. So Phase 4 falls under **Reg. (EU) 2016/429 + Delegated Reg. 2020/692 + Implementing Reg. 2021/404**, which adds, on top of everything above:

- Origin country must be **authorised and listed in Annex VIII Part 1 of Reg. 2021/404**
- Animals must come from a **registered/approved establishment** under competent-authority control
- **Clinical examination within 48 hours** before dispatch by an official vet
- **Pre-notification via TRACES (CHED)** with 1 working day's notice
- Presentation at a **Border Control Post**, not a traveller's point of entry
- Intra-EU commercial movement additionally requires dogs/cats to be ≥16 weeks

And the Commission's own [enforcement action on illegal pet movement](https://food.ec.europa.eu/food-safety/eu-agri-food-fraud-network/eu-coordinated-actions/illegal-movement-pets_en) **specifically flags shelters charging "symbolic fees" framed as transport or care costs** as the abuse pattern they're looking for. Routing adoptions across the border under non-commercial rules is exactly the thing under enforcement scrutiny.

⚠️ **Third, an open risk you must track:** a new **EU dog & cat welfare and traceability Regulation** reached provisional Council/Parliament agreement in November 2025, with final votes expected spring 2026 and application anticipated summer 2026. The original proposal (COM(2023) 769) included **obligations on online platforms advertising dogs and cats.** Research could not confirm the final adopted text, its application date, or whether the platform obligations survived trilogue. **This is your single biggest regulatory unknown, and unlike the others it could impose duties on your platform directly rather than on the animals.** Re-check it before writing a line of Phase 4 code.

**Architectural implication — and the good news:** this makes `DocumentReadiness` *more* important, not less, and it's still just a per-animal discriminated union. Model it as a checklist of independently-tracked items with sources and expiry, because the timing dependencies are the hard part (chip **before** vaccination; vaccination at ≥12 weeks; +21 days; titration ≥30 days after vaccination; +90 days before entry). That's a pure function over dates in `packages/domain` — `earliestEligibleEntryDate(animal) → Date | Blocked` — and it is genuinely useful to shelters *today*, in Ukraine, independent of Phase 4.

**Multi-currency:** store money as `{ amountMinor: number, currency: 'UAH' | 'PLN' | 'EUR' }` from day one. Never a bare number. `Intl.NumberFormat` handles display; you'll never need conversion at MVP because donations are external links. Multi-country is a `country` field on `AdopterProfile` and `Shelter` (which you already have) plus the region-scoped feed you're already building.

### Does the core survive Phases 2–4 without a rewrite?

**Yes**, and the reason is specific rather than optimistic: every phase adds either **a new variant to an existing discriminated union** (`VaccinationStatus.source`, `PaymentMethod`, `DocumentReadiness`) or **a new adapter behind an existing port** (registry client, PSP, ad SDK). None of them changes the shape of `Animal`, `Shelter`, or the feed query. That is the Open/Closed Principle doing actual work, and it holds *because* you modelled statuses as unions instead of booleans in the first place.

The things that would force a rewrite, and are therefore the things to protect: putting Drizzle queries directly in React components, letting the framework's types be your domain types, and storing money as a number.

---

## 11. The Go question — sober assessment

**Recommendation: TypeScript backend for the MVP. Do not defer Go to a phase; defer it to a *measured trigger* that will probably never fire. If it fires, extract one stateless service, not the backend.**

The framing that "Claude Code will be the main developer, so not knowing Go doesn't matter" is fair for *writing* code and misleading for *owning* it. But that turns out not to be the deciding factor, because the performance premise doesn't survive contact with the numbers.

### 11.1 Performance: the delta is real and irrelevant at your scale

**What the load actually is.** 300k MAU × 25% DAU = 75,000 DAU; ~100k sessions/day; ~50 swipes/session; feed pages of 20:

| | Naive (1 write/swipe) | Batched (10 swipes/write) |
|---|---|---|
| Daily API requests | 6.3M | 1.8M |
| **Average RPS** | ~73 | ~21 |
| **Peak RPS (4×)** | **~290** | **~85** |
| Design target (3× peak) | ~870 | ~250 |

Images go to the CDN and never touch your origin.

**What one box actually serves.** Measured, not modelled: a **t2.small (1 vCPU, 1 GB)** running plain Node against an RDS **t3.micro** Postgres, pool of 20, served **1,000 RPS at 4.3 ms average / 26 ms p99** with 100% success, and held 100% success up to 2,600 RPS.

**Your modelled peak is ~290 RPS.** You have 3–9× headroom on the smallest instance that exists, in the slower runtime, before you optimise anything. For scale context: sysbench point-queries peak at 2.33M/s on a large Postgres server; PgBouncer itself becomes the bottleneck around 30–50k QPS.

**The language delta, measured against a real database:** Go 5 ms, Python FastAPI 6 ms, Node/TS 8 ms on a multi-table JOIN endpoint. **Three milliseconds** — and an interpreted language landed between them, which tells you what's actually being measured. On a pure proxy with *no* database (the most Go-favourable shape possible), Go did 1.92× Node's throughput with p99 within 7 ms.

**Compare that to the things you control:**

| Fix | Impact |
|---|---|
| `OFFSET 1,000,000` → keyset cursor | **87 ms → <1 ms** |
| Fixing an N+1 on a 20-card feed page | **61 queries → 1** |
| Adding a Redis cache for the hot feed slice | 10–50× |
| **Rewriting the whole backend in Go** | **~3 ms** |

**Why the famous benchmarks don't transfer.** TechEmpower Round 23 (Feb 2025 — still the newest round; anyone citing "2026 results" is citing R23) shows Go Fiber at 609k RPS vs Express at 78k on Fortunes. That's a 7.8× gap between **the best-tuned Go entry and the worst-tuned Node entry** — and Fiber isn't even idiomatic Go (it's `fasthttp`, not `net/http`). The decisive tell: the author of `just-js`, a JavaScript runtime, documents scoring **40% higher than the best Go framework** on the same benchmark. The ranking measures implementation effort, not language. Within Node, framework choice (Hono or Fastify over Express) closes most of that gap on paper — and still doesn't matter at your scale.

**Every public Node→Go migration win is confounded with a rewrite.** The one writeup that names its mechanism (SolarGenix, p95 48 ms → 11 ms) attributes the gain to *"shifting hot reads to key lookups and cache layers"* — query redesign and caching, not Go. Reddit's much-cited win was migrating a legacy **Python** monolith, not a competent Node service. The one big-bang Node→Go rewrite with a timeline required **3 months of work behind a 2-month feature freeze**.

### 11.2 The type-safety cost is the concrete, unavoidable tax

**There is no tRPC for Go, and there cannot be.** Go has no structural typing and no way to project a function signature into TypeScript without codegen. Anything claiming otherwise is codegen with a nicer wrapper. So a Go backend means, permanently: a spec artifact (`.proto` or OpenAPI), a generator on each side, config for both, a CI codegen step, and a drift-detection check. That's ~200 lines of config and a day of setup — then a low-grade tax on every schema change forever.

**Do your discriminated unions survive?** This matters, because unions are the backbone of your data contract.

- **With Protobuf/ConnectRPC: genuinely yes.** `protobuf-es` emits `oneof` as a real TS discriminated union (`{ case: "post", value: Post } | { case: "comment", value: Comment }`) that narrows under `switch`. ConnectRPC is healthy in 2026 (Connect-Go v1.20, Connect-ES 2.1.2, 3.9M weekly downloads; Anthropic uses it in production for their SDKs) and the old gRPC-Web pain — Envoy proxies, dependency matrices — is genuinely resolved. The cost is ergonomic verbosity: reads need `if (x.case === "post")`, writes need `x.item = { case: "comment", value: c }`. Maintainers closed the complaint issue without changing the design. On the Go side you get `Get*()` accessors with **no compiler-checked exhaustiveness**.
- **With OpenAPI: only partially, and this is the sharp edge.** `oapi-codegen` renders `oneOf` as a struct wrapping `json.RawMessage` with `AsX`/`FromX` accessors — a tagged blob, no exhaustiveness, runtime unmarshal errors instead of compile errors. On the TS side, narrowing only works if the spec carries a proper `discriminator` with a literal-typed property.

**Nullability is where you'd actually lose evenings**, and every generator on both sides has a live bug or lossy default here in 2026:

- Go can't distinguish absent from null: `oapi-codegen` [#1039](https://github.com/oapi-codegen/oapi-codegen/issues/1039) was **closed without a general fix**; the workaround is an opt-in `nullable.Nullable[T]` generic.
- **`omitempty` silently drops `false`, `0`, and `""`.** For your API that means `isVaccinated: false`, `maxAge: 0`, and `distanceKm: 0` **vanish from the wire** — and a filter silently becomes "any." Go 1.24's `omitzero` fixes it where you remember to use it; `encoding/json/v2`, which fixes it properly, is **still behind `GOEXPERIMENT=jsonv2` as of Go 1.26.5 (July 2026)**.
- The TS side isn't clean either: `openapi-typescript` shipped a **regression** ([#2055](https://github.com/openapi-ts/openapi-typescript/issues/2055)) that turned `nullable: true` fields into non-nullable types — type-safe on paper, `undefined is not a function` at runtime. `hey-api` and Kubb have their own variants. Orval's default fetch client **does not throw on 4xx/5xx**, returning error bodies as data — which in your app means a forgotten status check treats a 500 as a successful adoption.

**What TypeScript gets you that Go structurally cannot:** one Zod schema (`AnimalListingSchema`) doing form validation, API request parsing, DB insert typing, and response typing. In Go you write that validation **twice** and keep them in sync by hand. For a solo dev, that's not a preference — it's the difference between one source of truth and two.

### 11.3 Solo maintenance and handoff

Ukrainian market data, verified:

| | Go | TypeScript |
|---|---|---|
| Share of Ukrainian devs using as primary ([DOU 2026](https://dou.ua/lenta/articles/language-rating-2026/), n=6,782) | **2%** | **21%** (up from 17% in 2025) |
| Open Djinni vacancies (queried 2026-08-05) | 36 (Golang) | 53 (Node.js) + 43 (JS/Front-End) |
| Senior median ([DOU Winter 2026](https://dou.ua/lenta/articles/salary-report-devs-winter-2026/), n=4,575) | **$4,200** | below market average |
| Lead median | **$6,510** | below Go |

So: **Go pays 25–50% more from a candidate pool one-tenth the size.** 36 open Go roles is not a dead market — Go developers exist and are hireable, just expensive and slower to find.

**But the asymmetric risk isn't cost, it's coverage.** With a TypeScript backend, one person — a React developer, of which Ukraine has thousands — covers the entire stack. With Go you need either two people or a full-stack Go+React hire, which is rarer than either alone. For a grant-funded project where the most likely "hire" is an unpaid co-founder or a volunteer contributor from the animal-welfare community, **a single-language stack is the difference between "someone can help" and "nobody can help."**

### 11.4 The review cost, honestly

Since the agent does the typing, this is the crux. Go defect classes a TypeScript-native reviewer must learn to see — none of which TS+Node permits:

1. **Ignored errors** — `_ = tx.Commit()` compiles fine. (`errcheck`/`golangci-lint` catches most, if configured.)
2. **Nil dereference on optional fields** — and generated OpenAPI structs are pointer-dense *by default*, so this is *more* likely in exactly the codegen setup you'd adopt.
3. **Zero-value vs absent** — `omitempty` dropping `false`/`0` (see above; live in a filtering marketplace).
4. **Goroutine leaks / missing `context` cancellation** on the registry and ad-SDK calls.
5. **Unbounded fan-out into a bounded DB pool** — goroutines are cheap, so it's easy to create queueing you didn't ask for. Node's single loop naturally throttles.
6. **Data races on shared maps** — only surfaced by `go test -race`.

Each is learnable and each has a linter. But: **the agent removes the cost of writing Go; it does not remove the cost of knowing what to look for.** And review is precisely where a solo dev is exposed, because there is no second reviewer.

Anthropic's own [2026 Agentic Coding Trends Report](https://resources.anthropic.com/hubfs/2026%20Agentic%20Coding%20Trends%20Report.pdf) found engineers use AI in ~60% of their work but can fully delegate only 0–20% of tasks — supervision cost doesn't go away, and it's denominated in the reviewer's fluency. (There's also weak evidence that agents resolve TS issues at roughly 22% vs Go at 13% on Multi-SWE-bench — but that paper explicitly warns the gap is confounded with per-language instance difficulty, so treat it as a mild signal at most, not an argument.)

### 11.5 Where Go is genuinely, non-obviously better

Two arguments that survive scrutiny, and neither is speed:

1. **Operational surface.** One static binary + a systemd unit. No runtime install, no `node_modules`, no native-module rebuild after an OS upgrade, ~15 MB `FROM scratch` containers. For a solo operator debugging at 3am, that's meaningfully less to go wrong.
2. **Supply chain — the strongest argument, and rarely the one people make.** npm had two worm-class incidents in 2025: Shai-Hulud compromised 500+ packages (CISA alert), then Shai-Hulud 2.0 hit 640 packages and exposed 25,000+ repos, weaponising locally-installed AI CLIs to hunt for secrets. Go's module ecosystem has a far smaller transitive footprint (tens of dependencies, not thousands), a checksum database, and **no install-time script execution**.

**But mitigate #2 in TypeScript instead:** pnpm 11's `minimumReleaseAge: 1440` default (24-hour quarantine on new versions) would have blocked the entire 4-hour Nx compromise window. Combined with a lockfile, Dependabot, and a lean dependency budget — which is already your stated principle — you get most of the benefit without a second language.

Go's memory advantage (~25 MB RSS vs ~80 MB) and cold-start advantage (39.7 ms vs 132.7 ms on Lambda) are real and **worth €0/month at your scale** — both fit ~50× over in a €5.49 Hetzner box. They convert to money above ~50 instances or on per-GB-second serverless.

### 11.6 The hybrid: realistic, but not for the feed

"Start in TS, extract the hot path to Go later" is a real strategy — Fowler's [MonolithFirst](https://martinfowler.com/bliki/MonolithFirst.html) observes that nearly every successful microservices story started as a monolith, and nearly every microservices-first system ran into trouble. But it works for a narrower class of thing than people assume, and **the swipe feed is not in that class.**

Extraction is cheap when the extracted thing **owns its data or is stateless**, has a stable versioned contract, and has idempotent writes. It's expensive when the hot path is **a read that joins several aggregates** — because you must either replicate that data or call back into the monolith, and the second option means the extraction bought you nothing.

Your feed joins animals + shelters + photos + the user's seen-set + geo filter. That's the expensive kind. **And here's the thing: once you've built the read model that would make extraction possible — a precomputed candidate list in Redis with keyset cursors — the language in front of it is irrelevant again**, because Node serves cached JSON from Redis at whatever rate the network allows.

The **cheap** extractions in your architecture, if you ever want them, are the stateless ones: image processing, match scoring, registry sync (a scheduled job with its own tables), and ad-reward verification. Each is an afternoon, in Go or Rust or a Lambda, from a TypeScript monolith. **So the "extract later" option is fully preserved for exactly the parts where it's actually cheap.**

Shopify's evidence is the useful one here: they evaluated microservices, **rejected** them, and got their value from **domain boundaries inside a single deployable** — enforced with tooling (Wedge). The boundaries deliver the value, and boundaries are free in either language. §7's `packages/domain` + repository pattern *is* that discipline.

**Preconditions to bake in now, at near-zero cost:** put the feed query behind one module boundary; never let the partner dashboard join across domain tables; make every write idempotent with a client-supplied key; version the API from v1; keep an append-only events table.

### 11.7 Verdict

**Skip Go. Not "defer to Phase 3" — skip it, with one named trigger.**

The trigger, stated precisely so you can test it rather than argue about it:

> **If profiling shows the feed endpoint is CPU-bound in the Node process — not waiting on Postgres, not waiting on Redis, but burning CPU — extract that scoring step into a separate service.**

The realistic cause would be real-time ML ranking scoring thousands of candidates per request in-process. Nothing in your roadmap implies that. And even then, the first three fixes are cache, keyset pagination, and a read replica — and the service you'd extract is a stateless scorer, which is the afternoon-sized extraction.

Everything else points the same way. The performance premise is worth 3 ms against fixes worth 87 ms. The type-safety cost is permanent and lands hardest on discriminated unions and nullability — the exact two things your data contract is built from. The hiring math halves your candidate pool and raises your rate. And the review burden falls entirely on you, in a language whose specific failure modes are the ones TypeScript makes impossible.

**Use the effort you'd have spent learning Go's operational failure modes on keyset pagination, a Redis cache layer, and the domain-boundary discipline in §7. Those buy you 10–100× more headroom, and they're the same work in either language.**

**Sources:** [TechEmpower R23](https://www.techempower.com/blog/2025/03/17/framework-benchmarks-round-23/) · [just-js on TechEmpower](https://just.billywhizz.io/blog/on-javascript-performance-01/) · [Node vs Go, same feature (Mar 2026)](https://blog.gaborkoos.com/posts/2026-03-19-Developing-and-Benchmarking-the-Same-Feature-in-Node-and-Go/) · [Node on single-core EC2](https://dev.to/ocodista/under-pressure-benchmarking-nodejs-on-a-single-core-ec2-5ghe) · [Keyset pagination](https://blog.sequinstream.com/keyset-cursors-not-offsets-for-postgres-pagination/) · [Node→Go on ECS](https://dev.to/voskan89/breaking-the-monolith-how-we-split-a-nodejs-backend-into-go-microservices-on-aws-ecs-without-1okg) · [ConnectRPC in 2026](https://kmcd.dev/posts/connectrpc-where-is-it-now/) · [protobuf-es oneof #337](https://github.com/bufbuild/protobuf-es/issues/337) · [oapi-codegen #1039](https://github.com/oapi-codegen/oapi-codegen/issues/1039) · [encoding/json/v2](https://pkg.go.dev/encoding/json/v2) · [openapi-typescript #2055](https://github.com/openapi-ts/openapi-typescript/issues/2055) · [DOU language rating 2026](https://dou.ua/lenta/articles/language-rating-2026/) · [DOU salaries winter 2026](https://dou.ua/lenta/articles/salary-report-devs-winter-2026/) · [Fowler: MonolithFirst](https://martinfowler.com/bliki/MonolithFirst.html) · [Shopify modular monolith](https://www.infoq.com/news/2019/07/shopify-modular-monolith) · [Shai-Hulud 2.0](https://www.wiz.io/blog/shai-hulud-2-0-ongoing-supply-chain-attack)

---

## 12. Buy, don't build — where a solo dev saves weeks

| Don't build | Use | Weeks saved |
|---|---|---|
| Auth, sessions, OAuth, orgs, invitations, roles | **Better Auth + organization plugin** | 3–4 |
| Image upload widget, cropping, progress, retry | **`react-dropzone` + `sharp`** in a route handler; or UploadThing if you'd rather not touch it at all | 1–2 |
| Image CDN / transformation pipeline | **R2 + pre-generated variants** (or Bunny Optimizer at $9.50 flat) | 1–2 |
| Admin CRUD for the shelter dashboard | Next.js Server Actions + a table primitive. Do **not** adopt an admin framework — it will fight your domain model | 1 |
| Translation workflow, translator UI, review | **Crowdin OSS** (free) | 1 |
| Error tracking, session replay, feature flags | **Sentry + PostHog** free tiers | 2 |
| Email (verification, shelter invitations) | **Resend** or **Postmark**. Never self-host SMTP | 1 |
| Form state + validation | **react-hook-form + Zod resolver**, sharing the schemas from `packages/contracts` | 1 |
| Date/number/plural formatting | **Native `Intl`** — no `moment`, no `numeral`, and skip `date-fns` unless you need arithmetic | ~0.5, plus correctness |
| Rate limiting, abuse protection | **Cloudflare** rules + Better Auth's built-in rate limiter | 1 |
| Content moderation for animal photos | Defer entirely at MVP — 15 verified shelters is human-reviewable | 2+ |
| **CI/CD platform** | GitHub Actions on a public repo | 1 |

**Total: roughly 15–18 weeks of work you don't do.** That is the difference between an MVP that ships this year and one that doesn't.

### Build custom — the four things that are actually yours

1. **The swipe deck interaction** (§1). ~150 lines. It's the brand, it's small, and every library here is either frozen or heavier than the code it replaces.
2. **`packages/domain`** — matching, verification FSM, freshness, document-readiness date math. This is your product; there is no library for it, and it's the only code you'd ever port.
3. **The feed query and its cursor.** No ORM abstraction will get keyset pagination + seen-set exclusion + geo filter right for you.
4. **The freshness/honesty UX.** Nobody sells this. It's also the most defensible thing about the product — "we tell you when we don't know" is a trust proposition, and trust is the actual bottleneck in shelter adoption.

---

## 13. Open risks and things to verify yourself

Ranked by how much they'd cost if wrong:

| # | Risk | Action |
|---|---|---|
| 1 | ⚠️ **The new EU dog & cat welfare + traceability Regulation** may impose obligations on **online platforms advertising dogs and cats**. Provisional agreement Nov 2025; final text, application date, and whether platform duties survived trilogue are unconfirmed | Re-check before any Phase 4 work. This is the only open item that could impose duties on *you* rather than on the animals |
| 2 | ⚠️ **NBU licensing threshold** for a donation intermediary. Nonprofit status is not a money-transmission licence | Ukrainian fintech lawyer, before writing Phase 3 payment code. Worth a few hundred dollars of the grant |
| 3 | ⚠️ **oRPC 2.0** is in beta now | Keep all procedure definitions in `packages/contracts` so migration is one package. Fall back to tRPC v11 if the beta churn bothers you |
| 4 | ⚠️ **Next.js monthly CVE cadence** — a CVSS 10.0 RCE in Dec 2025, 9 CVEs in July 2026 | Pin an LTS line, Dependabot on, standing calendar item. Managed hosting buys you WAF mitigations ahead of patches |
| 5 | ⚠️ **USF eligible-cost schedule** — whether cloud infrastructure and contractors are fundable line items is not published. The USF budget form is structured around salaries (person-months) and services | Ask USF directly before budgeting infra. Note also: their sector list is tech-vertical-based, so a pet-adoption social platform needs positioning (AI matching → the Sandbox track, or general grant support) |
| 6 | ⚠️ **Linking to a shelter's monobank jar / LiqPay page** — no TOS clause prohibiting it was found, but none permitting it either | Get written per-shelter consent to display their link; show the destination domain; never proxy or reframe the payment page |
| 7 | ⚠️ **Xata EU region availability** (if you pick it over Neon) | Verify before committing |
| 8 | ⚠️ **Poland's legacy wartime "tymczasowa procedura"** page still exists on wetgiw.gov.pl with a 2023 attachment and no stated validity | Email GIW if it becomes relevant. Poland abolished the simplified Ukrainian-pet procedure in March 2023; full EU rules apply |

**Funding note:** USF is alive and disbursing — 764 teams, $22.7M+ cumulative, $25k pre-seed / $50k seed, eligibility requires <$500k prior investment, <$500k revenue, and **no operations in Russia/Belarus or occupied territories**. Seeds of Bravery has **closed** (318 startups, €12M, final cohort ~March 2026); its named successor AGILE is defence-tech, not social impact. Realistic alternatives: **EU4Business Ukraine**, **EU4CSOs** (€17M call — the right vehicle if you partner with a registered NGO or shelter coalition rather than applying as a for-profit), and animal-welfare funders (FOUR PAWS, IFAW, ASPCA, Humane World) — though those fund *shelters*, so the play is a shelter partner as grantee with your platform as the delivery component.

---

## 14. First four weeks

| Week | Deliverable |
|---|---|
| **1** | `packages/contracts` and `packages/domain` first, in that order. Zod schemas for `Shelter`, `Animal`, `AdopterProfile`, `ContactReveal`, plus the verification FSM and `Freshness` as pure functions with exhaustive tests. **No UI, no DB.** Contract-first, literally |
| **2** | Drizzle schema + migrations + repositories against local Docker PostGIS. Neon project in Frankfurt. Better Auth with the organization plugin. Seed data from one real shelter |
| **3** | The swipe deck as a standalone route with mocked data. Get the gesture right before anything depends on it. Deploy a branch to Cloudflare Workers via OpenNext once, to prove the exit ramp works |
| **4** | Wire the feed to the real API with keyset pagination. next-intl with uk + en. Sentry + PostHog. Ship to one shelter and watch a real person swipe |

Then: partner dashboard, image upload, donation links, and the second through fifteenth shelters.

---

## Consolidated sources

**Framework & client:** [Next.js 16](https://nextjs.org/blog/next-16) · [Next.js 16.3](https://nextjs.org/blog/next-16-3) · [Next.js July 2026 security release](https://nextjs.org/blog/july-2026-security-release) · [Next.js security release program](https://nextjs.org/blog/next-security-release-program) · [endoflife.date/nextjs](https://endoflife.date/nextjs) · [React Compiler 1.0](https://react.dev/blog/2025/10/07/react-compiler-1) · [Unit 42: React2Shell](https://unit42.paloaltonetworks.com/cve-2025-55182-react-and-cve-2025-66478-next/) · [Microsoft on CVE-2025-55182](https://www.microsoft.com/en-us/security/blog/2025/12/15/defending-against-the-cve-2025-55182-react2shell-vulnerability-in-react-server-components/) · [Motion bundle size](https://motion.dev/docs/react-reduce-bundle-size)

**PWA / mobile:** [WebKit tracking prevention](https://webkit.org/tracking-prevention/) · [WebKit storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/) · [Declarative Web Push](https://webkit.org/blog/16535/meet-declarative-web-push/) · [Safari 26.4 features](https://webkit.org/blog/17862/webkit-features-for-safari-26-4/) · [Expo SDK 55](https://expo.dev/changelog/sdk-55) · [Expo SDK 57](https://expo.dev/changelog/sdk-57) · [Expo Server Components](https://docs.expo.dev/guides/server-components/) · [Expo static rendering](https://docs.expo.dev/router/reference/static-rendering/) · [Expo pricing](https://expo.dev/pricing) · [Google Play closed testing](https://support.google.com/googleplay/android-developer/answer/14151465) · [StatCounter Ukraine mobile OS](https://gs.statcounter.com/os-market-share/mobile/ukraine)

**API layer:** [oRPC](https://orpc.dev/docs/getting-started) · [tRPC RSC docs](https://trpc.io/docs/client/react/server-components) · [Hono RPC](https://hono.dev/docs/guides/rpc) · [ts-rest #797](https://github.com/ts-rest/ts-rest/issues/797)

**Data:** [Neon pricing](https://neon.com/pricing) · [Neon extensions](https://neon.com/docs/extensions/pg-extensions) · [Databricks acquires Neon](https://www.databricks.com/blog/databricks-neon) · [Supabase pricing](https://supabase.com/pricing) · [Xata pricing](https://xata.io/pricing) · [Prisma 7](https://www.prisma.io/blog/announcing-prisma-orm-7-0-0) · [Prisma geometry #25768](https://github.com/prisma/prisma/issues/25768) · [Drizzle PostGIS](https://orm.drizzle.team/docs/guides/postgis-geometry-point) · [drizzle-kit](https://orm.drizzle.team/docs/kit-overview) · [Why you probably don't need PostGIS](https://blog.rebased.pl/2020/04/07/why-you-probably-dont-need-postgis.html) · [Keyset vs offset](https://blog.sequinstream.com/keyset-cursors-not-offsets-for-postgres-pagination/) · [PostgreSQL earthdistance](https://www.postgresql.org/docs/current/earthdistance.html)

**Storage & hosting:** [R2 pricing](https://developers.cloudflare.com/r2/pricing/) · [Cloudflare Images pricing](https://developers.cloudflare.com/images/pricing/) · [Bunny Optimizer](https://bunny.net/optimizer/) · [Supabase image transformations](https://supabase.com/docs/guides/storage/serving/image-transformations) · [Vercel image pricing](https://vercel.com/docs/image-optimization/limits-and-pricing) · [Metacast bot post-mortem](https://metacast.app/blog/engineering/postmortem-llm-bots-image-optimization) · [Vercel pricing](https://vercel.com/pricing) · [Vercel Hobby terms](https://vercel.com/docs/plans/hobby) · [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) · [OpenNext Cloudflare](https://opennext.js.org/cloudflare) · [Hetzner price adjustment (Jun 2026)](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/)

**Auth:** [Better Auth organization plugin](https://www.better-auth.com/docs/plugins/organization) · [Clerk pricing](https://clerk.com/pricing) · [WorkOS pricing](https://workos.com/pricing) · [Kinde pricing](https://www.kinde.com/pricing/)

**i18n & tooling:** [next-intl](https://next-intl.dev/docs/getting-started/app-router) · [next-intl 4.0](https://next-intl.dev/blog/next-intl-4-0) · [Paraglide Next.js docs](https://github.com/opral/paraglide-js/blob/main/docs/getting-started/next-js.md) · [CLDR plural rules](https://www.unicode.org/cldr/charts/47/supplemental/language_plural_rules.html) · [Crowdin OSS program](https://crowdin.com/page/open-source-project-setup-request) · [Tolgee pricing](https://tolgee.io/pricing) · [pnpm catalogs](https://pnpm.io/catalogs) · [pnpm 11.0](https://pnpm.io/blog/releases/11.0) · [Turborepo governance](https://turborepo.dev/governance) · [Vercel Remote Caching](https://vercel.com/docs/monorepos/remote-caching) · [Nx s1ngularity postmortem](https://nx.dev/blog/s1ngularity-postmortem) · [CISA npm supply-chain alert](https://www.cisa.gov/news-events/alerts/2025/09/23/widespread-supply-chain-compromise-impacting-npm-ecosystem) · [Shai-Hulud 2.0](https://www.wiz.io/blog/shai-hulud-2-0-ongoing-supply-chain-attack) · [Vitest 4](https://voidzero.dev/posts/announcing-vitest-4) · [GitHub Actions billing](https://docs.github.com/en/billing/managing-billing-for-your-products/about-billing-for-github-actions) · [Blacksmith](https://www.blacksmith.sh/pricing) · [Sentry pricing](https://sentry.io/pricing/) · [PostHog pricing](https://posthog.com/pricing) · [Umami](https://umami.is/pricing)

**Go assessment:** [TechEmpower R23](https://www.techempower.com/blog/2025/03/17/framework-benchmarks-round-23/) · [just-js](https://just.billywhizz.io/blog/on-javascript-performance-01/) · [Node vs Go same feature](https://blog.gaborkoos.com/posts/2026-03-19-Developing-and-Benchmarking-the-Same-Feature-in-Node-and-Go/) · [Node on single-core EC2](https://dev.to/ocodista/under-pressure-benchmarking-nodejs-on-a-single-core-ec2-5ghe) · [PostgreSQL scalability](https://vonng.com/en/pg/pg-scalability/) · [Node→Go on ECS](https://dev.to/voskan89/breaking-the-monolith-how-we-split-a-nodejs-backend-into-go-microservices-on-aws-ecs-without-1okg) · [Reddit → Go](https://infoq.com/news/2025/11/reddit-comments-go-migration/) · [ConnectRPC 2026](https://kmcd.dev/posts/connectrpc-where-is-it-now/) · [protobuf-es #337](https://github.com/bufbuild/protobuf-es/issues/337) · [oapi-codegen #1039](https://github.com/oapi-codegen/oapi-codegen/issues/1039) · [encoding/json/v2](https://pkg.go.dev/encoding/json/v2) · [openapi-typescript #2055](https://github.com/openapi-ts/openapi-typescript/issues/2055) · [OpenAPI codegen comparison](https://dev.to/nyaomaru/which-openapi-codegen-should-you-choose-openapi-typescript-vs-hey-api-vs-orval-vs-kubb-100p) · [DOU language rating 2026](https://dou.ua/lenta/articles/language-rating-2026/) · [DOU salaries winter 2026](https://dou.ua/lenta/articles/salary-report-devs-winter-2026/) · [Fowler MonolithFirst](https://martinfowler.com/bliki/MonolithFirst.html) · [Fowler: extract a data-rich service](https://www.martinfowler.com/articles/extract-data-rich-service.html) · [Shopify modular monolith](https://www.infoq.com/news/2019/07/shopify-modular-monolith) · [Segment: Goodbye Microservices](https://www.twilio.com/en-us/blog/developers/best-practices/goodbye-microservices) · [Anthropic Agentic Coding Trends 2026](https://resources.anthropic.com/hubfs/2026%20Agentic%20Coding%20Trends%20Report.pdf)

**Ukraine / EU regulatory:** [vet.pet.gov.ua](https://vet.pet.gov.ua/) · [vet.pet.gov.ua FAQ](https://vet.pet.gov.ua/pytannia-ta-vidpovidi/) · [CMU Resolution 1171](https://www.kmu.gov.ua/npas/pro-realizatsiiu-eksperymentalnoho-proektu-z-provedennia-identyfikatsii-taabo-reiestratsii-domashnikh-tvaryn-1171-031123) · [Ministry of Economy, July 2026](https://me.gov.ua/News/Detail/983bc49b-ac6d-45b9-98c6-845702db4a7f) · [Interfax, 02.07.2026](https://interfax.com.ua/news/general/1181747.html) · [BRDO on the registry](https://brdo.com.ua/news/v-ukrayini-zapustyly-yedynyj-derzhavnyj-reyestr-domashnih-tvaryn/) · [Diia integration](https://integration.diia.gov.ua/) · [Diia.Signature](https://integration.diia.gov.ua/signature.html) · [LiqPay docs](https://www.liqpay.ua/doc) · [monobank personal API](https://api.monobank.ua/docs/index.html) · [monobank corporate API](https://api.monobank.ua/docs/corporate.html) · [dobro.ua](https://dobro.ua/about_us/) · [Fondy recurring](https://fondy.eu/en-pl/recurring-payments/) · [Stripe global coverage](https://stripe.com/global) · [Reg. (EU) 2026/131](https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=OJ%3AL_202600131) · [Reg. (EU) 2026/705](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=OJ%3AL_202600705) · [Reg. (EU) 2026/636 (country lists)](https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX:32026R0636) · [EC: commercial entry of dogs/cats](https://food.ec.europa.eu/animals/live-animal-movements/dogs-cats-and-ferrets/entry-union_en) · [EC: illegal movement of pets](https://food.ec.europa.eu/food-safety/eu-agri-food-fraud-network/eu-coordinated-actions/illegal-movement-pets_en) · [EP Legislative Train: dog & cat welfare](https://www.europarl.europa.eu/legislative-train/theme-agriculture-and-rural-development-agri/file-welfare-of-dogs-and-cats-and-their-traceability) · [GIW Poland, third countries](https://www.wetgiw.gov.pl/english/travelling-with-pets-from-third-countries/) · [Poland abolished simplified rules](https://visitukraine.today/blog/1585/poland-abolished-simplified-rules-for-importing-pets-from-ukraine-details) · [USF grant support](https://usf.com.ua/programs/grant-support) · [Seeds of Bravery](https://seedsofbravery.eu/) · [EU4Business Ukraine](https://eu4business.org.ua/en/) · [Bill 8153 card](https://itd.rada.gov.ua/billinfo/Bills/Card/40707) · [BDO: sanctioned software ban](https://usubc.org/bdo-in-ukraine-legal-guidance-for-businesses-amid-the-ban-on-sanctioned-software/)
