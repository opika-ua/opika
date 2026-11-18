# PRELAUNCH reset runbook (used twice: reset 1 and reset 2)

Read at repo HEAD `7b476e1d4491ccf84cb784057c123ee5c6a20e1c` (origin/main, 2026-11-04). Replaces the
version written on the stale checkout `03a2b70`. Paths below are relative to the repo root.

Phase 0 document. Every command is the OWNER's, in Windows PowerShell 5.1. Nothing here may be run by an
agent. Never print, paste or log a connection string; `ep-XXXX` below is a placeholder for production's Neon
endpoint id (`ep-...`, an id, never a URL), typed by hand. Source runbook: `docs/launch-sequence.md` (this
file restates its steps 2-4 and 6 for the two-cycle plan and adds the checks the owner asked for).
Anything not documented or not verifiable from the repo says NOT DOCUMENTED / UNVERIFIED.

Run N = 1 or 2. Restore branch name: `pre-reset-1` for run 1, `pre-reset-2` for run 2.

Rehearse the script on a Neon CHILD branch BEFORE reset 1: see `child-sitting.md`.

## 0. Before you start

1. Stop traffic that writes: no open kabinet tabs doing edits, no rehearsal in progress.
2. Do NOT run any migration, deploy-with-migration or `onboard:shelter` between creating the restore branch and
   the reset (a restore would roll the schema back too).
3. **Migration 0022 (drop `swipes`) must already be on production before reset 1.** `swipes` has foreign keys
   into `adopters` and `animals` (`packages/db/drizzle/0000*.sql:93-94`) and is no longer in the reset list
   (`packages/db/src/full-reset.ts:63-87`). The reset is one `TRUNCATE` with no `CASCADE`
   (`full-reset.ts:150-162`), so while `swipes` exists the statement fails with a foreign-key error and
   changes nothing. The DRY RUN would not warn you (it only counts the listed tables). Check first:
   `db:check-hashes` against production prints `match` for all 23 migrations `0000`..`0022`
   (`packages/db/drizzle/` holds 23 `.sql` files; the last is `0022_drop_swipes.sql`). Whether 0022 has been
   applied to production: NOT DOCUMENTED (no doc records it; `docs/launch-gate.md` and `docs/dev-notes.md` do
   not mention it; 0021 is recorded as applied in commit `2c9b2eb`). If it is missing, apply it first as its
   own migration step with the restore branch taken AFTER it, not before.
4. In your shell, paste the helper once (`docs/onboarding-a-shelter.md:13`):
   ```powershell
   function Read-Secret($p){ $s = Read-Host $p -AsSecureString; [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)) }
   ```
5. From the main checkout, up to date, Node 24 (`docs/launch-sequence.md:38-43`):
   ```powershell
   nvm use 24
   cd D:\Startup\opika
   git switch main
   git pull
   pnpm i --frozen-lockfile --prefer-offline
   ```
6. **Note only (not documented):** after a Neon restore the production compute's endpoint id MAY change. If it
   does, `--expect ep-XXXX` and `PROD_NEON_ENDPOINT` no longer match the target, and the script refuses
   before doing anything ("the target's Neon endpoint is not --expect", `packages/db/src/prod-guard.ts:356-376`;
   `full-reset.ts:179-185`). That is the guard working (fails closed). Read the endpoint id again in the Neon
   console after any restore and retype it. Vercel's connection string would need the same update. Whether
   the id changes: NOT DOCUMENTED / UNVERIFIED in the repo.

## 1. Neon restore branch (owner, Neon console)

Create a branch of production from the current head, named `pre-reset-N` (`docs/launch-sequence.md:73-82`).
This branch is the only undo for the reset. Keep `pre-reset-1` until run 2 is verified; keep `pre-reset-2`
until launch is stable. The Free plan keeps 6 h of history (`docs/launch-gate.md:37`), but a branch is a full
copy and does not depend on that window, so the rehearsal can stay on Free.

## 2. Dry run (read-only)

