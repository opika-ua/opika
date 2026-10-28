# The launch sequence

One ordered runbook, replacing the three separately-tracked items it supersedes: D-7 (the
demo-to-real transition write-up), the wipe-and-flip script + runbook, and the
discoverability-flip runbook (`docs/launch-gate.md`). Built on Oleksii's own instruction,
2026-10-24: a **full reset**, not a demo-only wipe. **Corrected 2026-10-25 on the order** -
his own words, verbatim: "you have my order backwards. I said: wipe everything, then set up
my admin account, then invite myself as a shelter and go through the whole flow." The reset
runs *before* the dress rehearsal, twice in total: once to clear whatever is already in
production, once more right after the rehearsal to remove the rehearsal shelter itself -
no `demo:remove --shelter` step. With the full reset, no demo data and no rehearsal data ever
coexists with real data - closing D-5's concern by construction, not by timing (see
"D-5/D-7, closed by this document" at the end).

Every command below is PowerShell. Every count is read in the **Neon SQL Editor** (the
console), not `psql` - this supersedes the `psql`-based form used in earlier migration
runbooks (0013-0015) for this document's own steps; those runbooks are otherwise unchanged.
Oleksii runs every step; nothing here is automated end-to-end.

**Dependency, before step 1, not merely before step 6** (Oleksii's FR-F4, confirmed
2026-10-25): the GDPR R2 clean-up job (`docs/decisions-inbox/feat-r2-photo-cleanup.md`, R2-B1)
must already be built, deployed to production and enabled - its scheduled job running, its
own `R2_CLEANUP_ACCESS_KEY_ID`/`R2_CLEANUP_SECRET_ACCESS_KEY` set - before the *first* real
reset (step 2), not merely before step 6's manual one-off run. Step 2's `TRUNCATE` orphans
every photo belonging to whatever test/demo data was already in production; those photos need
the job already running to ever get swept at all, on the daily schedule or by the manual
`--grace-days 0` runs (steps 6 and 11).

## Rehearse first, once, long before the real sequence ever runs

**Oleksii's own instruction, 2026-10-25** (in place of rebuilding this script under a
different model - `docs/model-policy.md` would otherwise call for Opus on irreversible
production work): before `db:full-reset` ever touches real production, rehearse it on a
disposable Neon child branch. This is not part of either cycle below and is not repeated -
once this has passed, both cycles below are the same script, already proven, against
production.

```powershell
nvm use 24
cd D:\Startup\opika
git switch main
git pull
pnpm i --frozen-lockfile --prefer-offline

# A fresh Neon child branch of production (Neon console, or neonctl branches create --parent main).
$env:PROD_NEON_ENDPOINT = "ep-dawn-pond-b1dz515g"
$env:DATABASE_URL = Read-Secret "Child branch connection string"

pnpm --filter @opika/db db:migrate --expect <child-branch-endpoint-id>

# Dry run - prints every table's current row count.
pnpm --filter @opika/db db:full-reset --expect <child-branch-endpoint-id>

# Apply.
pnpm --filter @opika/db db:full-reset --expect <child-branch-endpoint-id> --commit

pnpm --filter @opika/db db:check-hashes
pnpm --filter @opika/db admin:bootstrap oleksii@example.org --expect <child-branch-endpoint-id>

Remove-Item Env:DATABASE_URL
```

**Verification:** the `--commit` run's own output prints every table at 0; `db:check-hashes`
reports every migration `match`; `admin:bootstrap` prints "Done." Confirms the script, the
guard, and the whole chain of commands run clean end to end before any of it touches
production for real.

**Rollback:** none needed - a child branch is disposable. Delete it when done
(`neonctl branches delete`, or the Neon console).

## Cycle 1 - clear what's there, then the dress rehearsal

### 1. A Neon backup branch

**His own step, in the Neon console.** Create a branch of production (`main`) named
something like `pre-launch-reset-1-2026-10-25`, from the current head. This is the rollback
for step 2 - restoring from it is faster and less error-prone than trying to reconstruct
anything by hand. Keep it until cycle 2's own reset (step 8) has run, then delete it (it
costs storage otherwise, and once step 8 has run there's nothing left in it worth restoring
to).

**Rollback:** n/a - this step is itself the rollback mechanism for everything after it.

### 2. The full reset

