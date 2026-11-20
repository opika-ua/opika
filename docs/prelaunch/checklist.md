# PRELAUNCH checklist (Phase 0, documents only, 2026-11-04)

Read at repo HEAD `7b476e1d4491ccf84cb784057c123ee5c6a20e1c` (origin/main). Replaces the version written on the
stale checkout `03a2b70`. Nothing here has been run. Production writes, migrations, DNS, Vercel env, resets and
every sign-in are the owner's. File:line citations are to the repo at that HEAD. Where docs and code disagree,
or nothing documents a step, it says NOT DOCUMENTED / UNVERIFIED and the item is repeated under "Open
questions" at the end. Companion files in the same folder: `reset-runbook.md`,
`rehearsal-matrix.md`, `child-sitting.md`.

## Full reset or demo removal: which one for launch

**Full reset (`db:full-reset`).** The docs decide this, not us:

- `docs/launch-sequence.md:3-13`: owner instruction 2026-10-24, "a full reset, not a demo-only wipe", run twice
  (once before the rehearsal, once after it), "no `demo:remove --shelter` step".
- `docs/launch-gate.md:32`, `:44` and `:75`: the rows "Remove every test shelter", "D-5" and "Wipe-and-flip
  script" are all marked "DONE, different scope", superseded by the two-cycle full reset.
- `packages/db/src/full-reset.ts:26-37`: `demo:remove` "stays in the repo for its own narrower, repeatable
  use"; removing the rehearsal shelter "is this script's own second run".

Why: a full `TRUNCATE` leaves no demo or rehearsal row anywhere, so no test contact can ever sit next to real data
or be indexed ("closed by construction, not by timing", `launch-sequence.md:424-427`). `demo:remove` refuses
unless a real shelter already exists (`packages/db/src/demo-remove.ts`, `docs/onboarding-a-shelter.md:340-347`)
and leaves operator, history and other rows behind. `demo:remove --shelter <id>` is kept only for removing ONE
mistakenly onboarded REAL shelter (`launch-sequence.md:298-303`).

Stale docs that still describe the old demo-removal order (do not follow them): `docs/build-plan.md:1097` ("Launch
order") and `:1114` ("Remove every test shelter"), `docs/onboarding-a-shelter.md:324-445` ("Removing the demo
corpus", "Retiring the rehearsal shelter") and `:446-492` (the old dress-rehearsal script). Recommendation (mine,
not a documented decision): treat `docs/launch-sequence.md` as the only runbook and add a "superseded" note to
those sections in a later docs PR.

**DANGER (decision for the owner):** `db:full-reset` has no "a real shelter exists" guard by design
(`full-reset.ts:41-43`). Once the first real shelter is onboarded (step 20) running it again destroys real data.
Rule for the owner's own notes: reset 2 is the LAST run, ever, on production.

**DANGER 2 (new):** the reset is one `TRUNCATE` with no `CASCADE` (`full-reset.ts:150-162`) and no longer lists
`swipes`. If migration 0022 (drop `swipes`) is not on production, the statement fails on a foreign key and changes
nothing. Nothing in the docs records that 0022 has been applied to production. Verify first (row 1).

## The checklist