```powershell
$env:PROD_NEON_ENDPOINT = "ep-XXXX"
$env:DATABASE_URL = Read-Secret "Production DIRECT connection string"
pnpm --filter @opika/db db:full-reset --expect ep-XXXX --prod
```

Script `db:full-reset`: `packages/db/package.json:33`. Flags `--expect`, `--commit`, `--prod`:
`full-reset.ts:52-54, 179-187`. `--expect` must be typed, never derived from the URL. Without `--prod`
against production it refuses; without `--expect`, or naming a different compute, it refuses before doing
anything (`full-reset.ts:179-185`, `prod-guard.ts:356-376`, `prod-guard.ts:507-523`).

Expected output, in order (stderr line first, `prod-guard.ts:515-518` with access "read"; target line
`prod-guard.ts:380-384`):

```
WARNING: reading PRODUCTION (--prod given).
Target: Neon endpoint ep-XXXX (<host>)
DRY RUN (nothing is deleted)
Rows now:
  support_sessions        <n>
  invitation_created_users<n>
  shelter_history         <n>
  super_admins            <n>
  auth_invitation         <n>
  auth_member             <n>
  auth_session            <n>
  auth_account            <n>
  auth_verification       <n>
  auth_organization       <n>
  auth_user               <n>
  sessions                <n>
  reveals                 <n>
  animals                 <n>
  adopters                <n>
  shelters                <n>
  r2_unreferenced_objects <n>
Kept (never touched by this script): cities, regions, city_slug_aliases

Dry run only. Re-run with --commit to truncate every table above.
```

Table list: `FULL_RESET_TABLES`, `full-reset.ts:63-87` (17 tables; there is NO `swipes` line, the table was dropped
by migration 0022, `packages/db/drizzle/0022_drop_swipes.sql`, commit `a24d16e`). Label padded to 24
characters (`full-reset.ts:165`), so `invitation_created_users` (exactly 24) runs straight into its count.
Kept list `full-reset.ts:95-114`, printed `:193-195`; last line `:198`. A dry run exits 0.
**STOP if the `Target:` endpoint is not production's, or the counts look wrong, or a `swipes` line appears
(old checkout).**

## 3. Commit (irreversible except by restore from `pre-reset-N`)

```powershell
pnpm --filter @opika/db db:full-reset --expect ep-XXXX --prod --commit
```

Expected: `WARNING: writing to PRODUCTION (--prod given).`, the same `Target:` line, `COMMIT`, the `Rows now:`
block, the `Kept` line, then (`full-reset.ts:200-216`):

```

Rows after TRUNCATE (expected: every one 0):
  support_sessions        0
  ... (all 17 tables, each 0)

Done. Every application data table is empty; cities and the schema are untouched.
```

Exit code 0. If any count is not 0 it prints `ERROR: at least one table is not 0 after TRUNCATE. Investigate
before continuing.` and exits 1 (`:208-212`). It is ONE statement, `TRUNCATE "a", "b", ...`, no `CASCADE`
(`:150-162`), so it either empties the whole list or fails with an FK error and changes nothing.

Then, still in the same shell (the `Target:` line proves it is production):

```powershell
pnpm --filter @opika/db db:check-hashes
Remove-Item Env:DATABASE_URL
Remove-Item Env:PROD_NEON_ENDPOINT
```

`db:check-hashes` is read-only and takes no `--prod` (`packages/db/src/check-migration-hashes.ts:98-114`;
`docs/launch-sequence.md:130-139`). Expected: first line `Target: Neon endpoint ep-XXXX (...)`, then `match`
for every migration (23), exit 0.

## 4. What is deleted and what is kept

**Deleted** (all rows, in the database only): `support_sessions`, `invitation_created_users`, `shelter_history`,
`super_admins`, `auth_invitation`, `auth_member`, `auth_session`, `auth_account`, `auth_verification`,
`auth_organization`, `auth_user`, `sessions` (adopter device sessions), `reveals`, `animals`, `adopters`,
`shelters`, `r2_unreferenced_objects` (`full-reset.ts:63-87`). This overrides the standing "never delete"
rules for `super_admins` and `support_sessions` by owner decision (`full-reset.ts:44-48`).

