# H2 invite PR: Phase 0 questions

**Status:** questions for Oleksii, 2026-10-13. No code until they're answered. Tier 1 throughout:
production sign-in, an email provider, `/prytulkam` commitment copy, production env, real
shelter accounts.

**What this PR is** (`docs/h2-next-prs.md`, HS-Q3): the first PR in which a real shelter can sign
in. It lifts the production 503 on `/api/auth/*` and `/api/kabinet/*`.

**Settled and not asked again:**
- **Provider choice:** ~~decided by a real magic-link delivery test to Gmail, ukr.net and i.ua
  (HS-Q2)~~. **Decided 2026-10-13: Brevo**, with Resend as the documented fallback, not set up
  (IN-E1/IN-E2). The delivery test is Gmail only; ukr.net and i.ua are postponed with a trigger
  (IN-E4).
- **Copy:** this PR carries the `/prytulkam` A1–A3/B1 copy (HS-Q13). A false commitment sentence is
  never live (HS-Q3).
- **Real-Neon run:** sign-in, verify, getSession, accept-invitation, the audited-write CTE, the
  listing compare-and-set and the deleteDraft 23503 catch all run on a real Neon child branch
  before the 503 lifts (HS-T4, HS-T4b, HS-Q12).
- **Location key order:** `LOCATION_HMAC_SECRET` is set in Vercel, `location:verify --prod`
  reports 0 mismatches, and only then does the key join the required production env schema
  (RG-Q10, RG-Q11).
- **RG-T10:** an invite refuses an operator's address, and it lands before `admin:bootstrap`.
- **Rollout:** invite merged → `admin:bootstrap` → Oleksii signs in → first shelter invite (RG-Q2).
- **Invitations:** written server-side, accepted through Better Auth's own `accept-invitation`
  (HS-Q7). Sign-up stays off; the invitation creates the user (RG-Q3).

The questions below are what the code and docs leave open. Q0 and Q1 are collisions: this PR
can't ship as scoped until they're settled.

---

## Q0. Collision: a shelter can sign in, but there is no cabinet to sign in to

RG-Q1 made the registry PR API only, with the screens in their own PR. Nothing in
`apps/web/src/app` renders `/kabinet/*` today: no K1 sign-in, no K2–K5, no S1–S5.

This PR's own premise is "a real shelter can sign in". The copy it must carry describes screens:
A2's true-after-H2 text is "the cabinet has a «Уже вдома» action per animal (K2)". Shipping
sign-in plus that copy without the screens would make the copy false the day it goes live. That
is exactly what HS-Q3 exists to prevent.

The invite link itself also needs pages: somewhere to land, sign in, and accept. See Q3.

- **A (recommended): the screens PR goes before this one.** K1–K5 and S1–S5 are built from the
  mock against the served API, all behind the existing production 503 (nothing changes for anyone
  until it lifts). This PR then turns sign-in on, with every screen the copy describes already
  real. The cost: the copy gate and the 503 lift wait for the screens.
- **B:** this PR carries K1, the acceptance page and the shelter screens (K2–K5) with it, and the
  operator screens (S1–S5) follow separately. One much larger Tier 1 PR. The operator would run
  the registry from the API until S-screens land, which nobody can do comfortably.
- **C:** ship sign-in with no screens and copy describing only what is true then. The copy would
  have to say "the cabinet is coming", and it would be rewritten again within weeks. Commitment #6
  argues against churn on exactly these sentences.

## Q1. Collision: the pre-launch gate 403s the kabinet

`proxy.ts` answers 403 to every request without the gate cookie while
`SITE_IS_PUBLICLY_DISCOVERABLE` is false. Its matcher covers `/api/auth/*`, `/api/kabinet/*` and
`/kabinet/*`. A shelter admin clicking the magic link in their email has no gate cookie, so the
verify URL 403s and sign-in can't complete.

- **A (recommended): exempt the kabinet's own paths from the gate.** These paths are
  `/kabinet/*`, `/api/auth/*` and `/api/kabinet/*`. They are behind their own authentication, are
  `noindex`, and serve no public content. The gate is a bot shutter for the public site
  (`prelaunch-gate.ts`), not a guard for these paths. The exemption is an exact-prefix list in
  `proxy.ts`, with a test that a gated public path still 403s and each kabinet prefix doesn't.
  The per-IP limits on these paths stay (HS-Q5, HS-Q10).
- **B:** put `?gate=<secret>` into every magic link and invite link. The secret would then sit in
  every shelter's inbox. Accepted for the prototype's browser history, but email is forwarded and
  archived.
- **C:** lift the whole pre-launch gate in this PR. That is the launch gate's own decision, with
  its own checklist (`docs/build-plan.md` Part 5); it doesn't belong to sign-in.