Empties every application data table in production - shelters, animals, history, reveals,
swipes, every `auth_*` table, support sessions - in one `TRUNCATE`. Keeps the schema, the
`drizzle.__drizzle_migrations` table, and `cities` (geography reference data, not application
data; see `packages/db/src/full-reset.ts`'s own doc comment for the full list and why each
exclusion is deliberate, not a gap).

```powershell
$env:PROD_NEON_ENDPOINT = "ep-dawn-pond-b1dz515g"
$env:DATABASE_URL = Read-Secret "Production DIRECT connection string"

# Dry run - prints every table's current row count, and confirms cities is kept.
pnpm --filter @opika/db db:full-reset --expect ep-dawn-pond-b1dz515g --prod

# Apply.
pnpm --filter @opika/db db:full-reset --expect ep-dawn-pond-b1dz515g --prod --commit

Remove-Item Env:DATABASE_URL
```

**Verification:** the `--commit` run's own output prints every table at 0 and exits non-zero
if any isn't. Also, in the **Neon SQL Editor**, against production:

```sql
SELECT table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text::int AS row_count
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

Expected: every table in `packages/db/src/full-reset.ts`'s `FULL_RESET_TABLES` list is 0;
`cities` is unchanged from before; no table is missing from this list at all
(`full-reset-table-coverage.test.ts` would already have failed in CI before this ever
merged). This TRUNCATE overrides two standing "never delete" rules (`super_admins`,
`support_sessions`) by design - see the override notes next to both in
`packages/db/src/schema/auth.ts`.

**Rollback:** restore the Neon backup branch from step 1 as `main` (Neon console: "Restore
from branch"). Nothing else in this cycle has run yet at this point, so there is nothing else
to undo.

### 3. `db:check-hashes`

Proves the reset touched no migration - same schema, same applied history.

```powershell
pnpm --filter @opika/db db:check-hashes
```

**Verification:** every migration reports `match`. (Its own command is read-only against
`drizzle.__drizzle_migrations`, which the reset never touches - see `check-migration-hashes.ts`'s
own doc comment.)

**Rollback:** a mismatch here means something touched the migrations table outside this
document, which the reset itself cannot cause. Stop and investigate before continuing; do not
proceed to step 4 with a mismatch unexplained.

### 4. Bootstrap the operator account

```powershell
pnpm --filter @opika/db admin:bootstrap oleksii@example.org --prod
```

(Use your real address. `--name=` is optional, defaulting to the address itself.) This prompts
for confirmation before writing. It refuses if an operator already exists - after a full
reset, none does, so this is the one time it can run.

**Verification:** the command prints "Done: the user exists and is an operator." In the
**Neon SQL Editor**:

```sql
SELECT u.email, sa.granted_at, sa.revoked_at
FROM super_admins sa JOIN auth_user u ON u.id = sa.user_id
WHERE sa.revoked_at IS NULL;
```

Expected: exactly one row, your address, `revoked_at` null.

**Rollback:** `pnpm --filter @opika/db admin:revoke <email> --prod` (stamps `revoked_at`,
never deletes the row - HS-T2, overridden only by the reset itself). A fresh
`admin:bootstrap` cannot run again afterward (it is one-time by a fixed grant id, not by "no
active operator", RG-T9); recovery from a mistaken bootstrap is `admin:grant` on the same
address, not a second bootstrap.

**Signing in:** go to `/kabinet/vkhid`, request a magic link to your address (the operator
has no password - Better Auth's magic-link plugin, not the shelter-admin password flow), and
follow the emailed link.

### 5. The UI dress rehearsal - invite yourself as a shelter

**RU-B5, Oleksii's own script, verbatim** - written in full in
`docs/onboarding-a-shelter.md`'s "Dress rehearsal (UI only)" section; follow it there rather
than a paraphrase here. In short: as the operator, create and verify a shelter; invite
yourself as its admin from the shelter page; as that admin, sign in on a phone, fill the
profile, add 2-3 animals with real phone photos, and publish; as an adopter, find them in the
deck and gallery, reveal contacts, and message the shelter; mark one adopted and hide one,
approve a donation link, suspend and reinstate the shelter, and check the history shows all
of it.

**Verification:** each step of RU-B5 IS its own verification - this is a human walkthrough,
not a scripted check. The point is confirming the real kabinet, real email delivery
(Resend/Brevo, whichever is live), and the real adopter-facing surfaces all work end to end
against production, immediately after a reset that touched every one of their tables.

**Rollback:** none needed mid-rehearsal - nothing here is a one-way action. If something is
wrong, fix it, redeploy, and repeat from wherever it broke. The whole shelter (and this
cycle's operator account) is removed by cycle 2's own reset (step 8), not by a separate
removal step.

### 6. R2 clean-up, one-off run

**Dependency, confirmed 2026-10-25:** the R2 clean-up job (`docs/gdpr-analysis.md`, photo
retention) must already be built, deployed and enabled - its scheduled job running, its own
`R2_CLEANUP_*` token set - before this step, and before cycle 2's reset (step 8) too (see the
note at the top of this document: the requirement is before step 1, not merely before this
step). Sweeps whatever step 2's reset just orphaned: every photo belonging to whatever
test/demo data was already in production before this cycle began.

```powershell
$env:DATABASE_URL = Read-Secret "Production DIRECT connection string"
$env:R2_CLEANUP_ACCESS_KEY_ID = Read-Secret "R2_CLEANUP_ACCESS_KEY_ID"
$env:R2_CLEANUP_SECRET_ACCESS_KEY = Read-Secret "R2_CLEANUP_SECRET_ACCESS_KEY"

