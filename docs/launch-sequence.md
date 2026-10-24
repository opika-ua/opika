# The launch sequence

One ordered runbook, replacing the three separately-tracked items it supersedes: D-7 (the
demo-to-real transition write-up), the wipe-and-flip script + runbook, and the
discoverability-flip runbook (`docs/launch-gate.md`). Built on Oleksii's own instruction,
2026-10-24: a **full reset**, not a demo-only wipe, run once, personally, after his own dress
rehearsal as a real shelter through the real kabinet flow. With the full reset, no demo data
and no rehearsal data ever coexists with real data — closing D-5's concern by construction,
not by timing (see "D-5/D-7, closed by this document" at the end).

Every command below is PowerShell. Every count is read in the **Neon SQL Editor** (the
console), not `psql` — this supersedes the `psql`-based form used in earlier migration
runbooks (0013–0015) for this document's own steps; those runbooks are otherwise unchanged.
Oleksii runs every step; nothing here is automated end-to-end.

## 0. Before anything: a Neon backup branch

**His own step, in the Neon console.** Create a branch of production (`main`) named
something like `pre-launch-reset-2026-10-24`, from the current head. This is the rollback for
step 1 — restoring from it is faster and less error-prone than trying to reconstruct anything
by hand. Keep it until a real shelter has been live for a few days past launch, then delete it
(it costs storage otherwise).

**Rollback:** n/a — this step is itself the rollback mechanism for everything after it.

## 1. The full reset

Empties every application data table in production — shelters, animals, history, reveals,
swipes, every `auth_*` table, support sessions — in one `TRUNCATE`. Keeps the schema, the
`drizzle.__drizzle_migrations` table, and `cities` (geography reference data, not application
data; see `packages/db/src/full-reset.ts`'s own doc comment for the full list and why each
exclusion is deliberate, not a gap).

