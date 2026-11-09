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
4. Neon console: is the compute suspended or out of compute hours (Free plan, section 5)?
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

Two crons (`apps/web/vercel.json`): `/api/cron/auth-cleanup` every 6 hours, `/api/cron/r2-cleanup`
daily at 04:00 UTC. Each pings Healthchecks.io when `HEALTHCHECK_URL_AUTH_CLEANUP` /
`HEALTHCHECK_URL_R2_CLEANUP` is set; a missed or `/fail` ping is the alert.

1. Vercel, Settings, Cron Jobs: is the job listed and enabled? (Disabled by hand, or removed by a
   deploy that lost `crons`?)
2. Vercel, Logs, filter by the path: a 401 or a 500 "Cron secret not configured" means `CRON_SECRET`
   is missing or was changed without a redeploy (section 6).
3. `refused_over_cap` in the r2-cleanup log: the delete cap tripped and nothing was deleted
   (section 8). Find out why that many objects look unreferenced before raising the cap.
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

History retention is 6 hours on Free (longer on Launch); act inside it.

1. Neon console, Branches: create a branch from production at a timestamp just before the damage.
   This is a child branch; production is untouched.
2. Verify on the child, read-only: row counts of the damaged tables, and `pnpm --filter @opika/db
   db:check-hashes` (the child's direct string via `Read-Secret`, `--expect` the child endpoint).
3. Either swap (Neon "restore" of the production branch to that point, which keeps the old state as
   a backup branch) or copy back only the damaged tables from the child with `pg_dump` / `psql`.
   Prefer copy-back when the damage is one table; prefer the swap when it is wide.
4. After a swap the compute restarts: expect a cold start, then recheck `/api/health` and a page.
5. R2 is not restored by any of this (section 8). Photos referenced by restored rows may be missing;
   shelters can re-upload.

## 5. Neon limits (what to expect)

- Free plan: 100 CU-hours a month per project; compute scales to zero after 5 minutes idle (the first
  request after that is a cold start, a second or two at most); when the hours are spent the compute
  suspends until the month turns. Launch is pay-as-you-go and removes the cap (`docs/launch-gate.md`
  section A: upgrade before onboarding; `docs/stack-decision.md` section 3.1).
- The app reads `DATABASE_URL` as the pooled string (`docs/launch-sequence.md`, Vercel environment
  table). Migrations and the smokes need the direct string and refuse a pooled one.

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
- one run refuses to delete more than 100 objects (`DEFAULT_MAX_DELETE_PER_RUN`; about 20 photos at
  five variants each): over that it deletes nothing, logs `refused_over_cap` with the counts, and the
  cron answers 500. The cron has no way to raise the cap. Only the CLI does, after someone has looked
  at why so much is due: `pnpm --filter @opika/db r2:cleanup --prod --expect ep-... --commit --max-delete <n>`
  (dry run first, without `--commit`).

## 9. A shelter looks wrong

Not an outage: a shelter that is unreachable, inconsistent or suspected of asking adopters for money.
Follow `docs/operator-playbook.md` (signals, triage, suspend and reinstate, what to record, draft messages).
