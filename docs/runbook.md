# Incident runbook

Steps only: no secrets, no connection strings, nothing here is run by an agent. Oleksii runs every
step that touches Vercel, Neon, R2, DNS or Healthchecks. Production writes follow CLAUDE.md's hard
rules (a Neon child branch for anything experimental; `--prod --expect ep-...` for the scripts).

## 1. Site down

1. Is it the site or the network? Open `https://opika.org.ua/api/health` (no database call, its own
   limiter). 200 means the app answers and the fault is further in.
2. Vercel dashboard, Deployments: did a deploy go out just before it broke? If yes, go to section 3.
3. Vercel, Logs (Runtime): look for `rate_limiter_unreachable` (Upstash down; see "When Upstash is
   down" below for which routes stay open), database errors (Neon: check
   its status page and the project's compute state, section 5), or a boot error naming a missing
   variable (an env change without a redeploy, section 6).
4. Neon console: is the compute suspended, or held at its 2 CU maximum by a runaway query (section 5)?
5. Vercel status, Upstash status, Cloudflare (R2 and DNS) status.
6. If it is an attack, section 7.

### When Upstash is down

Each limiter has an explicit fail mode (`onUnavailable`). Fail open (allowed, unthrottled, each
logged as `rate_limiter_unreachable`): public reads (`api`), adopter minting, and the `health`,
`monitoring` and `monitoring-test` probes, because an outage of the limiter store must not take the
site or its health probe down with it. Fail closed (refused with 429): sign-in, forgot and reset
password, invites, the sign-in delay store, the kabinet per-user and per-IP limits, photo uploads and
the per-IP reveal budget, because each guards a credential, a mail, a write or shelter contact data.
`/api/health` therefore keeps answering 200 while the store is down; the warning is the signal.

## 2. A cron stopped

Four crons (`apps/web/vercel.json`): `/api/cron/auth-cleanup` every 6 hours, `/api/cron/r2-cleanup`
daily at 04:00 UTC, `/api/cron/notifications` daily at 06:00 UTC (early listing ends in 7 days, one
retry of failed notification mails) and `/api/cron/freshness-reminder` on Mondays at 07:00 UTC (the
weekly «непідтверджені картки» email: 09:00 in Kyiv in winter, 10:00 in summer). Each pings
Healthchecks.io when `HEALTHCHECK_URL_AUTH_CLEANUP` / `HEALTHCHECK_URL_R2_CLEANUP` /
`HEALTHCHECK_URL_NOTIFICATIONS` / `HEALTHCHECK_URL_FRESHNESS_REMINDER` is set; a missed or `/fail`
ping is the alert.

1. Vercel, Settings, Cron Jobs: is the job listed and enabled? (Disabled by hand, or removed by a
   deploy that lost `crons`?)
2. Vercel, Logs, filter by the path: a 401 or a 500 "Cron secret not configured" means `CRON_SECRET`
   is missing or was changed without a redeploy (section 6).
3. `refused_over_cap` in the r2-cleanup log: the delete cap tripped and nothing was deleted
   (section 8). Find out why that many photos look unreferenced before raising the cap.
4. `refused_misconfigured`: one of the `R2_CLEANUP_*` credentials is half set or padded.
5. Run it by hand to see the real error: `curl` the path with the bearer header, the secret read from
   your own password manager, never pasted into chat.

## 3. Bad deploy: roll back

1. Vercel, Deployments, pick the last good Production deployment, "Instant Rollback". No rebuild;
   the alias moves back at once. Skew protection (12 h) keeps open tabs working.
   **Never roll back to a deployment older than `80c4cf3` (launch step 14, PR #448):** those builds
   still carry the pre-launch gate and `noindex`, and a deployment keeps the env values it was built
   with (section 6) while `PRELAUNCH_GATE_SECRET` is deleted in Vercel, so visitors would get a 403.
   Roll back only to `80c4cf3` or later.
2. Rolling back does not undo a database migration. If the bad deploy shipped one, stop and decide
   with the migration's reviewer: migrations here are additive unless the PR said otherwise.
3. Fix forward on a branch and promote only through the normal merge. The next merge to the default
   branch deploys again, so tell whoever is merging.

## 4. Restore the database (Neon point-in-time)

Owner only. History retention is 7 days (section 5): a timestamp older than that cannot be restored.
Always restore onto a **new branch first, never straight over the production branch**. Neon's
console is the source of truth for these steps (labels from Neon's docs: "Create a branch",
https://neon.com/docs/manage/branches, and "Instant restore",
https://neon.com/docs/guides/branch-restore); the repo has no restore script.

1. Neon console, project `opika`, Branches, New branch. Parent branch: production. Name it so
   section 5's listing tells it apart, e.g. `restore-<yyyy-mm-dd>`. Choose **Past data** and a time
   just before the damage. Uncheck "Automatically delete branch after" (checked by default in the
   console, section 5), so the branch stays until you delete it. Create. Production is untouched.
2. Verify on the new branch, read-only: row counts of the damaged tables, and
   `pnpm --filter @opika/db db:check-hashes` with `$env:DATABASE_URL = Read-Secret "Restore branch
   DIRECT connection string"`. `db:check-hashes` takes no `--expect`; it prints `Target: Neon
   endpoint ep-...` first, so check that id is the new branch's endpoint, not production's, before
   reading the hashes. Every migration should read `match`. Then `Remove-Item Env:DATABASE_URL`.
3. Decide, with what step 2 showed:
   - **Copy back** only the damaged tables from the new branch with `pg_dump` / `psql`. Prefer this
     when the damage is one table.
   - **Restore production in place** (Neon: the production branch, Postgres database, Backup &
     Restore, Restore from history, From history, the same timestamp, Next, Restore). Prefer this
     when the damage is wide. Neon keeps the pre-restore state as a branch named
     `production_old_<timestamp>`; existing connections drop during the restore and reconnect after,
     with the same connection string.
   Any write to production afterwards (a migration, `onboard:shelter`) goes through the usual guards:
   `--prod --expect ep-...` with `PROD_NEON_ENDPOINT` set (CLAUDE.md, Commands).
4. After an in-place restore expect a cold start, then recheck `/api/health` and a page, and run
   `db:check-hashes` against production (its `Target:` line must name the production endpoint).
5. R2 is not restored by any of this (section 8). Photos referenced by restored rows may be missing;
   shelters can re-upload.
6. Delete the restore branch (and, once sure, the `_old_` backup) by hand when done (section 5,
   "Branches").

## 5. Neon plan and limits

Owner's dashboard facts, 2026-11-20:

- Project `opika`, AWS eu-central-1 (Frankfurt), **Launch** plan (through the Vercel Marketplace),
  Postgres 18.
- Default compute: autoscaling, min 0.25 CU, max 2 CU (lowered from 8 CU to bound the cost of a
  runaway query; typical use is ~0.25 CU), scale-to-zero on. A compute that scales to zero answers
  its first request with a cold start.
- History retention (the point-in-time restore window, section 4): 7 days, raised from 6 hours.
- Usage since 2026-11-08 (a snapshot read on 2026-11-20, not a limit): 28.6 CU-hours, 63 MB storage,
  257 MB transfer.
- 4 branches on 2026-11-20.

The app reads `DATABASE_URL` as the pooled string (`docs/launch-sequence.md`, Vercel environment
table). Migrations and the smokes need the direct string and refuse a pooled one.

### Branches: read-only listing

Nothing in this repo deletes a Neon branch (no cron, no script); the owner deletes stale branches by
hand, in the console, after reading this list. Two things outside the repo can delete one by itself:

- **The Vercel–Neon integration** deletes a `preview/<git-branch>` branch when its Vercel deployments
  are removed ("Preview branches are automatically deleted when their corresponding Vercel
  deployments are removed", https://neon.com/docs/guides/vercel-managed-integration). We expect
  none: only the default branch deploys (`apps/web/vercel.json`).
- **Neon's branch expiry.** Neon's docs: "By default, Automatically delete branch after is checked
  with 1 day selected", "This default only applies when creating branches through the Console" and
  "API and CLI branches have no expiration by default"
  (https://neon.com/docs/manage/branches; https://neon.com/docs/guides/branch-expiration). A
  smoke-sitting child branch made in the console with the box left checked may disappear by itself
  after that time; that is fine, since every sitting uses a fresh branch. A restore branch must not
  expire: section 4, step 1 says to uncheck it.

1. Neon console, project `opika`, Branches: each row shows the name, when it was created and its
   parent. Tell them apart:
   - the production branch: the root, no parent;
   - smoke-sitting child branches: parent production. `smoke-sitting.ts` does not name them (the
     owner does, or Neon generates a name); a sitting names used ones by endpoint id only, as never
     to be reused. Match a row to a sitting by its endpoint id and creation date;
   - restore points named before a risky step (`pre-reset-1`, `pre-reset-2` in
     `docs/prelaunch/child-sitting.md`, the import sitting's `restoreBranchName`) and section 4's
     `restore-...` and `production_old_...`: keep until the step they protect is settled;
   - Vercel preview branches, named `preview/<git-branch>` by the integration (see above). None
     are expected; one here predates the default-branch-only deploys or means preview branching
     was switched on.
2. Optional, CLI (syntax from https://neon.com/docs/reference/cli-branches and
   https://neon.com/docs/reference/neon-cli; `neonctl` is an alias of `neon`). Lists only. The API
   key goes through the environment, never on the command line or in chat:

   ```powershell
   $env:NEON_API_KEY = Read-Secret "Neon API key"
   neonctl branches list --project-id <project-id> --output json
   Remove-Item Env:NEON_API_KEY
   ```

   `<project-id>` is in the console's project Settings. Read `name`, `created_at`, `parent_id`
   (absent on the root) and `creation_source` per branch. The default table output shows name and
   creation time but not the parent.

## 6. Rotating secrets

Vercel env changes apply to new deployments only: after changing any variable, redeploy, or the
running deployment keeps the old value.

| Secret | Effect of rotating |
|---|---|
| `CRON_SECRET` | Vercel sends the current value as the cron's bearer token. Change it and redeploy; until the redeploy the crons answer 401. |
| `BETTER_AUTH_SECRET` | Signs every admin out. Follow `docs/onboarding-a-shelter.md`, "Rotating `BETTER_AUTH_SECRET`" (including the required sign-in clean-up). |
| `RATE_LIMIT_KEY_SECRET` | Resets the rate-limit buckets only. |
| `CURSOR_HMAC_SECRET` | Pagination cursors already handed out stop working. |
| `LOCATION_HMAC_SECRET` | Not config-only: every shelter's public location must be recomputed in one migration (`docs/decisions-inbox.md`, RG-Q10). Do not rotate without that plan. |
| `RESEND_API_KEY` | Create the new key in Resend, set it, redeploy, then delete the old key. Auth mail fails between the delete and the redeploy. |
| `R2_UPLOAD_*`, `R2_CLEANUP_*` | Create the new API token in Cloudflare, set it, redeploy, then revoke the old one. |
| Upstash token (`KV_REST_API_TOKEN` or `UPSTASH_REDIS_REST_TOKEN`) | Rotate in Upstash, update both naming pairs if both are set, redeploy. |
| Neon role password (`DATABASE_URL`) | Reset in Neon, update Vercel, redeploy; any script holding the old string stops working. |
| `HEALTHCHECK_URL_*` | Regenerate the check's slug in Healthchecks, update the variable, redeploy. |

## 7. Quick kill options (smallest first)

- **No gate any more:** the pre-launch gate came down at launch (2026-11-09, PR #448), so there is no
  switch that hides the site. To take it offline use Vercel Pause Project (Settings); for a flood or
  abuse use Attack Challenge Mode below. A rollback does not hide the site (see the warning in section 3).
- **Vercel, Settings, Cron Jobs, "Disable Cron Jobs":** stops both crons without a deploy. Re-enable
  afterwards; Healthchecks will alert on the gap.
- **Vercel Attack Challenge Mode** (Firewall): challenges all traffic; use it for a flood. Turn it
  off when over: it also challenges legitimate bots and crawlers.
- **Pause the project** (Vercel, Settings, Advanced): every route serves Vercel's paused page. The
  last resort; resume from the same place.
- `KABINET_WRITE_ALLOWLIST` no longer exists (deleted with PR 6, `docs/onboarding-a-shelter.md`,
  retirement step 4): there is no write-side switch in the kabinet today.

## 8. R2 accepted risk

The bucket has no versioning and no replication. An object deleted from R2 is gone. Accepted by the
owner: shelters can re-upload photos and logos. The protection is the clean-up job itself:

- an object is deleted only after 7 days unreferenced, re-checked right before the delete, and only
  under `animals/` and logo-shaped `shelters/` keys;
- one run refuses to delete more than 100 distinct photos or logos (`DEFAULT_MAX_PHOTOS_PER_RUN`, a day
  of uploads or crops; owner, 2026-11-16). It counts photos, not objects, so no format change moves it:
  a photo is eleven objects today (five variants as WebP and as AVIF plus the kept source), six if
  stored before AVIF and not yet backfilled, five if stored before kept sources, three before `mid` and
  `compact`, and any object of no known shape counts as a photo of its
  own. Over the cap it deletes nothing, logs `refused_over_cap` with `duePhotos`, `dueObjects` and
  `capPhotos`, and the cron answers 500. The cron has no way to raise the cap. Only the CLI does, after
  someone has looked at why so much is due:
  `pnpm --filter @opika/db r2:cleanup --prod --expect ep-... --commit --max-photos <n>` (dry run first,
  without `--commit`: it prints the photo count). The old object-count `--max-delete` is refused.

## 9. A shelter looks wrong

Not an outage: a shelter that is unreachable, inconsistent or suspected of asking adopters for money.
Follow `docs/operator-playbook.md` (signals, triage, suspend and reinstate, what to record, draft messages).

## 10. Notification mails skipped ("event cap reached")

Event mails (review requests, donation links, decisions, early-listing reminders, the weekly
«непідтверджені картки» email) and the retries of any of them share a cap of
`NOTIFICATION_DAILY_EVENT_CAP` a Kyiv day (default 300), counted from `notification_sends`: a first
attempt on the day its row was created, a retry on the day it was made. Over the cap a mail is
skipped, not queued, and a retry is left failed for a later run: the log line
`notification event cap reached: N mail(s) not sent` (or `skippedOverCap` in a cron's line) says
how many. A weekly mail that a Monday cap skipped waits for next Monday. The cap is a runaway-loop
guard, not a plan quota (Resend is on Pro, no daily limit). At 80% of it (240 of 300) `hello@` gets
one email a Kyiv day, «Листи-сповіщення: використано 80% добового ліміту», with the two numbers and
nothing about any recipient; a normal day never sends it, so read it as a possible loop. A failed
warning changes nothing and is not retried. Raise the variable in Vercel and redeploy only if the day was real: a shelter that
repeats itself is already held to one review-request mail and one proposed-link mail per
operator per Kyiv day, so a day over the cap means many shelters or many decisions.

The two scheduled crons also share one batch budget of 300 sends a Kyiv day: the daily cron's
retries and early-listing reminders and, on Mondays, the weekly reminder together. Both the budget
and the cap are re-read from `notification_sends` before every claim, so two runs at the same moment
see each other's sends. A Monday cannot send more than 300 between them, plus at most one mail in
flight per run that is still unclaimed when the other run reads (the residual bound: 300 + 1 per
concurrent run, so 302 for the daily and weekly crons at once, and the cap of 300 + 1 per run likewise).
What does not fit waits, and the weekly run serves the shelter that waited longest first, so none is
starved. The batch budget equals the event cap and its sends count against the cap too, so the cap is the
binding limit; neither is sized to the provider. The log's `deferred` (budget or time) and `skippedOverCap` (cap) say what waited.

The weekly email can be switched off for one shelter on its operator page («Лист про непідтверджені
картки»), usually because the shelter replied to ask; the page records who and when in the history.

## 11. Deleting a shelter

The operator's «Видалити притулок», last on the shelter's page (`/kabinet/prytulky/<id>`; owner,
2026-11-20: any shelter). The dialog shows live counts (cards, drafts included; those published;
admins) and enables «Видалити назавжди» only once the shelter's name is typed exactly (the input is
trimmed, the stored name is compared as it is). The server re-checks the operator, the name and the
counts under a lock and refuses if anything changed since the dialog opened; the dialog then shows the
fresh counts.

One transaction removes the shelter, all its animals (drafts too) with their photo-source rows, the
reveals of its animals and to it, its history, its organization with invitations and memberships, and
the accounts of its admins and invitees that the erasure invariant allows (no other membership or
operator grant, no live invitation elsewhere: such an account stays, without access to this shelter).
Support sessions, funnel events and notification sends stay with the shelter link set to null. One
`application_deletions` line records it: reason `operator_removed`, the shelter id, the operator's
account id and the time. Photos and the logo leave R2 only through the clean-up job, 7 days after
they become unreferenced (section 8).

**A wrong deletion is recoverable only through a Neon point-in-time restore**, within the 7-day
history window, **onto a new branch, never over the production branch**: follow section 4 from step 1,
with a time just before the deletion (the `application_deletions` line's `at`). Copying the shelter's
rows back is the "copy back" case of step 3; it touches many tables, so plan it with the restore
branch open. Act within the window: after 7 days the history is gone, and the clean-up job deletes the
unreferenced photos once their own 7 days have passed (restored rows that name them again stop that,
as the job re-checks references before each delete).