**Kept**: the schema; drizzle's migrations table `drizzle.__drizzle_migrations` (not in the list);
`cities`, `regions`, `city_slug_aliases` (`full-reset.ts:95-114`).

**Not touched at all** (the script only talks to Postgres): R2 objects, the Cloudflare cache, Upstash keys,
Resend, Vercel env, Sentry.

Side effects you will see: everyone is signed out (all sessions gone, including yours); any open adopter browser
has a dead device session and will mint a new one (counts against the 50-per-IP-per-day mint budget,
`apps/web/src/api/per-ip-budgets.ts:30`); invitation links already emailed stop working.

No server cache sits in front of the data: no `cacheLife`/`unstable_cache`/`use cache`/`revalidate` under
`apps/web/src` at HEAD (grep of the read-only worktree, 2026-11-04). The photo CDN is the exception, see (b).

## 5. Answers to the explicit questions

### (a) Does the operator account survive? No.

`super_admins` and `auth_user` are both in `FULL_RESET_TABLES` (`full-reset.ts:67, 74`). Recreate it with the
documented no-password path (`docs/launch-sequence.md:142-171`, `packages/db/src/admin.ts`):

```powershell
$env:PROD_NEON_ENDPOINT = "ep-XXXX"
$env:DATABASE_URL = Read-Secret "Production DIRECT connection string"
pnpm --filter @opika/db admin:bootstrap owner@example.org --prod
Remove-Item Env:DATABASE_URL
Remove-Item Env:PROD_NEON_ENDPOINT
```

**`admin:bootstrap` takes no `--expect`. Do not pass one.** Its usage line is
`admin:bootstrap <email> [--name=<name>] [--prod]` (`packages/db/src/admin.ts:35`); `main()` reads only the
command, its args and `DATABASE_URL`, and runs the prod guard on `--prod` (`admin.ts:161-176`). The target
protection here is the guard (production needs `--prod`) plus the `Target:` line it prints, which you check by
eye. (`docs/launch-sequence.md:58` shows `--expect` on `admin:bootstrap` for the child branch; the script
ignores it. Doc bug.)

It prints the target, asks `Create the user <address> and make them the first operator? Type "yes" to
continue:` (`admin.ts:67, 183-184`), then `Done: the user exists and is an operator. Sign in with this address.`
(`:88`). It refuses if an operator exists (`:62-65`) or bootstrap has already run (`:83`); both are impossible
right after a reset because `super_admins` is empty. `--name=<name>` optional (`:66`). Then sign in at
`/kabinet/vkhid`: the page sends a magic link (TTL `MAGIC_LINK_TTL_SECONDS`, `apps/web/src/kabinet/magic-link-sender.ts`,
re-exported `auth.ts:31`; 5 per address and 20 per IP per hour, `apps/web/src/kabinet/sign-in-limit.ts:10-11`),
and the owner clicks it himself. The operator never has a password. Verify in the Neon SQL Editor (production)
(`docs/launch-sequence.md:155-161`):

```sql
SELECT u.email, sa.granted_at, sa.revoked_at
FROM super_admins sa JOIN auth_user u ON u.id = sa.user_id
WHERE sa.revoked_at IS NULL;
```

Expected: exactly one row, your address, `revoked_at` null. The operator and a shelter admin must be different
addresses (`admin.ts:101`).

### (b) R2 objects of deleted animals and logos

The reset does NOT delete anything in R2. The only code that deletes R2 objects is the clean-up job
(`docs/onboarding-a-shelter.md:554-568`; `CLAUDE.md` hard rule "Nothing deletes R2 objects except the photo clean-up job").