Legend. Who: O = owner (Oleksii), C = coordinator/advisor (read-only help, drafts commands, drives forms in the
owner's signed-in browser, never signs in). Reversible: R = reversible, I = irreversible, P = partly.

| # | Step | Who | R/I | Source | Notes |
|---|---|---|---|---|---|
| **A. Preconditions (before any reset)** | | | | | |
| 1 | `main` CI green; production deploy is the head you expect; ALL migrations applied, including 0022. Read-only: `db:check-hashes` with the production target typed. | O (C drafts) | R | `CLAUDE.md` rule 14; `docs/onboarding-a-shelter.md:296-308`; `packages/db/drizzle/0022_drop_swipes.sql`; `packages/db/src/check-migration-hashes.ts:98-114` | `db:check-hashes` prints `Target: Neon endpoint ep-...` first; stop if the endpoint is not production. Expect 23 `match` lines (`0000`..`0022`). A `0022` line saying `not run` means reset 1 would fail (see DANGER 2); apply 0022 first, then take the restore branch. |
| 2 | PG-F3 (migrate bypass) is CLOSED: merged as #352 (`git log`: `c18af6c PG-F3: db:migrate applies migrations in-process on the one checked URL (Tier 1) (#352)`), sitting done (owner). | n/a | R | `git log` at HEAD | Docs are stale and still say open: `docs/launch-gate.md:28`, `docs/build-plan.md:1055`. Fix in a later docs PR. |
| 3 | Neon stays on the FREE plan through the whole rehearsal. Restore branches (`pre-reset-N`) and the child branch are full copies, they do not depend on the 6 h history window. Upgrade to Launch happens at step 19b, BEFORE step 20. | O (Neon console) | n/a | `docs/launch-gate.md:37`; `docs/dev-notes.md:191-193`; `docs/stack-decision.md:18` | Free: 100 CU-hours per month per project, compute suspends when exhausted, 6 h history retention, default 0.25 CU. Watch the CU-hour meter during the rehearsal week; if the meter runs out the site stops until the next month or the upgrade. Whether auto-suspend is on today: NOT DOCUMENTED (`stack-decision.md:18` says "auto-suspends after 5 min" for Free). |
| 4 | Vercel env audit (Production). Names only, never values. Absent: `OPIKA_TEST_FAIL_GALLERY`, `KABINET_WRITE_ALLOWLIST` (delete if present). Present: `CRON_SECRET`, `R2_CLEANUP_ACCESS_KEY_ID`, `R2_CLEANUP_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`, `PRELAUNCH_GATE_SECRET`, `LOCATION_HMAC_SECRET`, Upstash (`KV_REST_API_URL`+`KV_REST_API_TOKEN` or `UPSTASH_REDIS_REST_URL`+`UPSTASH_REDIS_REST_TOKEN`), `RESEND_API_KEY`, `NEXT_PUBLIC_R2_PUBLIC_BASE_URL`. `RATE_LIMIT_*` unset or sane. | O | R | `docs/launch-gate.md:35`; `apps/web/src/kabinet/r2-cleanup-env.ts:15-20`; `apps/web/src/api/env.ts:150-160, 243-256, 261-281`; `launch-sequence.md:20-27`; `docs/onboarding-a-shelter.md:507-531` | `KABINET_WRITE_ALLOWLIST` has no hit in `apps/web/src` or `packages` at HEAD (it only lives in docs), so only a leftover Vercel variable could exist. `OPIKA_TEST_FAIL_GALLERY` is read in `apps/web/src/features/gallery/test-only-failure.ts`. If the R2 clean-up vars are missing the cron logs `outcome: "off"` and deletes nothing (`r2-cleanup-cron.ts:55-57`). `RATE_LIMIT_KEY_SECRET` also exists (`env.ts:278`); whether it is required in production: UNVERIFIED. |
| 5 | **R2 clean-up cron has run.** Owner opens Vercel, the project, Logs, searches `r2_cleanup`, over the last 48 h. Expected line (daily around 04:00 UTC): `{"event":"r2_cleanup","outcome":"ran","scanned":...,"deleted":...}`. Other outcomes: `off` = the four R2 variables are missing or incomplete, `refused_no_secret` / `refused_misconfigured` = `CRON_SECRET` problem. No line at all = the cron has not been invoked. | O | R | `apps/web/vercel.json:7`; `apps/web/src/kabinet/r2-cleanup-cron.ts:49, 56, 60, 71-83`; `launch-sequence.md:20-27` | `launch-sequence.md:20-27` makes this a dependency before the first reset. Whether it has ever run in production: NOT DOCUMENTED. Vercel runs crons only on production deployments (`docs/decisions-inbox.md` KH-T6, line 188). If `off`: set the variables and redeploy before reset 1. |
| 6 | Resend: advisor (C) reads the Resend dashboard and confirms click and open tracking OFF on `mail.opika.org.ua` and TLS Enforced; owner sends `email:delivery-test --to <alias>` and reads the received links. | C (dashboard), O (test mail) | R | `docs/onboarding-a-shelter.md:626-664, 696-703` | Auth emails must carry plain links. Check Promotions/Spam placement here too (the DMARC test already passed 2026-11-02, `launch-gate.md:33`). Resend Pro: no daily limit, shared with the `hello@` SMTP relay (owner's figures, NOT in the repo; `docs/onboarding-a-shelter.md:709-716` describes the relay). The rehearsal plan stays under 60 per day. |
| 7 | Sentry: `NEXT_PUBLIC_SENTRY_DSN` set; fire the test error; uptime monitor on `/api/health`. | O | R | `docs/dev-notes.md:196-199, 230-247`; `Claude outputs/SENTRY-uptime-steps.md` | `POST /api/monitoring/test` with `Bearer $CRON_SECRET` (read with `Read-Secret`). Expected status 500, one issue in Sentry. |
| 8 | Upstash reachable. If it is down (owner, 2026-11-20): public reads, a first-contact reveal and signed-in kabinet use fail OPEN; sign-in (password, magic link, verify), forgot/reset, invites and registration fail CLOSED with an honest error; each outage sends a Sentry «rate limiter unreachable» at most once a minute per instance. | O | R | `apps/web/src/api/limiter-fail-modes.test.ts` (the policy tables), `apps/web/src/kabinet/auth.ts` (`SIGNED_IN_AUTH_PATHS`) | Region conflict (iad1 vs Frankfurt) and DPA/SCC for Resend and Upstash are open in `docs/gdpr-analysis.md:136-149`. Not blocking the rehearsal; open before real shelters. |
| 9 | Rehearse `db:full-reset` on a fresh Neon CHILD branch. | O | R (child is disposable) | `launch-sequence.md:29-69`; `child-sitting.md` | Owner wants this BEFORE reset 1. The generator `smoke-sitting.ts` cannot render it (rule 8): see the child-sitting file for the labelled-as-not-generated block and the generator change needed. Costs ten minutes, proves the guard, `--expect`, the 17-table list and the 0022 precondition. |
| 10 | Know the pre-launch gate link (`?gate=<PRELAUNCH_GATE_SECRET>`) is the only way to see adopter pages; the kabinet, `/api/auth`, `/api/kabinet`, `/api/monitoring`, `/api/health`, crons and `/opengraph-image` are gate-exempt. | O | R | `apps/web/src/proxy.ts:65-70, 135-160, 200-205` | Never paste the gate secret or link into chat. |
| **B. Cycle 1: reset, bootstrap, rehearsal** | | | | | |
| 11 | Neon restore branch `pre-reset-1` from production head. Create immediately before the reset; apply NO migration between this and a possible restore. | O | R (it IS the rollback) | `launch-sequence.md:73-82` | Name is the owner's (docs use `pre-launch-reset-1-<date>`). Keep until reset 2 has run. After any restore the production endpoint id may change; `--expect` then fails closed (note only, NOT DOCUMENTED). |
| 12 | `db:full-reset` dry run, then `--commit`. | O | **I** (the branch is the only undo) | `launch-sequence.md:84-124`; `full-reset.ts:63-87, 179-216`; `packages/db/package.json:33` | Full command and expected output (17 tables) in `reset-runbook.md`. |
| 13 | `db:check-hashes`: every migration `match` (23). | O | R | `launch-sequence.md:126-140` | A mismatch means stop. |
| 14 | `admin:bootstrap <operator-address> --prod` (NO `--expect`: the command takes none); sign in at `/kabinet/vkhid` by magic link. | O | P (`admin:revoke`; a second bootstrap is impossible) | `launch-sequence.md:142-171`; `packages/db/src/admin.ts:35, 61-90` | Operator never has a password. Owner signs in himself. |
| 15 | R2 clean-up one-off after reset 1 (optional here), then Cloudflare Caching, Purge Everything. | O | **I** (deletes R2 objects) | `launch-sequence.md:194-238`; `packages/db/src/r2-cleanup.ts:162-176` | Only deletes objects no DB row references. DO NOT run while a rollback to `pre-reset-1` is still possible (restored rows would point at deleted files). Purge Everything on the free plan is harmless before launch. |
| 16 | Dress rehearsal with test data (`rehearsal-matrix.md`, two sittings). `REGISTRY_HAS_NO_REAL_SHELTERS` and the gate stay ON. | O + C | R (reset 2 removes it all) | `launch-sequence.md:173-192`; `apps/web/src/seo-flags.ts:57, 91` | Do not touch the two flags. NEW (Sitting 2): the matrix now has S2-P (pause, #423, on S3) and S2-E (early listing, #425 plus operator UI #426, on S1 and S2), starting from the real state: S1 under_review, S2 pending, S3 verified, no S4. Pause needs the latest default-branch deployment live; S2-E must NOT start until #426 is merged AND deployed (owner hard rule), and migration 0023 must be on production (23 `match` lines become 24). |
| **C. Cycle 2: remove the rehearsal** | | | | | |
| 17 | Neon restore branch `pre-reset-2`. | O | R | `launch-sequence.md:242-248` | Delete `pre-reset-1` only after reset 2 is verified. |
| 18 | `db:full-reset` again (dry run, `--commit`), `db:check-hashes`, `admin:bootstrap` again. | O | **I** | `launch-sequence.md:250-267` | Last reset ever (see DANGER above). |
| 19 | R2 clean-up one-off with `--grace-days 0 --commit`; read the printed key list before trusting the count; then Cloudflare Caching, Purge Everything. Counts: Cloudflare R2 dashboard object count plus the `r2:cleanup` dry run (there is no `r2:count` script). | O | **I** | `launch-sequence.md:269-272`; `r2-cleanup.ts:23-25, 162-176`; `reset-runbook.md` 5(b) | Alternative: let the daily cron remove the rehearsal photos after the 7-day grace period (then purge once they are gone). |
| 19b | **Upgrade production Neon from Free to Launch** (and decide on auto-suspend, "scale-to-zero"). Do it BEFORE step 20. | O (Neon console) | P (downgrade possible, not documented) | `launch-gate.md:37`; `stack-decision.md:18` ("upgrade to Launch and disable suspend before onboarding") | Launch-traffic estimate is ~120 CU-hours a month, so Free would suspend (`launch-gate.md:37`). |
| **D. Launch** | | | | | |
| 20 | Onboard each real shelter: `onboard:shelter <file> --prod` dry run, then `--commit`; `location:verify --prod` = 0 mismatches. Input file OUTSIDE the repo. | O (with the shelter on the phone) | P (`demo:remove --shelter` removes one mistaken shelter before it was served) | `launch-sequence.md:274-303`; `docs/onboarding-a-shelter.md:28-269` | Needs `LOCATION_HMAC_SECRET` (same value as Vercel), R2 write token (local only). Verification evidence per legal shape: `docs/onboarding-a-shelter.md:28-50`, `packages/domain/src/shelters/verification/policy.ts:31-42`. |
| 21 | Per-IP limit variables for a launch-day crowd: `RATE_LIMIT_ADOPTERS_PER_IP_DAY` (default 50), `RATE_LIMIT_REVEALS_PER_IP_DAY` (default 100). Raise only if Logs show `adopter-mint` / `reveal-ip` refusals. | O (Vercel env + redeploy) | R | `launch-sequence.md:376-418`; `apps/web/src/api/per-ip-budgets.ts:30-31` | Changed env reaches only NEW deployments. |
| 22 | Flip `REGISTRY_HAS_NO_REAL_SHELTERS` true to false (one-line PR, `apps/web/src/seo-flags.ts:57`). | O decides, C/agent prepares PR | R (flip back) | `launch-sequence.md:305-319`; `CLAUDE.md` hard rules | Hard rule: "Never flip" applies to agents without the owner's explicit go; the flip is a normal reviewed PR. It removes the demo banner and disclosures that gate inline on this flag (`apps/web/src/app/layout.tsx`, `pro`, `prytulkam`, `prytulky/[shelterId]`, `tvaryny` pages and the animal and shelter screens). The "перевірений" card suffix named in `launch-sequence.md:313-316` NO LONGER EXISTS: its helper `verificationSuffix` was removed 2026-11-03 (`seo-flags.ts:50-53`). Stale doc. |
| 23 | One commit: `SITE_IS_PUBLICLY_DISCOVERABLE` false to true (`seo-flags.ts:91`) (this removes the gate); drop `PRELAUNCH_GATE_SECRET` from the required env schema (`apps/web/src/api/env.ts:155-160`); append `R4_2_ANALYTICS_SENTENCE` to `ukPublic.about.analytics`; keep per-animal OG images exempt per BR-7 (change the `proxy.test.ts` case). | O decides, agent prepares | R (revert and redeploy) | `launch-sequence.md:321-359`; `seo-flags.ts:175-199` (tripwire `assertAnalyticsCopyMatchesGateState`); `proxy.ts:65-70, 200-205`; `apps/web/src/proxy.test.ts:236` | **Real names in code:** the constant is `R4_2_ANALYTICS_SENTENCE`, `packages/i18n/src/messages/uk-public.ts:47` (re-exported by `messages/uk.ts:9-14`; the tripwire imports it from `@opika/i18n/public`, `seo-flags.ts:1`). The text to extend is `about.analytics` in `uk-public.ts:1067` (exposed as `uk.about.analytics`). The doc's `PENDING_R4_2_ANALYTICS_SENTENCE` and `messages/uk.ts` are stale. Today only `/opengraph-image` is exempt (`proxy.ts:200-205`); the test named "exempts the site-wide link-preview image and nothing next to it (BR-7)" pins the per-animal image as gated and must change. |
| 24 | Verify from a clean machine: `/tvaryny` 200, no `X-Robots-Tag: noindex`, no robots meta, `/pro` shows the "одне кукі" sentence. `/tvaryny/gortaty` answers a 308 to `/tvaryny`. | O (C may run read-only fetches) | R | `launch-sequence.md:346-356`; `apps/web/next.config.ts:58-66` | |
| 25 | Allow indexing: Google Search Console verify and submit root URL; spot check `/robots.txt`. **Also set the GitHub About** (description, topics, website) from the draft below. | O | R | `launch-sequence.md:361-372` | A day or two after step 23. The repo is public: nothing in the About may name a real shelter. |
| **E. Items the task named that the repo does not fully document** | | | | | |
| 26 | Cloudflare Cache Rule for the photo CDN. | O | R | `docs/onboarding-a-shelter.md:538-553` (added by #404, commit `c40078e`, 2026-11-03) | Now documented: a Cache Rule on host `img.opika.org.ua`, "eligible for cache", browser TTL 1 year, edge TTL "use origin" (4 h from `s-maxage=14400`, `packages/db/src/image-pipeline/r2-client.ts:29`). Whether the rule has actually been created in the dashboard: UNVERIFIED, owner confirms. After the pre-launch reset the browser-TTL override can be removed (keep the eligibility part). A cache purge is part of steps 15 and 19. |
| 27 | Resend plan / quota for launch week. | O | R | NOT in the repo (`stack-decision.md` only names Resend). | Resend is on Pro (no daily limit; the app's caps of 300 a day are runaway-loop guards, `runbook.md` section 10), shared with the `hello@` relay. Real invites at launch are about one email per shelter; sign-in links add more. |
| 28 | DMARC `p=reject` follow-up. | O (Cloudflare DNS) | R | `launch-gate.md:33`; `docs/onboarding-a-shelter.md:665-708` | After a week of clean reports. Not a launch blocker. |
| 29 | Privacy policy / GDPR open items (G1-G7), Upstash region and DPAs, `/pro` sentences match behaviour. | O decides | n/a | `docs/gdpr-analysis.md:125-149, 230-240`; `launch-gate.md:74` | "The rest of the analysis (G1-G7) is still open, unscheduled". The `swipes` table is gone (`gdpr-analysis.md:57`), so one fewer table holds adopter activity. Not a code step, but it is a launch decision. |
| 30 | Sitemap scale follow-up (above ~1,500 listed animals). | later | n/a | `launch-gate.md:67` | Not a launch blocker. |

## GitHub About: draft for step 25 (owner sets it)

Source of the wording: the first paragraph of `README.md:3-9` ("A registry of verified Ukrainian shelters'
animals, nationwide. Free for shelters, and no money is handled"; "All data in this repository is fictional").
Plain, no exclamation marks, no product claims beyond the README.

- Description, English (matches the README and most docs):
  `A registry of verified Ukrainian shelters' animals, nationwide. Free for shelters; no money is handled. All data in this repository is fictional.`
- Description, Ukrainian alternative (DRAFT: new Ukrainian copy needs the owner's approval, `opika-copy` gate):
  `Реєстр тварин із перевірених притулків України. Безкоштовно для притулків, гроші не проходять через сайт. Усі дані в репозиторії вигадані.`
- Website: leave empty until step 24 passes, then the production URL.
- Topics: `pet-adoption`, `animal-shelters`, `ukraine`, `nextjs`, `typescript`, `pwa`, `postgresql`, `drizzle-orm`,
  `orpc`, `cloudflare-r2`, `better-auth`. (Stack from `README.md:20-35`. Topic names are lowercase with hyphens; GitHub's
  allowed set is not checked here. The licence is AGPL-3.0, `LICENSE:1-2`, shown by GitHub on its own.)

## Open questions (docs vs code, or not documented)

1. Has migration 0022 (drop `swipes`) been applied to production? NOT DOCUMENTED. It decides whether reset 1 can
   succeed at all (row 1, DANGER 2).
2. Is the Neon project on Free and is auto-suspend on? Owner states Free; auto-suspend NOT DOCUMENTED.
3. Has the R2 clean-up cron ever run in production (env set, `outcome: "ran"`)? NOT DOCUMENTED (row 5, owner reads the logs).
4. Was a child-branch rehearsal of `db:full-reset` ever done? NOT DOCUMENTED. The generator cannot render one;
   `child-sitting.md` has the block and the generator change.
5. Is the Cloudflare Cache Rule on `img.opika.org.ua` created? Documented (#404), existence UNVERIFIED.
6. After a Neon "restore", does the production endpoint id stay the same? NOT DOCUMENTED. If it changes,
   `--expect` and `PROD_NEON_ENDPOINT` must be retyped; the scripts fail closed.
7. Resend plan: Pro, no daily limit (owner's figures; NOT in the repo).
8. Stale docs to fix later: `launch-gate.md:28` (PG-F3), `build-plan.md:1055` (PG-F3), `launch-sequence.md:58`
   (`--expect` on `admin:bootstrap`), `:204-206` (missing R2 variables), `:313-316` (card suffix),
   `:335-337` (`PENDING_R4_2_ANALYTICS_SENTENCE`, `messages/uk.ts`), and the three `onboarding-a-shelter.md`
   sections named above (they also still say three photo variants, `:554-577`; the code writes five).