## Q2. Which email provider, and from which domain?

**Answered 2026-10-13 (IN-E1/IN-E2): Brevo, sending from `noreply@mail.opika.org.ua`, Resend the
documented fallback (not set up).** The candidates below are kept as the record of what was
weighed. The delivery test became Gmail only (IN-E5's script); ukr.net/i.ua are postponed (IN-E4).

HS-Q2 settled how the provider was to be chosen. These were the inputs to that test.

**Candidates.** Each is a Vercel-compatible HTTP API, EU-capable, with a free or low tier at this
volume:
- Resend (Vercel Marketplace);
- Postmark;
- Brevo (EU-hosted).

The test sends one magic link from each to a Gmail, a ukr.net and an i.ua address. For each it
records where the mail lands (inbox, promotions or spam), the delay, and whether the link survives
intact.

**The sending domain collides with "the name is not final".** SPF, DKIM and DMARC need a domain
the project controls. Mail from a provider's shared domain is what lands in spam at ukr.net.
- **A (recommended):** the domain the site will launch on, if one exists, with the from-name in
  app config (`KABINET_EMAIL_FROM`), so a rename touches config and DNS only. Brand strings stay
  out of the domain and contract packages either way.
- **B:** a neutral sending domain registered for this (e.g. a `mail.` subdomain of whatever
  domain is held). It survives a rename, but the address a shelter sees isn't the site's.
- **Question for you:** which domain(s) do you hold, and which should mail come from?

Provider data processing (the recipient address, the email content) belongs in the privacy
policy (H5). Noted here, written there.

## Q3. How does the invitee learn of the invitation, and where does the link land?

The S2 mock commits to an email: «Запрошення надіслано на …» and «Надіслати ще раз». The
invitation lasts 72h.

- **A (recommended): an invite email through the same provider, sent by
  `registry.admins.invite`, `registry.shelters.create` and `resendInvite`.** The link goes to
  `/kabinet/vkhid?zaproshennia=<invitationId>`: K1 with the address prefilled, then the magic link,
  then, after verify, an acceptance step that calls `accept-invitation`. The send happens after the
  write and doesn't decide it: a failed send leaves the invitation pending and visible on S4 for a
  resend. The response says what happened, so the UI never claims "sent" for a send that failed.
- **B:** no invite email. The operator tells the person, and they sign in at K1 with their address.
  This contradicts the S2 mock's «Запрошення надіслано на …» and needs a new mock.

**There is no mock for the acceptance step** (between verify and K2): STOP-list item "ambiguous
design with no mock". Needed from you either way: a frame, or an explicit "no screen, accept
automatically on the first sign-in with a pending invitation". The latter is possible because
the invitation is bound to the address (Better Auth checks it). It is simpler and has no screen
to design. It is what A would do if you say so.

## Q4. Forwarding `accept-invitation`, and the RG-Q9 guard

Today `FORWARDED_AUTH_PATHS` has four paths, none of them organization paths, and
`no-self-serve-yet.test.ts` holds three conditions.

This PR flips them on purpose: production sign-in available, and
`/api/auth/organization/accept-invitation` forwarded. The moment either flips, the guard's
allowlisted import fails, and so do "no organization path forwarded" and the copy-gate messages.
That is RG-Q9 working as designed.

- **Proposed:** replace the guard with its successor in the same commit as the copy. The
  successor test asserts:
  - the A1–A3/B1 keys hold the new Ukrainian, not the old sentences;
  - exactly one organization path is forwarded (`accept-invitation`), so no other plugin path
    (create-organization, invite, set-active) becomes reachable;
  - `allowUserToCreateOrganization` stays false, and only the invitations module writes
    `auth_invitation`.
- **Question:** accept the successor as listed, or add conditions.

## Q5. The `/prytulkam` copy and the emails' Ukrainian

These block the merge: A1–A3 and B1, plus B2, which you flagged as your call (`docs/h2-copy-sheet.md`).
`[COPY PENDING]` can't ship for them (commitment sentences).

**New copy this PR needs**, not on the sheet yet:
- **Magic-link email:** subject, body, and the 15-minute expiry line.
- **Invite email:** subject, body (shelter name, 72h expiry, what happens next), and the resend
  wording.
- The acceptance step's text, if Q3 keeps a screen.

`[COPY PENDING]` in an email sent to a real shelter is user-facing. The proposal is that emails
refuse to send in production while any of their strings is `[COPY PENDING]`. A test pins it, the
same way `copy-status.test.ts` pins the page.
- **Question:** confirm, and say whether you want these on a second copy sheet now.

## Q6. Production auth: when is it "on", and which env is required?

Today `kabinetAuthAvailability` answers `no_sender_in_production` unconditionally in production.

- **A (recommended):** production is available exactly when the provider key, `BETTER_AUTH_SECRET`
  and `BETTER_AUTH_URL` are present.
  - All three join `RequiredProductionEnvSchema` in the same change, so a deploy missing one fails
    at boot rather than serving a half-working sign-in. That is the same rule RG-Q10 set for
    `LOCATION_HMAC_SECRET`.
  - Deploy order: all three are set in Vercel (Production, and Preview if Preview should sign in)
    before the merge.
  - `BETTER_AUTH_SECRET` has a 32-character floor, generated with `openssl rand -hex 32`.
- **B:** keep auth optional at boot (503 when any is missing). This avoids a boot failure, but it
  can silently serve 503 sign-in after a bad env change, which nobody sees until a shelter
  writes.

Either way, `LOCATION_HMAC_SECRET` joins the schema only after your `location:verify --prod`
run. The comments that say it's never in Vercel (`env.ts`, `onboard-shelter.ts`) are rewritten
in that change.

## Q7. RG-T10: an invite refuses an operator's address (contract shape)

`registry.admins.invite` and `registry.shelters.create`'s first admin must refuse an address that
holds an active `super_admins` grant. Accepting would otherwise make one person both roles
(`conflicting_roles`, locked out of everything). `admin:grant` already refuses the reverse
(an address with a live invitation, review of the scripts row).

Today the refusal for "already administers a shelter" is `ALREADY_A_MEMBER` (409, no data).

- **A (recommended): one refusal for the one rule, with a reason.** Rename it `ADDRESS_HAS_A_ROLE`
  (409) with `data: { reason: "shelter_admin" | "operator" }`. This follows the precedent of
  `INVALID_EVIDENCE` and `WAS_PUBLISHED`. No client calls the registry yet, so the rename is free
  now and expensive later.
- **B:** keep `ALREADY_A_MEMBER` and add the same `data.reason`. Smallest diff, but the name is
  wrong for an operator.
- **C:** a separate `ADDRESS_IS_OPERATOR` (409). Two codes for one rule.

Shapes for A are in `docs/h2-invite-shapes.md` §1.

## Q8. Found in the code: two pending invitations for one address

One membership per user is a unique index (HS-Q7). An address can hold two pending invitations,
to shelters A and B. Accepting A succeeds; accepting B then hits the unique index inside Better
Auth's `accept-invitation`, which surfaces as a 500, not a refusal.

- **A (recommended):** an invite refuses an address that already holds a live pending invitation
  to another shelter, with `ADDRESS_HAS_A_ROLE` and `reason: "invited_elsewhere"`. The operator
  withdraws the other one first, which is the same rule `admin:grant` follows.
- **B:** allow it, and map the 23505 at acceptance to a typed refusal. This needs a wrapper around
  Better Auth's endpoint, which the guard design (HS-Q7, one forwarded path) argues against.

## Q9. The real-Neon run: what it covers here

HS-T4/T4b/HS-Q12 list the paths. The proposal is to run them as an extension of
`db:neon-smoke`-style tooling against a fresh child branch, before the 503 lifts:
- sign-in → verify → getSession → accept-invitation end to end on neon-http;
- the provider in test mode;
- the registry's earlier smoke statements again.

Better Auth's paths need the real adapter and a real `Request`, so this is a script driving the
auth route function, not the test suite (which refuses non-local databases).
- **Question:** confirm the shape (script + report counts, as for rehearsal-0011).

## Q10. The production rollout order, combined

RG-Q2's order, with RG-Q10's steps and this PR's prerequisites folded in:

1. *(done)* registry PR merged; 0011 on production (RG-R4).
2. You set `LOCATION_HMAC_SECRET` in Vercel (Production), the same value as the onboarding
   script's, and run `location:verify --prod`. It must report 0 mismatches and no `PRIVACY` line;
   `demo` is expected.
3. Provider, domain DNS (SPF, DKIM, DMARC), `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` are set in
   Vercel; the delivery test (Q2) has passed. *(Provider and DNS done for Brevo, 2026-10-13, IN-E1;
   the auth env and the Gmail delivery test still pending.)*
4. The real-Neon run (Q9) is green on a child branch.
5. Invite PR merged. RG-T10 is in it, and the env schema now requires the keys from steps 2–3.
6. `admin:bootstrap <your email>` on production.
7. You sign in on production.
8. First shelter invite. When the first real shelter lands, the demo corpus is removed (RG-Q11's
   note: the `demo` line then reads 0).

If Q0 goes A, the screens PR sits between 1 and 5.

- **Question:** confirm the order.