- What it can delete: keys under `animals/` and logo-shaped keys under `shelters/<id>/logo/` only
  (`packages/db/src/image-pipeline/variants.ts:65-78`; the scan prefixes are `CLEANUP_PREFIXES` in
  `r2-cleanup-run.ts`, printed in its report line `:147`). Anything else in the bucket (for example `_probe/`)
  is never touched.
- A photo is stored as five WebP files under one key: `animals/<animalId>/<uuid>/{thumb,card,compact,mid,detail}.webp`
  (`variants.ts:19-35, 153-158`). A key is "referenced" if any `animals.photos[].storageKey` or
  `shelters.logo.storageKey` names it (`packages/db/src/r2-cleanup-repo.ts`). After a reset nothing is
  referenced, so every photo and logo is an orphan.
- Orphans are tracked in `r2_unreferenced_objects`, which the reset EMPTIES (`full-reset.ts:86`). The first scan
  after the reset re-records every orphan with "first seen" = that scan's time.
- **Scheduled cron:** `/api/cron/r2-cleanup`, daily `0 4 * * *` (UTC, Vercel) (`apps/web/vercel.json:7`), default
  grace 7 days (`packages/domain/src/animals/photo.ts:67`). An object is deletable when
  `now - firstSeen >= 7 days` (`photo.ts:77-84`). So the first scan after the reset (up to 24 h later) starts
  the clock and deletion happens on the run about 7 to 8 days after that. It runs only if the R2 clean-up
  variables are set on Vercel (`apps/web/src/kabinet/r2-cleanup-env.ts:15-20`); otherwise the log line is
  `{"event":"r2_cleanup","outcome":"off"}` and nothing is deleted (`r2-cleanup-cron.ts:55-57`).
- **Immediate removal (owner), only after you have decided you will NOT restore from `pre-reset-N`**, because
  restored rows would point at deleted files (`docs/launch-sequence.md:194-238`):
  ```powershell
  $env:PROD_NEON_ENDPOINT = "ep-XXXX"
  $env:DATABASE_URL = Read-Secret "Production DIRECT connection string"
  $env:R2_ACCOUNT_ID = Read-Secret "R2_ACCOUNT_ID"
  $env:R2_BUCKET_NAME = Read-Secret "R2_BUCKET_NAME"
  $env:R2_CLEANUP_ACCESS_KEY_ID = Read-Secret "R2_CLEANUP_ACCESS_KEY_ID"
  $env:R2_CLEANUP_SECRET_ACCESS_KEY = Read-Secret "R2_CLEANUP_SECRET_ACCESS_KEY"
  pnpm --filter @opika/db r2:cleanup --expect ep-XXXX --prod
  pnpm --filter @opika/db r2:cleanup --expect ep-XXXX --prod --grace-days 0 --commit
  Remove-Item Env:DATABASE_URL, Env:PROD_NEON_ENDPOINT, Env:R2_ACCOUNT_ID, Env:R2_BUCKET_NAME, Env:R2_CLEANUP_ACCESS_KEY_ID, Env:R2_CLEANUP_SECRET_ACCESS_KEY
  ```
  `--grace-days` is refused without `--commit` (`packages/db/src/r2-cleanup.ts:23-25, 76-82`), `--expect` is
  mandatory, and all four R2 variables are required (`r2-cleanup.ts:162-176`).
  `docs/launch-sequence.md:204-206` omits `R2_ACCOUNT_ID` and `R2_BUCKET_NAME` in its block but the script needs
  them. With `--grace-days 0` the run scans, tracks and deletes in one go, re-checking each 1000-key batch
  against the database before deleting (`r2-cleanup-run.ts:71-80, 122`). Do NOT run it while anyone is uploading a
  photo: an object uploaded but not yet attached looks like an orphan. Output: it prints every deleted key,
  `Deleted: <n>`, `Reveal snapshots nulled: <n>` (`formatReport`, `r2-cleanup-run.ts:141-160`). Review the key list
  before trusting the count.
