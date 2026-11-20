# PRELAUNCH reset 1 + Sitting 1 (rehearsal): paste-ready, for the owner

Read at origin HEAD `7b476e1d4491ccf84cb784057c123ee5c6a20e1c` (2026-11-04), via a read-only detached worktree.
Nothing here was run by the writer. Every command is the OWNER's, Windows PowerShell 5.1. This file contains no
URL, no password, no real address: `ep-XXXX` is a placeholder you type by hand, `<owner-email>` is filled in
later. Anything not provable from source says NOT DOCUMENTED / UNVERIFIED.

Rule for every step: **if the output differs from "expect:", STOP, paste the output back, do not continue.**
Steps marked **IRREVERSIBLE** have no undo except restoring from the Neon branch `pre-reset-1`.

**Reset 2 (after Sitting 2) is the LAST reset ever.** `db:full-reset` has no "a real shelter exists" guard by design
(`packages/db/src/full-reset.ts:41-43`); once a real shelter is onboarded, running it destroys real data.

Basis: the child-branch sitting ran CLEAN on 2026-11-04 (check-hashes 23 match before and after; dry run 17 tables,
exit 0; commit 17 zeros + Done, exit 0; admin:bootstrap Done, exit 0; one operator row; `to_regclass('public.swipes')`
NULL). The command forms below are the ones from that block (`child-sitting.md` section 2c), with the
production flags added: `--prod` on the three commands that take it (`full-reset`, `admin:bootstrap`; `check-hashes`
takes none).

---

## 0. Preconditions (read-only)

### 0.1 Vercel Logs: the r2_cleanup cron (DONE 2026-11-04 by the advisor: ran daily since Oct 27, 0 warnings or errors; Nov 4 scanned 44, deleted 0; Nov 3 deleted 3. Clean-up env set, delete path works)

Vercel, the project, Logs, search `r2_cleanup`, last 48 h. The cron runs daily `0 4 * * *` UTC
(`apps/web/vercel.json:7`). The code logs exactly one of these lines
(`apps/web/src/kabinet/r2-cleanup-cron.ts:49, 56, 60, 71-83`):

| Line | Meaning |
|---|---|
| `{"event":"r2_cleanup","outcome":"ran","scanned":..,"newlyTracked":..,"clearedBack":..,"dueForDeletion":..,"deleted":..,"failed":..,"snapshotsNulled":..}` | Good. Note `failed`: should be 0. |
| `{"event":"r2_cleanup","outcome":"off"}` | The four R2 clean-up variables are missing or incomplete on Vercel (`apps/web/src/kabinet/r2-cleanup-env.ts:15-20`). Nothing is cleaned. Not a reset blocker, but record it. |
| `outcome":"refused_no_secret"` or `"refused_misconfigured"` | `CRON_SECRET` or the R2 credentials are wrong. Record it. |
| no line at all | The cron was not invoked. Record it. |

expect: a line with `outcome":"ran"` (whether it has ever run in production: NOT DOCUMENTED). Any other outcome is
not a reason to stop the reset, but paste it so the advisor knows the photo clean-up state before reset 1.

### 0.2 Shell and repo

```powershell
function Read-Secret($p){ $s = Read-Host $p -AsSecureString; [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)) }
nvm use 24
cd D:\Startup\opika
git switch main
git pull
git log -1 --oneline
pnpm i --frozen-lockfile --prefer-offline
```

expect: `git log` shows the same sha as the one you rehearsed on, or a later origin head you accept (the reset must run
the same `full-reset.ts` you rehearsed). `pnpm i` finishes without error.

### 0.3 check-hashes on PRODUCTION, BEFORE anything (read-only, 23 match)

The production endpoint id is typed visibly (an id, not a secret); the connection string is read without echo and
never printed. `check-hashes` takes no `--prod` and is read-only (`packages/db/src/check-migration-hashes.ts:88-130`).

```powershell
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$OutputEncoding = [Text.Encoding]::UTF8
$prod = (Read-Host "PRODUCTION endpoint id (ep-..., direct, no -pooler)").Trim().ToLower()
$env:PROD_NEON_ENDPOINT = $prod
$env:DATABASE_URL = Read-Secret "Production DIRECT connection string"
pnpm --filter @opika/db db:check-hashes
```

(Leave both variables set for the steps below; step 6 removes them. Never paste the string anywhere. If you open a
new window, repeat this block.)

