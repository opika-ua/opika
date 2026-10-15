# Review: invites to Resend, one key per provider (uncommitted on f54d361, Tier 1)

VERDICT: PASS WITH NOTES

VERIFIED (ran it)                                                    | TAKEN ON TRUST
---------------------------------------------------------------------|---------------------------------------------
Nothing in the repo reads `EMAIL_PROVIDER_API_KEY` (searched src, scripts, env validation, harness, CI, `.env.example`). The only mentions left are in tests (as a variable that must be ignored) and in docs (as gone or as a retirement step) | The builder's full `pnpm check` (2428 unit, harness 222), from the message file
Each provider has exactly one key variable. Both routes read their provider's own variable. A provider with no key is `invalid`, and the reason names the variable but never a value. With the production values set, a leftover generic key changes nothing (temporary test, below) | The builder's other 6 mutations (all 7 listed describe a real break and a named red test)
`productionSignInOf` is never called outside tests, so production sign-in is not wired | Whether `EMAIL_PROVIDER_API_KEY` or `LOCATION_HMAC_SECRET` is actually set in Vercel today
`kabinetAuthAvailability` returns unavailable whenever `NODE_ENV=production`, before it looks at `BETTER_AUTH_*` | Better Auth's own secret-length rules (not built in production today)
`assertBuildEnv` doesn't throw for the full list, nor with a deliberately wrong `EMAIL_REPLY_TO` / `EMAIL_FROM_ADDRESS` / `BETTER_AUTH_URL`. `validateEnv` reads no `EMAIL_*`, `BETTER_AUTH_*` or `PRODUCTION_ORIGIN` variable (read in `env.ts`) |
`productionSignInOf` with the list's values plus the live catalogue comes back `on`: both routes on resend with `RESEND_API_KEY`. A trailing-slash `BETTER_AUTH_URL` is accepted. A `www` one is off (`auth_url_not_production_origin`). Without `EMAIL_FROM_NAME` it is still `on` |
Mutation (spot-check): made `providerKeyOf` fall back to `EMAIL_PROVIDER_API_KEY`. Two tests went red: "the removed EMAIL_PROVIDER_API_KEY never stands in…" and production-sign-in's "is off (provider_invalid)…". This matches the commit message. File restored, diff stat unchanged |
`tsc --noEmit --incremental false`: apps/web and packages/contracts both clean |

## The contract enum: not a STOP

Adding `provider_suppresses` doesn't widen the schema for a temporary mode:
- Resend is the permanent provider; Brevo is what's going away.
- The value describes a real state of that provider: it filters on a suppression list we don't read. It was already a value in the per-send union (`blockedStatusOf`, email-provider.ts:595).
- The alternative, `unsupported_provider`, would be false: Resend does have a list.
- The field is output-only and no UI renders `why`.

If EM-F1 later reads Resend's list, the value becomes unused and should come out in that same change. Removing a value from an output enum nobody renders is safe.

## FINDINGS (most severe first)

1. [low] docs/h2-next-prs.md:108-127. The switch-on list leaves out `LOCATION_HMAC_SECRET`.
   - Failure scenario: Oleksii sets only the listed variables. After the wiring commit, every `/registry/` RPC answers 503 (rpc-route.ts:63, route.ts:21).
   - It is tracked, but only as a separate unticked step (h2-next-prs.md:207-216, rollout order Q10: it comes before the provider/auth env).
   - Fix: add one line pointing to it.
2. [low] auth-route.ts:12 says "The invite PR adds the provider" and app/kabinet/layout.tsx:9 says "until the invite PR adds an email provider". Both are now false: the invite PR (#94) doesn't wire it; the wiring commit will. Both lines are outside this diff. Fix them in a Tier 3 follow-up, or in the wiring commit.
3. [note] Nothing checks the values before the wiring commit. A typo stays silent until then, and then shows only as a fail-closed `off` reason. The live catalogue has no `[COPY PENDING]` left, so with correct values the wiring commit turns sign-in on immediately.

## SIMPLIFICATIONS
- email-delivery-test.ts: `DELIVERY_KEY_NAME` / `RESEND_DELIVERY_KEY_NAME` are now just aliases for `PROVIDER_KEY_NAMES.*`. Use the map directly. Risk if wrong: only the test imports of those names break.
- `EMAIL_SIGN_IN_PROVIDER`: remove it together with Brevo's code at the end of the grace period (EM-P1 already records this).

## VERIFIED VERCEL LIST (Production only, never Preview)

**ADD**
- `EMAIL_PROVIDER=resend`
- `EMAIL_FROM_ADDRESS=noreply@mail.opika.org.ua`. Must be on `mail.` + the PRODUCTION_ORIGIN host.
- `EMAIL_FROM_NAME=Opika`. Optional in code.
- `EMAIL_REPLY_TO=hello@opika.org.ua`. Required, and must be on the PRODUCTION_ORIGIN host.
- `PRODUCTION_ORIGIN=https://opika.org.ua`
- `BETTER_AUTH_SECRET`: Sensitive, generate with `openssl rand -hex 32`.
- `BETTER_AUTH_URL=https://opika.org.ua`. Must be the same origin as PRODUCTION_ORIGIN; `www` is refused.

**ADD, as its own earlier step (already in the checklist)**
- `LOCATION_HMAC_SECRET`: same value as the onboarding script, then `location:verify --prod` must report 0 mismatches.

**KEEP**
- `RESEND_API_KEY`, `KABINET_OPERATOR_DISPLAY_NAME`, `CRON_SECRET` (build-required), `RATE_LIMIT_KEY_SECRET` (build-required, Production and Preview).
- Already required for the existing site, unchanged: `DATABASE_URL`, `CURSOR_HMAC_SECRET`, `NEXT_PUBLIC_R2_PUBLIC_BASE_URL`, `PRELAUNCH_GATE_SECRET`, `KV_REST_API_URL` + `KV_REST_API_TOKEN` (or the `UPSTASH_REDIS_REST_*` pair).

**CHANGE:** nothing.

**DON'T ADD:** `EMAIL_SIGN_IN_PROVIDER`, `BREVO_API_KEY` (only a rollback to Brevo would need it).

**REMOVE:** nothing now. `EMAIL_PROVIDER_API_KEY` is read by nothing, so it is safe to remove whenever Oleksii OKs it.

**Setting all of the above turns nothing on.** Production answers 503/404 and nothing is sent until the wiring commit. No build or boot check reads these variables, so a wrong value can't fail the next build.

## TESTS
- apps/web (email-provider, production-sign-in, email-delivery-test, registry): 4 files, 153 passed.
- packages/contracts (contract.test.ts): 1 file, 210 passed.