# Optional general preview - the default 7-day grace period, not this
# step's own --grace-days 0 override (see the note below for why).
pnpm --filter @opika/db r2:cleanup --expect ep-dawn-pond-b1dz515g --prod

# Apply, at the post-reset override. There is no dry run for --grace-days 0
# itself - R2-F4 (closed) keeps the override requiring --commit.
pnpm --filter @opika/db r2:cleanup --expect ep-dawn-pond-b1dz515g --prod --grace-days 0 --commit

Remove-Item Env:DATABASE_URL
Remove-Item Env:R2_CLEANUP_ACCESS_KEY_ID
Remove-Item Env:R2_CLEANUP_SECRET_ACCESS_KEY
```

`--grace-days 0` is refused everywhere except a manual run with `--commit` - his R2-B1 words,
verbatim, "allowed only in a manual run with --commit and the typed --expect" - so there is no
dry-run preview of what the override specifically would catch before this commits; the general
preview above (no `--grace-days`) only shows what's due at the default 7-day period, which right
after a reset is nothing yet. `--expect` is required unconditionally for this script, commit or
not (R2-F2, the same shape as `demo:remove`'s own `main()`) - and the scheduled job
(`/api/cron/r2-cleanup`) has no way to be given an override at all: it never reads a
`--grace-days`-shaped input, by construction, not by a check.

**R2-F4, closed** (`docs/decisions-inbox.md`): Oleksii, verbatim, 2026-10-26: "Record R2-F4 as
closed: --grace-days keeps requiring --commit." The preview idea (a read-only run of
`--grace-days N` without `--commit`) is not adopted; this step stays exactly as written above.

**Verification:** the `--commit` run reports how many objects it actually deleted, and prints
their keys (not a size summary) - review that list before trusting the count.

**Rollback:** none - this only deletes R2 objects nothing in the database (just emptied by
step 2) refers to any more.

## Cycle 2 - remove the rehearsal, onboard for real

### 7. A Neon backup branch, again

Same as step 1, a fresh branch (e.g. `pre-launch-reset-2-2026-10-25`) from the current head -
cycle 1 changed production, so step 1's backup is now stale as a rollback target for this
cycle's own reset.

**Rollback:** n/a - this step is itself the rollback mechanism for everything after it.

### 8. The full reset, again

Exactly step 2, run again. This is what removes the rehearsal shelter and cycle 1's operator
account - not a `demo:remove --shelter` call. Same commands as step 2 (swap the backup
branch name in your own notes; the production target and `--expect` value are unchanged).

**Verification:** identical to step 2's.

**Rollback:** restore the Neon backup branch from step 7 as `main`.

### 9. `db:check-hashes`, again

Identical to step 3.

### 10. Bootstrap the operator account, again

Identical to step 4 - cycle 1's operator account was just removed by step 8, so this is a
fresh bootstrap, not a no-op.

### 11. R2 clean-up, one-off run, again

Identical to step 6. Sweeps the rehearsal's own photos, now genuinely orphaned: their
`animals` row is gone (step 8), so nothing references them any more.

### 12. Onboard the real shelters

**The existing path**, `docs/onboarding-a-shelter.md` in full, run once per real shelter:

```powershell
$env:LOCATION_HMAC_SECRET = Read-Secret "LOCATION_HMAC_SECRET"
$env:DATABASE_URL = Read-Secret "Production DIRECT connection string"
pnpm --filter @opika/db onboard:shelter -- D:\path\to\shelter.json --prod
# review the dry-run printout, then:
pnpm --filter @opika/db onboard:shelter -- D:\path\to\shelter.json --prod --commit
Remove-Item Env:DATABASE_URL
Remove-Item Env:LOCATION_HMAC_SECRET
```

**Verification:** `location:verify --prod` reports 0 mismatches and 0 shelters on the
test-only key (every real shelter uses the production `LOCATION_HMAC_SECRET`). In the **Neon
SQL Editor**:

```sql
SELECT id, display_name, verification_status FROM shelters;
```

Expected: exactly the real shelters just onboarded, each `verification_status = 'verified'`.

**Rollback:** `onboard:shelter` only inserts; a mistaken onboard is removed with
`demo:remove --shelter <id> --prod --commit` (the same mechanism the old plan used to retire
the rehearsal shelter - still the right tool for removing *one* mistakenly onboarded real
shelter, just not for the rehearsal shelter, which the reset above already removes), before
any animal on it has been shown to an adopter (S8-F5's `everServedAt` names exactly this: if
nothing has served it yet, nothing is lost by removing it).

### 13. Flip `REGISTRY_HAS_NO_REAL_SHELTERS`

A one-line code change: `apps/web/src/seo-flags.ts`, `REGISTRY_HAS_NO_REAL_SHELTERS = true`
→ `false`. Commit, push, let the deploy land. This is independent of step 14 below - real
shelters existing is not the same fact as the site being publicly discoverable
(`docs/standing-constraints.md`'s "two facts that happen to be true at the same time are not
one fact"; `seo-flags.ts`'s own doc comment on this constant has the full reasoning).

**Verification:** `seo-flags.test.ts`'s own assertions pass in CI before this merges. After
deploy, the gallery's demo banner and the deck's demo label are gone, and a card's "·
перевірений" suffix appears for a verified real shelter — all driven by this one flag
(`verificationSuffix`, `seo-flags.ts`).

**Rollback:** flip it back to `true`, commit, redeploy. Reversible at any point before step
14, since nothing downstream depends on it alone.

### 14. Remove the gate, flip `SITE_IS_PUBLICLY_DISCOVERABLE`, land R4-2 - one commit

Three changes, one commit, because `assertAnalyticsCopyMatchesGateState` (`seo-flags.ts`)
is a test-time tripwire that fails CI if they land out of step with each other (it does not
throw at boot - `instrumentation.ts`'s `assertDemoDiscoverabilityInvariant` is the one
boot-time check, and it covers the other pair of constants, step 13 above):

1. `apps/web/src/seo-flags.ts`: `SITE_IS_PUBLICLY_DISCOVERABLE = false` → `true`. This alone
   removes the pre-launch gate too - `proxy.ts`'s gate only runs
   `if (!SITE_IS_PUBLICLY_DISCOVERABLE)`, so flipping this constant is the gate's removal, not
   a separate edit (deleting the dead branch in `proxy.ts` is optional cleanup, not required
   for correctness).
2. `apps/web/src/api/env.ts`: drop `PRELAUNCH_GATE_SECRET` from `RequiredProductionEnvSchema`
   - nothing reads it anymore once the gate's branch is unreachable.
3. `packages/i18n/src/messages/uk.ts`: append `PENDING_R4_2_ANALYTICS_SENTENCE` to
   `uk.about.analytics` (`+ " " + PENDING_R4_2_ANALYTICS_SENTENCE`, not retyped - the constant
   is Oleksii's own already-written Ukrainian, held since 2026-10-06).

Commit, push, let the deploy land.

**Verification:** the tripwire test above is green in CI before this ever merges - a failed
merge here is the check working, not a surprise. After a successful deploy, from a machine
with no gate cookie and no `?gate=` parameter:

```powershell
Invoke-WebRequest -Uri "https://opika.org.ua/tvaryny" -UseBasicParsing | Select-Object StatusCode, Headers
```

Expected: `200`, no `X-Robots-Tag` header (or a value that isn't `noindex`). View page source:
no `<meta name="robots" content="noindex...">`. `/pro`'s analytics paragraph includes R4-2's
"одне кукі" sentence.

**Rollback:** revert the commit, redeploy. All three changes are plain code/copy; nothing
here is a data migration.

### 15. Allow indexing

Nothing left to *do* - step 14 already made the site crawlable and indexable. This step is
confirming it, a day or two after step 14's deploy:

- Google Search Console (if not already verified for `opika.org.ua`, verify it now) - submit
  the root URL for indexing, or just wait for the next crawl.
- Spot-check `https://opika.org.ua/robots.txt` allows `/` (it always has, D-3) and a real page
  no longer carries `noindex` (same check as step 14's verification).

**Rollback:** n/a - there is nothing to roll back; "allow indexing" is an observation that
step 14 worked, not an action with its own state.

---

## Per-IP limits on the adopter API, and where to see a refusal

Two limits on the public API are environment variables (owner, 2026-10-28; #243), so a
launch-day crowd behind one shared address (a carrier's NAT, an office, a campus) can be let
through without a code change. Each counts per IP address over a rolling 24 hours; an IPv6
address counts as its whole /64.

| Variable | Default | What it limits |
|---|---|---|
| `RATE_LIMIT_ADOPTERS_PER_IP_DAY` | 50 | New anonymous visitors (`session.bootstrap` creating one) from one address. Returning visitors cost nothing. |
| `RATE_LIMIT_REVEALS_PER_IP_DAY` | 100 | Shelters whose contacts are opened for the first time, by any visitor behind one address. Re-opening a shelter that visitor already opened costs nothing. |

Each visitor's own limit, 30 shelters per 24 hours, is fixed in code and is not one of these.

A value must be a positive whole number (`75`, not `75.0`, `0` or `-1`). Anything else, an
empty value included, is ignored: the default applies and the instance logs one warning at
startup, `{ event: "rate_limit_config_invalid", variable, using }`, naming the variable and the
default, never the value. Unset means the default, with no warning.

**To raise either:** Vercel → the project → Settings → Environment Variables → add or edit it for
**Production**, then redeploy (Deployments → the current one → Redeploy). A changed variable
reaches only new deployments. Lowering works the same way. `HARNESS_LIFTS_PER_IP_BUDGETS` belongs
to the Playwright harness only: it is ignored on any Vercel deployment and wherever the shared
store is configured, so never set it there.

**To see whether real visitors meet a limit:** Vercel → the project → Logs, search
`rate_limited`. Every refusal writes one line, `{ event: "rate_limited", limiter: "<name>" }`,
with no IP address, email address, cookie or visitor id in it. The names:

- `adopter-mint`, `reveal-ip`: the two variables above.
- `reveal-adopter`: a visitor's own 30 shelters.
- `api`: 100 requests a minute per address, on the API and the gallery, deck, animal and
  shelter pages.
- `kabinet-ip`, `kabinet-user`: the shelter cabinet's per-address and per-account budgets.
- `kabinet-sign-in-ip`, `kabinet-sign-in-address`: sign-in links. The visitor sees the same
  answer as a sent link; the refusal is logged anyway.
- `kabinet-sign-in-delay`: the password sign-in's increasing wait.
- `kabinet-forgot-ip`, `kabinet-forgot-address`, `kabinet-reset-ip`, `kabinet-invite-ip`:
  «Забули пароль?», the reset form and the invitation link's password.
- `kabinet-photo-hour`, `kabinet-photo-day`: photo and logo uploads per shelter.

A steady trickle of `adopter-mint` or `reveal-ip` from ordinary use is the signal to raise the
matching variable.

---

## D-5/D-7, closed by this document

**D-5**'s concern (a demo contact ever indexed) is now closed **by construction**, not by
timing: with a full reset before even the dress-rehearsal shelter exists, no demo-shaped data
is ever in the database at any point this document describes, so there is nothing demo-shaped
to index regardless of how the steps above are sequenced relative to each other.

**D-7** (write the demo-to-real transition into `docs/standing-constraints.md` and the
onboarding checklist) is this document. The two-constants distinction it was supposed to
record (`REGISTRY_HAS_NO_REAL_SHELTERS` vs `SITE_IS_PUBLICLY_DISCOVERABLE`, steps 13-14 above)
is unchanged by the move to a full reset - that window (a real shelter live, not yet
publicly discoverable) still exists and is still deliberate, for the same reason it always
was: a shelter's first real listing needs to be checkable (the `?gate=` preview link, step
5's rehearsal having already proven the mechanism works) before the whole site is meant to be
found.

`docs/launch-gate.md`'s rows for D-7, the wipe-and-flip script/runbook, and the
discoverability-flip runbook all point here now.