- **Then purge the Cloudflare cache (owner, after the sweep):** Cloudflare dashboard, Caching, Purge Everything
  (exact menu wording NOT DOCUMENTED; the free plan has it, harmless before launch because nothing real is
  cached). Why: the clean-up deletes objects without purging the CDN (`docs/onboarding-a-shelter.md:538-547`),
  `s-maxage=14400` (`IMAGE_CACHE_CONTROL`, `packages/db/src/image-pipeline/r2-client.ts:29`) bounds how long an
  edge copy may live to 4 h, and objects uploaded before #404 (commit `c40078e`, merged 2026-11-03) carry no
  such header and may live longer. The Cache Rule on host `img.opika.org.ua` is documented at
  `docs/onboarding-a-shelter.md:538-553`. Purge AFTER the sweep, not before, or the edge refills nothing but
  the sweep still has work to do; either order is harmless, this one ends clean.
- **How long until none are left:** with the cron alone, about 7 to 8 days after the first post-reset scan; with
  the manual run, immediately, then the purge removes the edge copies.
- **Counting objects. There is no `r2:count` script (and none is proposed here).** Use two things:
  1. The Cloudflare R2 dashboard: the bucket, Objects, open the prefix `animals/` and `shelters/` and read the
     object count (`docs/onboarding-a-shelter.md:569-576` describes the prefix layout; the dashboard's count
     display is NOT DOCUMENTED).
  2. The `r2:cleanup` dry run above (no `--commit`, no `--grace-days`). Header `DRY RUN (scanned and recorded;
     nothing deleted)` (`r2-cleanup.ts:188`); report lines `Bucket objects scanned (...): <n>`,
     `Newly tracked as unreferenced: <n>`, `Referenced again, untracked: <n>`,
     `Past the grace period (Would delete): <n>` (`r2-cleanup-run.ts:145-150`). It deletes nothing in R2 but it
     DOES write bookkeeping rows to `r2_unreferenced_objects` (`r2-cleanup-run.ts:71-76, 100`, "Always scans and
     records"), so it is a harmless production write: owner-run, with `--prod --expect`. Right after a reset,
     `scanned` equals `Newly tracked`; after the `--grace-days 0` sweep, `scanned` is 0.
  The dashboard count is in objects (five per photo), not photos.

### (c) Migrations and hashes: untouched

`drizzle.__drizzle_migrations` is not in `FULL_RESET_TABLES`; the script comment says "`db:check-hashes` matches,
unchanged, before and after a reset" (`full-reset.ts:19-22`; `docs/launch-sequence.md:87-89, 126-139`). Proof is
`db:check-hashes` showing `match` for every migration (step 3 above). Caveat: a Neon RESTORE brings back the
schema as of the restore branch, so restoring after a migration was applied would undo it. Hence rule 0.2.

### (d) Upstash keys

The reset does not touch Upstash. Rate-limit keys are namespaced by prefix and hold HMAC outputs of IPs and
addresses, never raw values (`docs/gdpr-analysis.md:78` area):

- `opika-api-ratelimit-<VERCEL_ENV>` (`apps/web/src/api/rate-limit.ts:379`): 100 requests per minute per IP on the
  API and on the gallery, animal and shelter pages.
- `opika-<name>-ratelimit-<VERCEL_ENV>` (`rate-limit.ts:415`) for the named limiters (`kabinet-sign-in-address`,
  `kabinet-sign-in-ip`, `kabinet-user`, `kabinet-ip`, `kabinet-photo-hour`, `kabinet-photo-day`,
  `kabinet-forgot-*`, `kabinet-reset-ip`, `kabinet-invite-ip`, `adopter-mint`, `reveal-ip`, `reveal-adopter`;
  names in `docs/launch-sequence.md:403-415`).
- `opika-kabinet-sign-in-delay-<VERCEL_ENV>` (`rate-limit.ts:436`): the increasing wait after failed password
  sign-ins.

(`rate-limit.ts:379` and `:415` were re-read at this HEAD; `:436` was carried over from the earlier version and not
re-read: UNVERIFIED.) Recommendation: nothing needs clearing for correctness. Windows are at most 24 h; whether Upstash
expires the keys on its own is a property of `@upstash/ratelimit` and is UNVERIFIED in this repo. Clear (owner,
Upstash console, delete keys matching `opika-*-ratelimit-production*` and `opika-kabinet-sign-in-delay-production*`)
only if a rehearsal step deliberately drove a limiter to refusal and you want a clean slate, or if the launch
visitors share the owner's IP. Never use FLUSHALL if the database also holds other data (Better Auth sessions are
in Postgres, not Redis). The `Preview` environment uses a different suffix and is unaffected. Whether the
production Upstash database holds anything besides these prefixes: NOT DOCUMENTED.