expect: first line `Target: Neon endpoint ep-XXXX (...)` where ep-XXXX is production's id; then `match     <tag>` for
23 migrations `0000` to `0022` (`packages/db/drizzle/` holds 23 `.sql` files; last `0022_drop_swipes.sql`); no
`not run`, `MISMATCH`, `SKIPPED` or `UNKNOWN` line; exit 0. **STOP if `0022` is `not run`: the reset would fail on
the `swipes` foreign keys and change nothing (`full-reset.ts:148-162`); apply 0022 first as its own step, THEN take
the restore branch.** STOP on any other non-`match` line or a wrong `Target`.

### 0.4 Environment hygiene

expect: `PROD_NEON_ENDPOINT` was typed in 0.3, not printed. Do not run `echo $env:DATABASE_URL` or print either
variable. The scripts refuse if driver settings such as `PGPASSWORD`/`PGHOST`/`PGPORT` are set in the shell
(`prod-guard.ts:411-413`, `check-migration-hashes.ts:95-99`): if you see "ambient settings", remove those variables
and retry.

Also before step 1: no kabinet tab editing, no rehearsal in progress, no migration or `onboard:shelter` between
step 1 and the end of step 5 (a restore would roll the schema back too).

---

## 1. Neon restore branch `pre-reset-1` (owner, Neon console; reversible: this IS the undo)

Neon console, project, Branches, create a branch named `pre-reset-1`, parent production, from the current head
(`docs/launch-sequence.md:73-82`). Free plan is fine: a branch is a full copy and does not depend on the 6 h history
window (`docs/launch-gate.md:37`). Do not copy its connection details anywhere; nothing in this sitting uses them.
Neon's exact button wording: NOT DOCUMENTED.

expect: the Branches list shows `production` and `pre-reset-1`. Production's endpoint id has not changed from the
one you typed in 0.3. STOP if it differs or `pre-reset-1` is missing.

Keep `pre-reset-1` until reset 2 is verified.

---

## 2. Dry run against production (read-only)

Verified in source: without `--commit` the tool only runs `SELECT count(*)` per table and exits 0
(`full-reset.ts:130-142, 191-199`); it writes nothing. It still needs `--prod` and `--expect` for a production
target (`full-reset.ts:179-186`, `prod-guard.ts:507-523`, access "read").

```powershell
$expect = (Read-Host "TYPE production endpoint id for --expect (ep-...)").Trim().ToLower()
$urlEp = ''; $u = $null
if ([uri]::TryCreate($env:DATABASE_URL, [UriKind]::Absolute, [ref]$u)) { $urlEp = $u.Host.Split('.')[0] -replace '-pooler$','' }
if (($expect -ne $prod) -or ($urlEp -ne $expect)) { Write-Host "STOP: typed ids and the URL host disagree. Nothing was run." -ForegroundColor Red }
else {
  pnpm --filter @opika/db db:full-reset --expect $expect --prod
  "dry run exit code: $LASTEXITCODE (expected 0)"
}
```

(A `[uri]::TryCreate`, not a cast, so an error can never print the URL.)

expect, in order (`full-reset.ts:173-199`, `prod-guard.ts:380-384, 515-518`): `WARNING: reading PRODUCTION (--prod
given).`; `Target: Neon endpoint ep-XXXX (<host>)`; `DRY RUN (nothing is deleted)`; `Rows now:` with exactly 17 lines
(`support_sessions`, `invitation_created_users`, `shelter_history`, `super_admins`, `auth_invitation`, `auth_member`,
`auth_session`, `auth_account`, `auth_verification`, `auth_organization`, `auth_user`, `sessions`, `reveals`,
`animals`, `adopters`, `shelters`, `r2_unreferenced_objects`, list at `full-reset.ts:63-87`); `Kept (never touched
by this script): cities, regions, city_slug_aliases`; `Dry run only. Re-run with --commit to truncate every table
above.`; exit code 0. **STOP if `Target:` is not production, a `swipes` line appears, or the counts look wrong.**
Write the counts down (they are the "before" for step 6).

---

## 3. COMMIT (IRREVERSIBLE except by restoring `pre-reset-1`)

