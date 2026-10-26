# Review: Resend sign-in route, RATE_LIMIT_KEY_SECRET on every Vercel deployment, reveal without address (uncommitted on bc56fe6, Tier 1)

VERDICT: PASS WITH NOTES

VERIFIED | TAKEN ON TRUST
--- | ---
Resend request: `POST https://api.resend.com/emails`, `Authorization: Bearer`, body keys `from, to, reply_to, subject, html, text`, `from` = `Name <addr>`, no `headers`/`tags`/`topic_id`/List-Unsubscribe (read `providerRequest`; the test asserts the serialised bytes). `reply_to` (snake_case) is the REST field name; `replyTo` is only the Node SDK's | Resend's current API reference (no network from here; checked from memory: REST `reply_to`, 200 `{ id }`)
Success = `response.ok`, id read from `body.id`; a non-2xx throws "provider X refused the send (status N)", with no body and no key | Sensitive Vercel vars being readable at build time (my understanding is yes; **the first Preview build after the push is the real test**)
`emailRoutesOf`: unset / brevo+brevo / resend+key / resend with no key / postmark / unknown value / half-switch with no default. Reasons never echo a value. From, name and Reply-To are one set (read and probed) | `vercel env pull` writing `VERCEL=1` and `VERCEL_ENV=development` (matches my recollection, not re-checked against the docs)
`blockedStatusOf(resend)` → `unknown/provider_suppresses` with no fetch. The log line is masked | Builder's mutations 1-6 and 8-12 (all present and concrete)
Delivery-test script reads `RESEND_API_KEY` only for `--sign-in-provider resend` and prints label/provider/status/id. Scanned the diff: no personal address and no key-shaped string | Real-Neon: not applicable (no driver/SQL change)
`isVercelDeployment`: build and boot share `rateLimitKeySecretProblem`, as does the runtime floor in `rate-limit-key.ts` | 
Reveal: a `pick`ed `RevealShelterSnapshotViewSchema`, one `toView` for both handlers, the walk has no exemptions, served JSON tested with a real street, postcode and district, plus the dialog render test. No i18n change. No live copy promises the address (grep of uk.ts) | 
CLAUDE.md: exactly two hunks (decision #2 and the PublicLocation bullet). Both accurate (`centroid` really is gone from `CityView`, EM-T19) and in style | 
www→apex: `curl -sI https://www.opika.org.ua/kabinet?x=1` → `308`, `Location: https://opika.org.ua/kabinet?x=1` | 
Mutation 7 reproduced: 3 red, with the message naming EM-D1 | 

FINDINGS (most severe first)

1. [medium] `apps/web/src/kabinet/email-provider.ts` (`emailRoutesOf`). The docstring, `.env.example` and EM-T22 all say "the default route's own provider: the default route". The code does that only when the provider has no key name of its own.
   Failure scenario: `EMAIL_PROVIDER=resend` plus `EMAIL_SIGN_IN_PROVIDER=resend` with no `RESEND_API_KEY` gives `invalid`, so sign-in is off. Add `RESEND_API_KEY` and invite and sign-in use two different keys.
   Evidence: a probe returned `{kind:"invalid", reason:"…needs RESEND_API_KEY"}`, and then `["generic","rk"]`. No production exposure today (`EMAIL_PROVIDER=brevo`). It becomes live at EM-F2/EM-F4.
   Fix: either look up the key only when `ownsRoute`, and add a resend+resend test, or make the docs say what the code does. The second option needs Oleksii's say via EM-F4, since EM-B7 says invites on Resend use `RESEND_API_KEY`.
2. [low] `email-provider.test.ts`, "naming the default route's own provider". It compares `result.kind === "configured" && …` on both sides, so `false === false` passes when the route is broken.
   Evidence: I mutated `chosen === "brevo"` to return `invalid`. All 62 tests in email-provider plus production-sign-in stayed green. The same shape sits in `production-sign-in.test.ts` (`unsplit`).
   Fix: assert `kind` first.
3. [low] `docs/h2-next-prs.md:227`. The www→apex item is still unticked, although EM-B8 reports it done and curl confirms it. Tick it with his words.
4. [low] `apps/web/src/api/handlers/public-location.ts`. The doc comment still says "before a reveal", but `toView` now uses it after one as well.

On (B), the builder's choice is sound. A Vercel build or deployment that isn't `development` fails closed. Off Vercel (CI, harness, unit tests) nothing changes. One edge: a developer who runs `vercel env pull --environment=preview` gets `VERCEL_ENV=preview` and no Sensitive value, so `next dev` refuses to boot. That is acceptable, but `.env.example` could say so.

On EM-F4, keeping `EMAIL_PROVIDER_API_KEY` for this pass is right. Renaming a Production variable before the wiring commit is his call. Finding 1 is the place where that asymmetry first bites.

SIMPLIFICATIONS
- `PROVIDER_KEY_NAMES` is a one-entry map with two code paths that hinge on `keyName === undefined`. A literal `signInProvider === "resend" ? "RESEND_API_KEY" : undefined` would do the same job. If this is wrong, adding a fourth provider needs one more edit. Optional.

TESTS
- apps/web, the 15 touched files plus handlers-implement-contract: 348 passed (348).
- packages/contracts: 254 passed (254), after restoring the mutation.
- `tsc --noEmit --incremental false`: domain, contracts and web clean.
- Builder's pasted `pnpm check`: workspace 2413 passed, harness 222 passed and 3 skipped. Present in the commit message draft.
- All mutated files restored and sha1-verified. Probe file removed.