## 6. Verification checklist after the reset

- [ ] Commit run printed all 17 tables at 0 and `Done. ...` (exit 0).
- [ ] `db:check-hashes`: `Target:` is production; every migration `match` (23).
- [ ] Neon SQL Editor counts (read-only; `docs/launch-sequence.md:108-113`): every table in `FULL_RESET_TABLES` is 0;
      `cities` unchanged from before; no table in `public` is missing from the list (and `swipes` does not exist:
      `SELECT to_regclass('public.swipes');` returns null).
- [ ] `admin:bootstrap` done (no `--expect`); the SQL above returns exactly one operator row.
- [ ] Owner signs in at `/kabinet/vkhid` by magic link; `/kabinet` answers 404 for the operator outside support
      mode (expected, `docs/onboarding-a-shelter.md:731-736`); `/kabinet/prytulky` lists no shelters.
- [ ] Adopter pages (open with the gate link, never pasted anywhere): the gallery `/tvaryny` shows the empty
      state, no animal; `/tvaryny/gortaty` answers a 308 redirect to `/tvaryny` (`apps/web/next.config.ts:58-66`);
      `/prytulky/<old id>` and `/tvaryny/<old id>` answer 404. There is no deck page to check.
- [ ] `GET /api/health` answers 200 `{"sha":"..."}` (`docs/dev-notes.md:243`).
- [ ] Vercel Logs: no `error` spike; Sentry: no new issue.
- [ ] R2: object count noted (dashboard) and the `r2:cleanup` dry run printed. After run 2 and the `--grace-days 0`
      sweep: zero objects under `animals/` and logo keys under `shelters/`.
- [ ] After the sweep: Cloudflare Purge Everything done.
- [ ] Old restore branch kept; new one named correctly.

## 7. Rollback (owner)

Source: `docs/launch-sequence.md:122-124, 258`. In the Neon console choose "Restore" on the production branch
from `pre-reset-N` (exact UI wording NOT DOCUMENTED; Neon creates its own backup of the replaced state, UNVERIFIED
here). After it: re-read the production endpoint id (see 0.6), run `db:check-hashes` (expect `match` for the
migrations that existed at the branch point), and expect that everyone is signed in as of the branch point only if
their sessions were inside it. R2: if a `--grace-days 0` sweep already ran, restored rows may point at deleted
files; this is why the sweep waits (section 5b). Upstash is unaffected by a restore.

## 8. Differences from `docs/launch-sequence.md` worth knowing

- The R2 block there (`:204-206`) omits `R2_ACCOUNT_ID` and `R2_BUCKET_NAME`, which the script requires
  (`packages/db/src/r2-cleanup.ts:162-176`).
- Its child-branch block passes `--expect` to `admin:bootstrap` (`:58`); `admin.ts` reads `--prod` and `--name=`
  only (`admin.ts:35`).
- Its verification text (`:115-120`) and `docs/launch-gate.md:32, 44, 75` predate migration 0022 and the end of
  the deck; neither mentions `swipes` being gone, nor that PG-F3 (`launch-gate.md:28`) is merged.
- The owner's plan runs the production rehearsal BEFORE the next production reset; the docs also ask for a
  one-time child-branch rehearsal first (`:29-35`), which now has its own sitting file.