What the tool requires, verified (`full-reset.ts:179-186`, `prod-guard.ts:356-376, 401-456`): `--expect ep-...`
(typed, never derived from the URL), `--prod` (the target is production), `--commit`, and `PROD_NEON_ENDPOINT` in the
environment. There is NO typed confirmation prompt inside the tool. The "typed by hand twice" here is therefore the
two typed prompts of the block below (the first in step 0.3 as `$prod`, the second now as `$typed`), plus the
URL-host check, copying the shape of the child block that ran clean. Placeholders only; type the real id yourself.

Do not start unless step 2 exited 0 with the expected output.

```powershell
$typed = (Read-Host "RETYPE production endpoint id to COMMIT the reset (ep-...)").Trim().ToLower()
$urlEp = ''; $u = $null
if ([uri]::TryCreate($env:DATABASE_URL, [UriKind]::Absolute, [ref]$u)) { $urlEp = $u.Host.Split('.')[0] -replace '-pooler$','' }
if (($typed -ne $prod) -or ($urlEp -ne $typed)) { Write-Host "STOP: not confirmed. NOTHING WAS WRITTEN." -ForegroundColor Red }
else {
  pnpm --filter @opika/db db:full-reset --expect $typed --prod --commit
  "commit exit code: $LASTEXITCODE (expected 0)"
}
```

expect (`full-reset.ts:185-216`): `WARNING: writing to PRODUCTION (--prod given).`; the same `Target:` line; `COMMIT`;
the `Rows now:` block (same numbers as step 2); `Kept (...)`; `Rows after TRUNCATE (expected: every one 0):` with 17
lines each `0`; `Done. Every application data table is empty; cities and the schema are untouched.`; exit 0. The
statement is one `TRUNCATE` with no `CASCADE`: it empties all 17 tables or fails with a foreign-key error and changes
nothing. If any count is not 0 it prints `ERROR: at least one table is not 0 after TRUNCATE...` and exits 1. **STOP
on any difference; paste the output.** Side effects: everyone is signed out (including you); emailed invitation links
stop working; nothing in R2, Upstash or Resend is touched.

---

## 4. check-hashes after (read-only)

```powershell
pnpm --filter @opika/db db:check-hashes
```

expect: the same output as 0.3: `Target:` production, 23 `match` (migrations are untouched by the reset,
`full-reset.ts:19-22`), exit 0. STOP on any difference.

---

## 5. Operator account: `admin:bootstrap` (IRREVERSIBLE in effect: bootstrap runs once; undo is `admin:revoke`)

The reset deleted the operator (`super_admins` and `auth_user` are both in the reset list, `full-reset.ts:67, 74`).
`admin:bootstrap` takes NO `--expect` (usage `admin:bootstrap <email> [--name=<name>] [--prod]`,
`packages/db/src/admin.ts:35`); do not pass one. It uses the same shell variables, so the guard and the printed
`Target:` line are the protection. No password is ever set: the operator signs in by magic link only.
(`docs/launch-sequence.md:58` shows `--expect` on this command for the child branch; the script ignores it: doc bug.)

```powershell
pnpm --filter @opika/db admin:bootstrap <owner-email> --prod
"bootstrap exit code: $LASTEXITCODE (expected 0)"
```

(`<owner-email>` is replaced with the real address in the version you will be handed; do not guess it.)

expect (`admin.ts:58-88, 161-188`): `WARNING: writing to PRODUCTION (--prod given).`; `Target:` production;
`Email: <the address, lowercased>`; `Create the user <address> and make them the first operator? Type "yes" to
continue:` (you type `yes`); `Done: the user exists and is an operator. Sign in with this address.`; exit 0. A
`REFUSED:` line means the reset did not empty `super_admins`: STOP.

Then clear the shell, always:

```powershell
Remove-Item Env:DATABASE_URL
Remove-Item Env:PROD_NEON_ENDPOINT
Get-ChildItem Env: | Where-Object { $_.Name -in 'DATABASE_URL','PROD_NEON_ENDPOINT' }
```

expect: the last command prints nothing.

---

## 6. Post-reset verification

### 6.1 Neon SQL Editor, PRODUCTION branch (read-only; the editor session is the owner's)

```sql
-- every application table 0; cities, regions, city_slug_aliases unchanged; super_admins 1; auth_user 1
SELECT table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text::int AS row_count
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- exactly one row: <owner-email>, revoked_at null
SELECT u.email, sa.granted_at, sa.revoked_at
FROM super_admins sa JOIN auth_user u ON u.id = sa.user_id
WHERE sa.revoked_at IS NULL;

-- the swipes table is gone
SELECT to_regclass('public.swipes');
```