```powershell
nvm use 24
cd D:\Startup\opika
git fetch origin
git switch main
git pull
pnpm i --frozen-lockfile --prefer-offline
$env:PROD_NEON_ENDPOINT = "ep-dawn-pond-b1dz515g"
$env:DATABASE_URL = Read-Secret "Production DIRECT connection string"

# Dry run — prints every table's current row count, and confirms cities is kept.
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
`cities` is unchanged from before; no table is missing from this list at all (if one is,
`full-reset-table-coverage.test.ts` would already have failed in CI before this ever merged).

**Rollback:** restore the Neon backup branch from step 0 as `main` (Neon console: "Restore
from branch"). Nothing else in this document has run yet at this point, so there is nothing
else to undo.

## 2. `db:check-hashes`

Proves the reset touched no migration — same schema, same applied history.

```powershell
pnpm --filter @opika/db db:check-hashes
```

**Verification:** every migration reports `match`. (Its own command is read-only against
`drizzle.__drizzle_migrations`, which the reset never touches — see `check-migration-hashes.ts`'s
own doc comment.)

**Rollback:** a mismatch here means something touched the migrations table outside this
document, which the reset itself cannot cause. Stop and investigate before continuing; do not
proceed to step 3 with a mismatch unexplained.

## 3. Bootstrap the operator account

```powershell
pnpm --filter @opika/db admin:bootstrap oleksii@example.org --prod
```

(Use your real address. `--name=` is optional, defaulting to the address itself.) This prompts
for confirmation before writing. It refuses if an operator already exists — after a full
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
never deletes the row — RG-T9). A fresh `admin:bootstrap` cannot run again afterward (it is
one-time by a fixed grant id, not by "no active operator"); recovery from a mistaken bootstrap
is `admin:grant` on the same address, not a second bootstrap.

**Signing in:** go to `/kabinet/vkhid`, request a magic link to your address (the operator
has no password — Better Auth's magic-link plugin, not the shelter-admin password flow), and
follow the emailed link.

## 4. The UI dress rehearsal — invite yourself as a shelter

**As the operator**, on `/kabinet/prytulky/novyi`, create a shelter with your own details (a
clearly-test-shaped name is fine — this shelter is removed in step 6, before any real one is
onboarded). Invite yourself as its admin with an address you control.

Then, **as that shelter admin** (a separate browser session or private window — the operator
and the shelter admin are different accounts):

1. Open the invite email, follow the link, set a password («Створіть пароль»).
2. Sign out, sign back in with the password.
3. In the kabinet, create at least one animal card with a photo, publish it.
4. As an adopter (no sign-in needed), walk: the gallery → the card → its overlay → the deck
   (`/tvaryny/gortaty`) → save it (the saved page, `/zberezheni`) → the shelter's own page →
   reveal the shelter's contact → the donation link, if you set one (destination domain
   visible before the tap).
5. Back as the shelter admin: request a password reset («Забули пароль?»), confirm the email
   arrives and the new password works.

**Verification:** each step above IS its own verification — this is a human walkthrough, not
a scripted check. The point is confirming the real kabinet, real email delivery (Resend/Brevo,
whichever is live), and the real adopter-facing surfaces all work end to end against production,
immediately after a reset that touched every one of their tables.

**Rollback:** none needed mid-rehearsal — nothing here is a one-way action. If something is
wrong, fix it, redeploy, and repeat from wherever it broke. The whole shelter is removed in
step 6 regardless of how the rehearsal went.

## 5. Remove the test shelter

**The existing path** (`docs/onboarding-a-shelter.md`'s "Retiring the rehearsal shelter" —
that section's own hardcoded shelter id, `c00c73ac-…`, no longer exists after step 1's reset;
use your new test shelter's id instead):

1. On `/kabinet/prytulky`, open the test shelter; remove every admin and every invitation
   under «Адміністратори», then «Призупинити…» with a reason.
2. Check for support sessions on it (if you ever entered support mode on it, `demo:remove`
   refuses — the dry run below prints the count).
3. Dry run, then commit:

```powershell
$env:DATABASE_URL = Read-Secret "Production DIRECT connection string"
pnpm --filter @opika/db demo:remove --expect ep-dawn-pond-b1dz515g --prod --shelter <test-shelter-id>
pnpm --filter @opika/db demo:remove --expect ep-dawn-pond-b1dz515g --prod --shelter <test-shelter-id> --commit
Remove-Item Env:DATABASE_URL
```

**Verification:** the dry run names the shelter and prints the R2 photo keys of its animals
(add those to the Cloudflare takedown list — nothing here deletes R2 objects, same as every
other use of `demo:remove`). Re-run the dry run afterward: it refuses with "no shelter has id
…", confirming it's gone. In the **Neon SQL Editor**:

```sql
SELECT count(*) FROM shelters;
```

Expected: 0 (no real shelter onboarded yet, step 1's reset having removed everything, and this
step having just removed the one shelter the rehearsal created).

**Rollback:** none — this step only removes a shelter that exists purely for the rehearsal
just completed, with nothing downstream depending on it yet.

## 6. Onboard the real shelters

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

**Rollback:** `onboard:shelter` only inserts; a mistaken onboard is removed the same way the
test shelter was in step 5 (`demo:remove --shelter <id> --prod --commit`), before any animal
on it has been shown to an adopter (S8-F5's `everServedAt` names exactly this: if nothing has
served it yet, nothing is lost by removing it).

## 7. Flip `REGISTRY_HAS_NO_REAL_SHELTERS`

A one-line code change: `apps/web/src/seo-flags.ts`, `REGISTRY_HAS_NO_REAL_SHELTERS = true`
→ `false`. Commit, push, let the deploy land. This is independent of step 8 below — real
shelters existing is not the same fact as the site being publicly discoverable
(`docs/standing-constraints.md`'s "two facts that happen to be true at the same time are not
one fact"; `seo-flags.ts`'s own doc comment on this constant has the full reasoning).

**Verification:** `seo-flags.test.ts`'s own assertions pass in CI before this merges. After
deploy, the gallery's demo banner and the deck's demo label are gone, and a card's "·
перевірений" suffix appears for a verified real shelter — all driven by this one flag
(`verificationSuffix`, `seo-flags.ts`).

**Rollback:** flip it back to `true`, commit, redeploy. Reversible at any point before step 8,
since nothing downstream depends on it alone.

## 8. Remove the gate, flip `SITE_IS_PUBLICLY_DISCOVERABLE`, land R4-2 — one commit

Three changes, one commit, because `assertAnalyticsCopyMatchesGateState` (`seo-flags.ts`)
throws at boot if they land out of step with each other:

1. `apps/web/src/seo-flags.ts`: `SITE_IS_PUBLICLY_DISCOVERABLE = false` → `true`. This alone
   removes the pre-launch gate too — `proxy.ts`'s gate only runs
   `if (!SITE_IS_PUBLICLY_DISCOVERABLE)`, so flipping this constant is the gate's removal, not
   a separate edit (deleting the dead branch in `proxy.ts` is optional cleanup, not required
   for correctness).
2. `apps/web/src/api/env.ts`: drop `PRELAUNCH_GATE_SECRET` from `RequiredProductionEnvSchema`
   — nothing reads it anymore once the gate's branch is unreachable.
3. `packages/i18n/src/messages/uk.ts`: append `PENDING_R4_2_ANALYTICS_SENTENCE` to
   `uk.about.analytics` (`+ " " + PENDING_R4_2_ANALYTICS_SENTENCE`, not retyped — the constant
   is Oleksii's own already-written Ukrainian, held since 2026-10-06).

Commit, push, let the deploy land.

**Verification:** `instrumentation.ts`'s `assertDemoDiscoverabilityInvariant` and
`assertAnalyticsCopyMatchesGateState` both run at boot and would crash the deploy if these
three are out of sync with each other — a failed deploy here is the check working, not a
surprise. After a successful deploy, from a machine with no gate cookie and no `?gate=`
parameter:

```powershell
Invoke-WebRequest -Uri "https://opika.org.ua/tvaryny" -UseBasicParsing | Select-Object StatusCode, Headers
```

Expected: `200`, no `X-Robots-Tag` header (or a value that isn't `noindex`). View page source:
no `<meta name="robots" content="noindex...">`. `/pro`'s analytics paragraph includes R4-2's
"одне кукі" sentence.

**Rollback:** revert the commit, redeploy. All three changes are plain code/copy; nothing
here is a data migration.

## 9. Allow indexing

Nothing left to *do* — step 8 already made the site crawlable and indexable. This step is
confirming it, a day or two after step 8's deploy:

- Google Search Console (if not already verified for `opika.org.ua`, verify it now) — submit
  the root URL for indexing, or just wait for the next crawl.
- Spot-check `https://opika.org.ua/robots.txt` allows `/` (it always has, D-3) and a real page
  no longer carries `noindex` (same check as step 8's verification).

**Rollback:** n/a — there is nothing to roll back; "allow indexing" is an observation that
step 8 worked, not an action with its own state.

---

## D-5/D-7, closed by this document

**D-5**'s concern (a demo contact ever indexed) is now closed **by construction**, not by
timing: with a full reset before even the dress-rehearsal shelter exists, no demo-shaped data
is ever in the database at any point this document describes, so there is nothing demo-shaped
to index regardless of how the steps above are sequenced relative to each other.

**D-7** (write the demo-to-real transition into `docs/standing-constraints.md` and the
onboarding checklist) is this document. The two-constants distinction it was supposed to
record (`REGISTRY_HAS_NO_REAL_SHELTERS` vs `SITE_IS_PUBLICLY_DISCOVERABLE`, steps 7–8 above)
is unchanged by the move to a full reset — that window (a real shelter live, not yet
publicly discoverable) still exists and is still deliberate, for the same reason it always
was: a shelter's first real listing needs to be checkable (the `?gate=` preview link, step
4's rehearsal having already proven the mechanism works) before the whole site is meant to be
found.

`docs/launch-gate.md`'s rows for D-7, the wipe-and-flip script/runbook, and the
discoverability-flip runbook all point here now.
