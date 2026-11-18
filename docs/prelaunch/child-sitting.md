# PRELAUNCH child-branch sitting: rehearse `db:full-reset` before reset 1

Read at repo HEAD `7b476e1d4491ccf84cb784057c123ee5c6a20e1c` (origin/main, 2026-11-04). Owner's request:
rehearse `db:full-reset` on a fresh Neon CHILD branch before reset 1. This is the one-time rehearsal that
`docs/launch-sequence.md:29-69` already asks for. Nothing in this file was run. Every command is the owner's.

## 1. Can the generator render this sitting? No.

`CLAUDE.md` rule 8 says sittings are generated only with `pnpm --filter @opika/db smoke-sitting`
(`packages/db/src/tools/smoke-sitting.ts`; script `packages/db/package.json:48`). I read the generator in full
at this HEAD. It has two renderers, `renderSmokeSitting` (`smoke-sitting.ts:225`) and
`renderProductionImportSitting` (`:378`), picked from a JSON document on stdin (`:409-418`; reads stdin and
writes stdout only, it opens no connection). Their fixed template always runs `db:neon-smoke --expect $child`
(`:200`); the optional parts are only a migration (`db:migrate` + `db:check-hashes`, `:92-109`), the
settlement import (`:112-135`), the timings probe (`:138-145`) and the production import (`:274-375`).
There is no variant that runs `db:full-reset`, no `admin:bootstrap`, and no way to swap out the `db:neon-smoke`
line. Free-text fields cannot add commands without being a hand edit. So the generator CANNOT render a
full-reset sitting, and I did not run it.

**The block in section 2 is therefore NOT generator output.** It is hand-written by me, copying the generator's
guard (`smoke-sitting.ts:177-206`) line for line so the safety shape is the same. Treat it as a proposal until the
generator change in section 5 lands. If you want a strict reading of rule 8, do not run section 2; wait for
that change.

## 2. Proposed sitting block (NOT generator output)

PowerShell 5.1. `ep-...` ids are not secrets and are typed visibly; the connection string is read without echo
and never printed. The block never contains `--prod`. `admin:bootstrap` gets no `--expect` (it takes none,
`packages/db/src/admin.ts:35`); its protection is the guard below plus the `Target:` line it prints.

### 2a. Setup (paste once)

```powershell
nvm use 24
cd D:\Startup\opika
git fetch
git worktree add --detach D:\opika-worktrees\full-reset-rehearsal 7b476e1d4491ccf84cb784057c123ee5c6a20e1c
cd D:\opika-worktrees\full-reset-rehearsal
git log -1 --oneline
pnpm i
function Read-Secret($p){ $s = Read-Host $p -AsSecureString; [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)) }
```

Before pasting: confirm with the session that `7b476e1` is still the head you want (a later origin/main is fine;
substitute its sha). The rehearsal must run the same script that reset 1 will run.

### 2b. Neon console (owner, by hand)

1. Create a NEW branch of production, named for example `reset-rehearsal-2026-11-04`, parent production, current
   data. It is a full copy (so it holds the same test rows and the same schema as production right now).
2. Open that branch's connection details. Note its DIRECT endpoint id (`ep-...`, no `-pooler`) and copy its
   DIRECT connection string. Also have PRODUCTION's endpoint id ready (it is only used so the guard can tell the
   two apart; it is never given to any command except `PROD_NEON_ENDPOINT`).
3. Do NOT use `pre-reset-1`, production's own string, or a pooled string here.

### 2c. The rehearsal (paste as ONE block)