expect: query 1: all `public` tables 0 except `cities`, `regions`, `city_slug_aliases` (same counts as before the
reset), `super_admins` 1, `auth_user` 1; no table named `swipes`. Query 2: exactly one row, your operator address,
`revoked_at` null. Query 3: `NULL`. (Queries from `docs/launch-sequence.md:108-113, 155-161`.) STOP on any difference.

### 6.2 Site

Adopter pages need the gate link (`?gate=...`, `apps/web/src/proxy.ts:65-70`); open it yourself, never paste it.

| Check | expect | Source |
|---|---|---|
| `/tvaryny` (via the gate link) | The empty state, no animal card. Exact wording: NOT DOCUMENTED, record it. | `reset-runbook.md` section 6 |
| `/tvaryny/gortaty` | 308 redirect to `/tvaryny` (also `/discovery`). Check with `curl.exe -sI "<site>/tvaryny/gortaty"`: status 308, `location: /tvaryny`. A gate may answer first on a bare URL: if so, use the gate link and record what you see. | `apps/web/next.config.ts:58-66` |
| `/api/health` | 200 `{"sha":"..."}` (gate-exempt) | `docs/dev-notes.md:243`, `proxy.ts:135-160` |
| Vercel Logs / Sentry | no `error` spike, no new Sentry issue | |

### 6.3 Flags untouched

`REGISTRY_HAS_NO_REAL_SHELTERS` (`apps/web/src/seo-flags.ts:57`) and `SITE_IS_PUBLICLY_DISCOVERABLE`
(`seo-flags.ts:91`) stay as they are. Do not flip either. expect: no PR or edit touches `seo-flags.ts` during the
sitting.

---

## 7. Sitting 1: the rehearsal, in order