```powershell
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$OutputEncoding = [Text.Encoding]::UTF8
# Endpoint ids are not secrets: typed visibly, separately from the URL, so --expect is never derived from it.
$child = (Read-Host "CHILD branch endpoint id (ep-..., the fresh rehearsal branch)").Trim().ToLower()
$prod = (Read-Host "PRODUCTION endpoint id (ep-...)").Trim().ToLower()
$env:DATABASE_URL = Read-Secret "Child branch DIRECT connection string (never production's own)"
$env:PROD_NEON_ENDPOINT = $prod
try {
  # TryCreate, not a [uri] cast: a cast error would print the whole pasted URL, password included.
  $urlEp = ''
  $u = $null
  $problems = @()
  if ([uri]::TryCreate($env:DATABASE_URL, [UriKind]::Absolute, [ref]$u)) { $urlEp = $u.Host.Split('.')[0] }
  else { $problems += "the pasted URL could not be parsed" }
  if ($child -notmatch '^ep-[a-z0-9-]+$') { $problems += "child id is not an ep-... id" }
  if ($prod -notmatch '^ep-[a-z0-9-]+$') { $problems += "production id is not an ep-... id" }
  if ($child -match '-pooler$') { $problems += "child id is the pooled one: use the direct id and URL" }
  if ($child -eq ($prod -replace '-pooler$','')) { $problems += "child id equals the production id" }
  if ($urlEp -ne $child) { $problems += "the pasted URL's endpoint is not the child id you typed" }
  if ($urlEp -ne '' -and ($urlEp -replace '-pooler$','') -eq ($prod -replace '-pooler$','')) { $problems += "the pasted URL is PRODUCTION" }

  if ($problems.Count -eq 0) {
    # 1. Read-only: which migrations the child has (expect 23 'match', 0000..0022).
    pnpm --filter @opika/db db:check-hashes
    # 2. Dry run: prints the 17 table counts, writes nothing.
    pnpm --filter @opika/db db:full-reset --expect $child
    $dryExit = $LASTEXITCODE
    "dry run exit code: $dryExit (expected 0)"
    # 3. The write: only after the dry run exited 0 and the child id is typed again.
    $typed = Read-Host "Type the CHILD endpoint id again to run --commit on it"
    if (($dryExit -eq 0) -and ($typed.Trim().ToLower() -eq $child)) {
      pnpm --filter @opika/db db:full-reset --expect $child --commit
      "commit exit code: $LASTEXITCODE (expected 0)"
      # 4. Read-only again: the reset must not have touched the migrations.
      pnpm --filter @opika/db db:check-hashes
      # 5. Operator account on the child. No --prod, no --expect. It asks: type yes.
      pnpm --filter @opika/db admin:bootstrap owner+child@example.org --name=Rehearsal
      "bootstrap exit code: $LASTEXITCODE (expected 0)"
    } else {
      Write-Host "STOP: not confirmed (dry run exit code 0 and the typed child id must both be right). NOTHING WAS WRITTEN." -ForegroundColor Red
    }
  } else {
    Write-Host ("STOP, nothing was run: " + ($problems -join "; ")) -ForegroundColor Red
  }
} finally {
  Remove-Item Env:DATABASE_URL
  Remove-Item Env:PROD_NEON_ENDPOINT
}
```

Sources for each command: `db:check-hashes` `packages/db/package.json:30`, read-only, takes no `--prod`
(`check-migration-hashes.ts:98-114`); `db:full-reset` `package.json:33`, `--expect`/`--commit`
(`full-reset.ts:52-53, 179-198`); `admin:bootstrap` `package.json:36`, args `<email> [--name=<name>] [--prod]`
(`admin.ts:35`). With `PROD_NEON_ENDPOINT` set to production and the target a different Neon compute, the guard
allows the run without `--prod` (reason `not_production`, `prod-guard.ts:401-460`); with it unset every non-local
target would be refused (`prod-guard.ts:439-442`), which is why it stays set until the `finally`.
The email `owner+child@example.org` is a placeholder; any address works, nothing is sent (see section 4).

### 2d. Optional guard tests (read-only; each must REFUSE before touching anything)

Run inside the same session, before the block above ends (or repeat the guard lines). The refusals come from
`expectedTargetOf` (`prod-guard.ts:356-376`) in `main()` before any connection (`full-reset.ts:179-185`):

```powershell
# (i) no --expect: expect "REFUSED: pass --expect ep-... (the target's Neon endpoint id). Nothing was run."
pnpm --filter @opika/db db:full-reset
# (ii) the production id typed as --expect while DATABASE_URL is the child:
#      expect "REFUSED: the target's Neon endpoint is not --expect. Nothing was run."
pnpm --filter @opika/db db:full-reset --expect $prod
```

(Both need `DATABASE_URL` and `PROD_NEON_ENDPOINT` still set, so run them before the `finally` block removes
them, or re-set them.) A second `admin:bootstrap` after the first must print
`REFUSED: an operator already exists. Bootstrap runs once; use admin:grant.` (`admin.ts:62-65`) and exit 1.

### 2e. Cleanup (paste after)

```powershell
cd D:\Startup\opika
git worktree remove D:\opika-worktrees\full-reset-rehearsal
```

## 3. What to verify on the child

Output of the block:

- `check-hashes` (first run): first line `Target: Neon endpoint <child id> (...)`, NOT production's id; `match` for all
  23 migrations; no `not run`, `MISMATCH`, `SKIPPED` or `UNKNOWN` line. If a `0022` line is missing or says
  `not run`, production has not had migration 0022 applied either (the child is a copy), and the commit below
  will fail on a foreign key from `swipes` and change nothing: that is the rehearsal finding the sitting exists
  to give you. Paste it back.
- Dry run: `DRY RUN (nothing is deleted)`, `Rows now:` with 17 lines (`support_sessions` through
  `r2_unreferenced_objects`, no `swipes` line), then `Kept (never touched by this script): cities, regions,
  city_slug_aliases`, then `Dry run only. Re-run with --commit to truncate every table above.` No
  `WARNING: reading PRODUCTION` line (that line is printed only with `--prod`, `prod-guard.ts:515-518`). The
  counts should equal production's at the moment you created the branch.