Source: `rehearsal-matrix.md` (Sitting 1 = reset 1 and bootstrap, sections 1 to 7; 9.1, 9.2 and 9.4 were not done).
Section 8, 9.5 to 9.7 and 10 are Sitting 2. Resend is on Pro (owner's figures, NOT in the repo): no daily limit;
the `hello@` relay shares it. The day totals below are a rough tally, not a quota.

**Who.** OWNER = you sign in, create accounts, set passwords, click links, read mail. ADVISOR = drives the forms in
YOUR already-signed-in browser (never signs in, never sees a password or link). Mark: **[O]** owner only, **[A]**
advisor drives, **[O+A]** you do the sign-in or mail part, the advisor the form.

**Fake data only.** Shelters «Тест Притулок 1», «Тест Притулок 2», «Тест Притулок 3» (S1, S2, S3). Phone
`+380 10 000 00 01` (the matrix's valid fake; the form accepting it is UNVERIFIED). Shelter admins
`<owner-email>+t1` to `<owner-email>+t5`. Never-created probe address `<owner-email>+nobody`. Operator:
`<owner-email>` (never also a shelter admin, `admin.ts:101`). EDRPOU `00000001`, Telegram `test_pritulok_1`,
address «вул. Тестова, 1» in a real city from `cities`, animals «Тест Пес 1»/«Тест Кіт 1», descriptions «Тестова
картка, не реальна тварина.». Photos: stock or self-made images from a folder OUTSIDE the repo. Never a real shelter,
person or photo.

"Mails" = emails the step sends. "Day total" is the running count for Day 1 (a rough tally, no quota).

**Adjustments by the owner (2026-11-04), they override the table below.**
- **Roles by phase** (the advisor drives only the owner's Hobby Chrome; one profile holds one session):
  1. Operator phase, in Hobby: operator steps of 7.2, shelter creation (7.3), 7.4.
  2. Then the owner signs in as `<owner-email>+t1` in Hobby for the shelter phase: shelter profile (7.3), 7.5, 7.6, 7.7.
  3. Steps that need a second simultaneous session (stale tabs, 2.8 second browser, 9.2 t4 reload) use a second browser or a private window, driven by the owner.
- **The advisor runs these from its side, not the owner:** 6.6 (EXIF/GPS on all five variants), 6.7 (cache header), 5.6 (gallery filters via the gate cookie) and the 6.2 redirect check (`/tvaryny/gortaty` is a 308). The image host is not gated.
- **4.7:** S3 has no animals yet; record "no animals" and repeat the "animals leave the gallery" check in 7.9.
- Step numbers above are the matrix's numbers (for example 7.9 is the matrix step, not a heading below).

### 7.1 Operator sign-in, mail quality (matrix section 1)

| # | Step | Who | expect: | Mails | Day total |
|---|---|---|---|---|---|
| 1.1 | `/kabinet/vkhid`, request a link for `<owner-email>`, click it | O | Link arrives, signs you in; operator `/kabinet` answers 404 outside support mode (intended); `/kabinet/prytulky` lists no shelters. | 1 | 1 |
| 1.2 | Mail placement; "Show original" | O | SPF, DKIM, DMARC PASS, aligned; no click or open tracking; plain link on the site. Promotions is recorded, Spam is a failure. | 0 | 1 |
| 1.3 | Re-use the same link | O | Refused (works once). Exact wording UNVERIFIED: record it. | 0 | 1 |
| 1.4 | Clear cookies, sign in again | O | Second link within a minute, works; the older link is dead. | 1 | 2 |
| 1.5 | Request a link 6 times in an hour for `<owner-email>+nobody` | O+A | Every answer looks like "sent"; no mail; Vercel Logs show `{"event":"rate_limited","limiter":"kabinet-sign-in-address"}` from the 6th (limit 5 per address, 20 per IP per hour). | 0 | 2 |

### 7.2 Invites and passwords (section 2; 2.12 is deferred until S1 is verified in 7.4)

| # | Step | Who | expect: | Mails | Day total |
|---|---|---|---|---|---|
| 2.1 | Operator creates S1 «Тест Притулок 1» with first admin `<owner-email>+t1`, unverified | A | S1 in `/kabinet/prytulky`; reminder card to tell the shelter personally; "not yet verified" mail variant. | 1 | 3 |
| 2.2 | Check the invite mail | O | Same standard as 1.2; the page says valid 72 hours. | 0 | 3 |
| 2.3 | Resend the invite for t1 | A | New mail; the previous link stops working. | 1 | 4 |
| 2.4 | t1 opens the OLD link | O | «Цим запрошенням не можна скористатися». | 0 | 4 |
| 2.5 | t1 opens the NEW link, sets a password (repeat must match), «Зберегти й увійти» | O | Signed in, kabinet opens. | 0 | 4 |
| 2.6 | Open the same link again | O | «Цим запрошенням не можна скористатися». | 0 | 4 |
| 2.7 | Sign out; sign in with address + password | O | Signed in, no mail. | 0 | 4 |
| 2.8 | Second browser: sign in t1. Browser 1: «Забули пароль?» for t1, open the reset mail, set a new password | O | Reset mail (shelter admin only); browser 2 signed out on reload; «пароль змінено» mail. | 2 | 6 |
| 2.9 | Sign in with the new password; change it in `/kabinet/akaunt` | O | Other sessions revoked, one renewed; changed-notice mail. | 1 | 7 |
| 2.10 | Forgot-password probe, 4 requests in an hour, `<owner-email>+nobody` | O+A | No mails; Logs show `rate_limited` `kabinet-forgot-address` from the 4th (3 per address, 20 per IP per hour). | 0 | 7 |
| 2.11 | Wrong password 5 times for t1, then the right one | O | Increasing wait before retries, no lockout; right password works after the wait. Exact delays UNVERIFIED. | 0 | 7 |
| 2.13 | Operator invites `<owner-email>` as a shelter admin | A | Refused (one person is never both). Error text UNVERIFIED: record it. | 0 | 7 |

### 7.3 Shelter onboarding via the operator screens (section 3)

| # | Step | Who | expect: | Mails | Day total |
|---|---|---|---|---|---|
| 3.1 | S1: profile (name, description, Telegram, freshness sentence, address with city) | A | Saves; the public location is the FUZZED one, not the typed address. | 0 | 7 |
| 3.2 | Freshness sentence with a specific date, no `{date}` placeholder | A | Shown word for word; required to publish. | 0 | 7 |
| 3.3 | Donation link: shelter submits `https://send.monobank.ua/jar/test`, operator approves; submit another, operator rejects | A | Approved link shows on the public shelter page; the rejected one does not. | 0 | 7 |
| 3.4 | Phone `+380 00 000 00 01`, then `+380 10 000 00 01` | A | First refused (not a Ukrainian number); second accepted (UNVERIFIED). | 0 | 7 |
| 3.5 | Create S2 «Тест Притулок 2» (registered NGO, admin t3) and S3 «Тест Притулок 3» (unregistered, admin t4) | A | Both appear, pending. | 2 | 9 |
| 3.6 | Logo upload on S1 (normal JPEG) | A | Variants under `shelters/<id>/logo/` (small 80 px, large 160 px); logo shown on the shelter page. | 0 | 9 |

### 7.4 Verification FSM (section 4; 0 mails for the whole section)

Legal moves only 10 of 48 pairs (`packages/domain/src/shelters/verification/transition.ts:75-213`). Refused pairs are
reached with a second, stale tab.

| # | Step | Who | expect: |
|---|---|---|---|
| 4.1 | S1: evidence with 1 site visit only, try approve | A | Refused `EVIDENCE_INSUFFICIENT`, naming the missing reference contacts. |
| 4.2 | S1: add 2 reference contacts (fake numbers), start review, approve | A | pending, under_review, verified; history lists each move with actor and time. |
| 2.12 | NOW (S1 verified): operator invites t2 to S1 | A + O (t2 accepts) | "verified" mail variant; both admins see S1; operator sees both under «Адміністратори». 1 mail, **day total 10**. |
| 4.3 | Two tabs on S1; in the stale one press approve again | A | Refused `ILLEGAL_TRANSITION`. |
| 4.4 | S3: reject with code «insufficient_evidence» and a note | A | rejected; reason recorded, visible to S3's admin. |
| 4.5 | S3 rejected: start_review / approve / suspend from a stale tab | A | Each refused `ILLEGAL_TRANSITION`. |
| 4.6 | S3 admin resubmits with corrected evidence, then start_review, approve | A + O | rejected to pending; then verified. |
| 4.7 | S3 verified: operator suspends («unresponsive»); S3 admin tries pause/resume | A | suspended; admin's pause refused; S3 has no animals yet at this point: record "no animals" here and repeat the "animals leave the gallery" check in 7.9. |
| 4.8 | Operator reinstates S3 | A | Back to verified; animals reappear. |
| 4.9 | S3 admin pauses («capacity_reached»); operator suspends; reinstates | A | Reinstate returns to PAUSED, not verified. |
| 4.10 | Approve straight from pending via a stale tab | A | Refused `ILLEGAL_TRANSITION` (if the UI runs start_review itself, record that and use a stale tab). |
| 4.11 | Across 4.1 to 4.10 | O | No mail sent. |

### 7.5 Animals (section 5; 0 mails)

| # | Step | Who | expect: |
|---|---|---|---|
| 5.1 | 12 drafts on S1/S3 covering dog+cat, male/female, each size, each age bucket, plus ONE draft with sex unknown | A | All save as drafts; invisible to adopters (404 on their id). |
| 5.2 | Publish each draft with at least one photo | A | Published; in `/tvaryny` of a VERIFIED shelter only; card matches sex grammatically. |
| 5.3 | Publish the sex-unknown draft; a draft with no photo; one with no description | A | Blocked, gaps named (`PUBLISH_REQUIREMENTS_UNMET`). |
| 5.4 | Age as a bucket vs a birth date | A | Both accepted; bucket derived consistently. |
| 5.5 | Delete a never-published draft; then a card that was published, withdrawn, restored to draft | A | First allowed; second refused `WAS_PUBLISHED`. |
| 5.6 | Gallery filters via the gate cookie | A (from its side) | Each combination returns exactly the matching cards; no result shows the empty state. (Spends one of the 50 per-IP visitor mints per day.) |

### 7.6 Photos (section 6; 0 mails; five WebP variants per photo: thumb, card, compact, mid, detail)

| # | Case | Who | expect: |
|---|---|---|---|
| 6.1 | Normal 1600 px JPEG | A | Accepted; prefix `animals/<animalId>/<uuid>/` holds five files in the R2 dashboard (owner looks); first photo is the cover. |
| 6.2 | 6000 x 4000 JPEG | A | The browser scales to 2000 px; accepted. |
| 6.3 | HEIC | A | Client says HEIC unsupported; nothing sent. |
| 6.4 | PDF or TXT renamed `.jpg` | A | `unreadable`; nothing sent. |
| 6.5 | Server-side refusals via direct POST to `shelter.photos.add` | A (needs your explicit OK each time) | `PHOTO_REJECTED` with the reason; nothing written to R2. May be skipped in Sitting 1. |
| 6.6 | GPS-tagged JPEG; download all five variants | A (from its side; image host is not gated) | `exiftool` on each shows no GPS/EXIF/XMP. |
| 6.7 | `curl.exe -sI "<variant url>"` on a photo uploaded now | A (from its side) | `cache-control: public, max-age=31536000, s-maxage=14400, immutable`; if the edge rewrites it you may see only `max-age=31536000` (UNVERIFIED); record `cf-cache-status` (MISS then HIT). |
| 6.8 | 11th photo on one animal | A | Refused `PHOTO_LIMIT_REACHED` (max 10). |
| 6.9 | Remove a photo, reorder, make cover | A | Removal only unlinks; the five files stay in R2 until the clean-up; stale tab gives CONFLICT. |
| 6.11 | Write down the animal ids / prefixes you touched | O | A list for reset 2's R2 check (there is no `r2:count` script). |

### 7.7 Listing states (section 7; 0 mails)

| # | Step | Who | expect: |
|---|---|---|---|
| 7.1 | Published animal's detail page `/tvaryny/<id>` with the gate cookie | O | 200. |
| 7.2 | Reserve | A | Still visible with a reserved badge; no reservation time in public data. |
| 7.3 | Release | A | Back to published; `publishedAt` kept. |
| 7.4 | «Ще шукає» then «Скасувати» within 8 s; again and wait past 13 s | A | Undo returns `confirmedAt` exactly; after 13 s refused (`undo_expired`). |
| 7.5 | Adopt a published animal | A | Leaves the gallery; no button out of adopted (stale tab: `ILLEGAL_TRANSITION`); detail URL behaviour UNVERIFIED, record it. |
| 7.6 | Withdraw with a reason, restore to draft, publish again | A | Leaves the feed; restore keeps a draft; republishing restarts the wait clock. |
| 7.7 | Withdraw a draft (stale tab) | A | Refused. |
| 7.8 | S1 admin pauses («seasonal_closure»), then resumes | O+A | While paused ALL S1 animals leave the gallery; resume brings them back; history shows both moves. Shelter page while paused: UNVERIFIED, record. |
| 7.9 | Operator suspends / reinstates S1 | A | As 4.7 / 4.8. |

### 7.8 End of Sitting 1: admin removal and withdrawal (section 9 part 1)

| # | Step | Who | expect: | Mails | Day total |
|---|---|---|---|---|---|
| 9.1 | S3: remove admin t4 («Прибрати»). **WRITE DOWN THE TIME (t4 removed).** | A | Membership gone, t4's sessions end at once, recorded in history; removing the last admin is allowed. | 0 | 10 |
| 9.2 | t4's browser reloads `/kabinet` | O | Signed out. | 0 | 10 |
| 9.4 | Invite t5 on S3, then withdraw the invitation | A | Pending invitation removed; t5 never gets an account; no mail on withdrawal. | 1 | **11** |

Day 1 total about 11 mails (matches the matrix); room for about 45 repeats under the ceiling. Do not run Day 1 on
the day of a real shelter's onboarding.

---

## 8. End of Sitting 1: what is left, what to keep

**Left for Sitting 2** (starts directly with section 8; 9.1, 9.2, 9.3 and 9.4 are not part of it, the t4 removal is S.1 at the end): section 8 adopter side at 393 px; 9.5 to 9.7 (support mode, history); section 10
(counts, Logs and Sentry review); NEW (Sitting 2): S2-P pause scenarios, then S2-E early listing only after #426 is merged and deployed (matrix section "S2"); then `pre-reset-2` and reset 2, which is the LAST reset ever, followed by the R2
sweep and Cloudflare Purge Everything (`reset-runbook.md` section 5b).

**Keep and record (no secrets):**
- The time t4 was removed.
- The `r2_cleanup` log outcome from 0.1 and the "before" counts from step 2.
- Shelters created (3), animals created (about 12 or more), the animal ids / R2 prefixes, the R2 dashboard object
  count (five objects per photo).
- Every UNVERIFIED observation above (wording of refusals, shelter page while paused, detail page of an adopted
  animal, cache-control header actually served).
- Mail placement result (inbox, Promotions, Spam) and the day's mail count.
- The Neon branch `pre-reset-1` (do not delete until reset 2 is verified). Do not apply any migration before reset 2
  (a restore would undo it).
- Never keep a connection string, the gate link or a password in any note or chat. The two shell variables were
  removed at the end of step 5; confirm again that a new window has neither.