- Commit: `COMMIT`, the `Rows now` block, then `Rows after TRUNCATE (expected: every one 0)` with 17 zeros, then
  `Done. Every application data table is empty; cities and the schema are untouched.`, exit 0
  (`full-reset.ts:200-216`). Any non-zero count prints the `ERROR:` line and exits 1.
- `check-hashes` (second run): identical to the first (23 `match`).
- Bootstrap: `Target:` is the child, `Email: owner+child@example.org`, the question
  `Create the user ... and make them the first operator? Type "yes" to continue:`, then
  `Done: the user exists and is an operator. Sign in with this address.`, exit 0 (`admin.ts:58-88`).

In the Neon SQL Editor, on the CHILD branch (read-only):

```sql
SELECT u.email, sa.granted_at, sa.revoked_at
FROM super_admins sa JOIN auth_user u ON u.id = sa.user_id
WHERE sa.revoked_at IS NULL;
-- expect exactly one row, owner+child@example.org, revoked_at null

SELECT table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text::int AS row_count
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
-- expect: every table is 0 except cities, regions, city_slug_aliases (unchanged), super_admins (1), auth_user (1)
--         (the query is from docs/launch-sequence.md:108-113); and no table named swipes

SELECT to_regclass('public.swipes');
-- expect null
```

Also open the PRODUCTION branch in the console and confirm it still has its data (shelter and animal counts
unchanged): the proof that the rehearsal touched only the child.

**Not testable on the child, on purpose:** signing in by magic link. The deployed site reads production's
database, so a link requested for `owner+child@example.org` would find no such user there and send nothing
(`apps/web/src/kabinet/auth.ts:413-417`: a link is sent only if the address belongs to a user). A local dev
server pointed at the child would need its own mail transport: NOT DOCUMENTED, skipped. The proof that the
operator has no password is the schema (the bootstrap writes a user and a grant, no credential;
`admin.ts:71-76`). Verify the real sign-in in reset 1's own bootstrap.

## 4. Deleting the child branch afterwards (owner)

1. Neon console, Branches. Pick the branch by NAME and check that its endpoint id equals `$child` you typed. It
   must not be `production` (the root branch), nor `pre-reset-1`/`pre-reset-2`.
2. Delete it (Neon console, branch menu, Delete). Its compute endpoint goes with it. Alternative named in the
   repo: `neonctl branches delete` (`docs/launch-sequence.md:68-69`; the neonctl flags are NOT DOCUMENTED here,
   use the console).
3. Confirm the branch list shows only production (and any `pre-reset-N`). Nothing else keeps the child's data.
4. Locally: the worktree removal in 2e, and `Get-ChildItem Env:` shows no `DATABASE_URL` or `PROD_NEON_ENDPOINT`.
5. If the rehearsal found a problem: keep the child until the session has read your pasted output, then delete.

## 5. Generator change needed (for a real rule-8 sitting)

Smallest change in `packages/db/src/tools/smoke-sitting.ts`, plus tests in `packages/db/test/smoke-sitting.test.ts`
(exists):

1. Extract the guard (typed `$child`/`$prod`, TryCreate, the `$problems` checks, `try`/`finally` with env removal)
   out of `assembled` (`:177-206`) into one shared function, so there is a single source for it.
2. Add `renderFullResetSitting(input)` with a small input type (`title`, `date`, `sha`, `worktreeSlug`,
   `rehearsalEmail`, `expectedTableCount`, `migrationCount`), dispatched in `main()` by a `"fullReset" in input`
   check (`:415-417`). It emits the commands of block 2c: `db:check-hashes`, dry run, the typed-again
   confirmation, `--commit`, `db:check-hashes`, `admin:bootstrap` (no `--expect`, no `--prod`).
3. The renderer must refuse `--prod` anywhere in its output, and the phrase the existing renderers refuse
   (`AGAINST_PRODUCTION`, `:76`).
4. Tests: output has `--expect $child` on every `db:full-reset`; no `--prod`; no `--expect` on `admin:bootstrap`;
   the guard lines are byte-identical to the smoke renderer's; a free-text field containing "against
   production" throws.
5. Optionally derive `expectedTableCount` from `FULL_RESET_TABLES.length` (`full-reset.ts:63`) so the Expected
   comments cannot go stale (as the swipes removal made them).

Updating `.claude/skills/opika-smoke/SKILL.md` and `docs/launch-sequence.md:29-69` (which still passes
`--expect` to `admin:bootstrap`, `:58`) belongs in the same PR. Owner's call whether this is worth doing
before reset 1; a hand-checked block that copies the guard may be acceptable once, but that is a rule-8 exception
only the owner can grant.

## 6. Open questions

1. Rule 8 exception: run the proposed block as is, or wait for the generator change?
2. Has migration 0022 been applied to production? NOT DOCUMENTED (decides whether reset 1 can succeed).
3. Does the child's `db:check-hashes` list 23 migrations (it should, a child is a copy of production)?
