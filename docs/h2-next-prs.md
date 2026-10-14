# H2: what the next two PRs must carry

Order decided by Oleksii, 2026-10-13 (inbox HS-Q13, verbatim there): **the registry PR first, the invite PR after it.** Each
section below is copied into that PR's checklist when it opens. A box here is a merge blocker
unless it says otherwise. Sources are inbox rows in `docs/decisions-inbox.md`.

---

## Registry PR (next)

Serves `registryContract`: `registry.*` plus `session.exitSupport` (HS-Q1). Tier 1: Phase 0
questions go to Oleksii before code.

- [ ] **`admin:bootstrap <email>`** (RG-Q2): behind the production guard; prints the host and the
      email, asks for confirmation, creates the user **and** grants super_admin, and refuses if
      any active super_admin exists (one-time only).
- [ ] **`admin:grant` / `admin:revoke`** (HS-Q4, HS-T11: a merge blocker here), for later admins. Behind the
      production guard. `admin:grant` prints the host and the target email, asks for
      confirmation, and refuses unless the user already exists. `admin:revoke` sets `revoked_at`
      and never deletes (HS-T2).
- [ ] **`animals.version`** (S3-T6) in this PR's migration, **rehearsed on a child branch**
      before production. Edits compare-and-set on `version`; listing moves keep their own guard.
- [ ] **Migration 0011 frozen before any rehearsal** (RS-R1): the PR names the commit holding the
      final 0011, and anything later goes in 0012. After the rehearsal, `pnpm --filter @opika/db
      db:check-hashes` against the rehearsal branch prints `match` for 0011 (its recorded hash
      equals the committed file's).
      **Frozen at 6b7fa12** (unchanged since; `drizzle-kit generate` reports no schema drift), and
      `check-migration-hashes.test.ts` pins its hash, so an edit fails CI instead of a rehearsal.
      **On production 2026-10-13** (ep-dawn-pond-b1dz515g, Oleksii, RG-R4): `db:check-hashes` 12/12
      match; 12 migrations; animals 18, all `version` 0; `support_sessions` and
      `invitation_created_users` exist, 0 rows; shelters 2, auth users 0.
- [ ] **The registry answers 503 without `LOCATION_HMAC_SECRET`** (RG-Q10) while the kabinet is
      unavailable. Shelter create and address changes recompute the public location with that
      key. `apps/web/src/api/env.ts`'s required production schema does not gain it here.
- [ ] **`pnpm --filter @opika/db location:verify`** exists (RG-Q10): read-only, behind the production
      guard, prints the host, recomputes every shelter's public location with the configured key,
      prints counts only, and exits non-zero on any mismatch. Seeded rows are classified by
      identity, not by key (RG-Q11): a seed-range id (`51000000-…`) on the test-only key counts
      as `demo` on its own line and passes; the test-only key on any other id is a separate
      `PRIVACY` failure. One test per path.
- [ ] **The registry's multi-step writes run on a real Neon branch** (Oleksii, verbatim, 2026-10-13: "I'll
      create a fresh child branch, rehearsal-0011, and give you its endpoint id. Run 0011 there with
      --expect <that endpoint>, then the registry's multi-step write tests against the same branch.
      Report the counts."), through the production driver
      (neon-http), each statement named (review of the registry handlers, finding 6):
      `applyAuditedMany` (UNION ALL history rows + the at-shelter animals CTE), `createWithHistory`,
      `removeMember` (membership + sessions + history), `withdrawPending`, `createInvitation` and
      `resend` with their history rows, support `touch` (`make_interval`), and the S1 list's
      row-comparison keyset. Counts reported.
      **Run 2026-10-13 on rehearsal-0011 (ep-crimson-pine-b1ka29bi):** 0011 applied, `db:check-hashes`
      12/12 match (0011 included), `db:neon-smoke` 14 passed / 0 failed.
- [ ] Invitations go only through `kabinetInvitationRepo`, with the operator's own user as the
      inviter (HS-Q7). The end-to-end accept test passes on the pinned better-auth.
- [ ] *Existing invariant (HS-Q7, already tested):* the organization plugin keeps `allowUserToCreateOrganization: false`.
      `FORWARDED_AUTH_PATHS` gains no organization path until the invite PR forwards
      accept-invitation on purpose.
- [ ] *Existing invariant (HS-Q3, already tested):* `no-self-serve-yet.test.ts` stays green. Nothing here lets a real shelter sign in;
      production still answers 503 (no sender).

## Invite PR (after the registry PR)

The first PR in which a real shelter can sign in (HS-Q3). Tier 1.

- [ ] **The `/prytulkam` A1–A3 and B1 copy is live in this PR** (HS-Q3, commitments #6 and #7,
      `docs/h2-copy-sheet.md`). A false commitment sentence must never be live.
      `no-self-serve-yet.test.ts` is changed here, which is the signal. **A2 is the exception**
      (EM-Q1, Oleksii 2026-10-14, verbatim: "(b). A2 keeps the current text; the new paragraph ships
      in the commit that turns production sign-in on."): #94 leaves it unchanged; see the wiring
      commit's item below.
- [x] **Magic-link provider:** Brevo (IN-E2, 2026-10-13), Resend the documented fallback, not set
      up. Gmail delivery test by `email:delivery-test` (IN-E5); ukr.net/i.ua postponed with a trigger
      (IN-E4); apex DMARC `p=reject` is a follow-up (IN-E3).
- [ ] **An invitation reaches the invitee.** The registry PR's `registry.admins.invite` and
      `registry.shelters.create` write the invitation and the invitee's user but send nothing
      (no provider yet). This PR decides how the invitee hears of it (an invite email through the
      provider, or the operator telling them and them signing in by magic link) and tests it.
- [x] **`/kabinet` page loads are rate limited** (inbox KS-Q3, answered as KH-Q8): built on
      `feat/h2-kabinet-hardening`. `proxy.ts` charges every `/kabinet` page load against the
      kabinet limiters (per IP, then per user), keyed as the API keys them, and answers 429.
- [ ] **Shelter writes stay refused** (KH-Q1): `SHELTER_WRITE_POLICY` stays
      `refused_until_edit_screens` in this PR. Production sign-in turning on does not open them;
      only the K2/K3 PR does, together with the A1/A2/B1 replacement copy.
- [ ] **`CRON_SECRET` is set before the hardening branch deploys** (KH-T6): Oleksii sets it
      (`openssl rand -hex 32`) in Vercel's Production environment first; production refuses to
      boot without it. Then the daily auth clean-up (KH-Q9) runs at 03:00 UTC.
- [ ] **The /pro `about.data` sentence lands in #94, after Oleksii's final yes** (KH-C1,
      provisional draft in the hardening inbox), with the cron already shipped. Not in `uk.ts`
      before then.
- [ ] **Real-Neon run of the auth clean-up statement** (KH-Q9): `db:neon-smoke` step 15 on a
      disposable branch, before the /pro sentence is called true.
- [ ] **Real-Neon run before the production 503 lifts** (HS-T4, HS-T4b, HS-Q12): sign-in,
      verify, getSession, accept-invitation, the audited-write CTE, the listing jsonb
      compare-and-set, the deleteDraft 23503 catch, and the `last_updated_at` round-trip
      (S3-T6).
- [x] **#94's statements on real Neon** (IN-Q9), Oleksii's run of 2026-10-14 as relayed by the
      coordinating session: `db:neon-smoke` on `smoke-invite` (`ep-calm-math-b1ffs8rq`, a fresh
      child of the production branch), run from the invite worktree: **16 passed, 0 failed**. Step 15
      (the accept): accepted, then `nothing_to_accept` on re-run; 1 membership, 1 `admin_joined`
      (idempotent on real Neon). Step 16 (the one-membership conflict on the neon-http driver):
      typed `membership_conflict`, the invitation stays pending.
- [ ] **Step 17, the duplicate-invitation cancel (IN-T12), on real Neon:** added after that run
      (two pending invitations to one shelter → accept → newest accepted, older canceled, none
      pending); passes locally on postgres-js only. Oleksii reruns it on `smoke-invite` (it lives
      until 2026-10-21). Since the default branch (#95) merged in, the smoke also runs #95's auth
      clean-up as step 18, so the rerun reads 18/18; steps 17 and 18 passing closes this item.
- [ ] **The location key reaches the app, verified first** (RG-Q10; Oleksii, verbatim: "Invite PR
      rollout checklist, before the env schema change: I set the secret in Vercel (same value as
      the onboarding script's), then run location:verify against prod with that value → must
      report 0 mismatches."), in this order, **before** the env schema change below:
  1. Oleksii sets `LOCATION_HMAC_SECRET` in Vercel (production), the same value the onboarding
     script uses
  2. Oleksii runs `location:verify --prod` against production with that value: **0 mismatches**
     and no `PRIVACY` line. A `demo` count is expected while the seeded corpus is on production.
- [ ] *Not a blocker, a note:* the `demo` line goes to 0 when the demo corpus is removed at the
      first real shelter (RG-Q11). From then on, any `demo` count means seeded rows survived that
      removal, which is a finding in its own right.
- [ ] **`LOCATION_HMAC_SECRET` joins the required production env schema** (RG-Q10) in
      `apps/web/src/api/env.ts`, only after the step above. The same change rewrites the comments
      that say it is never in Vercel (`env.ts`, `onboard-shelter.ts`'s R2 note), which become false.
- [ ] **A production build fails without the five sign-in variables** (IN-R2, Decision 1;
      Oleksii, verbatim: "From the commit that turns sign-in on: A production build fails if any of
      the five variables is missing, so a bad deploy never goes live. Keep the runtime boot check as
      a second guard. Until that commit, nothing changes."): `EMAIL_PROVIDER`,
      `EMAIL_PROVIDER_API_KEY`, `EMAIL_FROM_ADDRESS`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (plus
      `PRODUCTION_ORIGIN`, which they are checked against), in the wiring commit, with a test.
      Whether `PRODUCTION_ORIGIN` itself joins the build-time check (a sixth variable, beyond
      Decision 1's five) is decided in the wiring commit's Phase 0 (review pass 2, finding 4).
      **`EMAIL_REPLY_TO` is now required by `emailProviderConfigOf`** (Oleksii, 2026-10-14, answer 5:
      "Reply-To: hello@opika.org.ua on all emails"), so sign-in stays off without it; whether it
      joins the build-time list too is the same Phase 0 question as `PRODUCTION_ORIGIN`.
- [ ] **The wiring commit turns production sign-in on through `productionSignInOf`**, which now also
      stays off while any `kabinet.*` string (email templates included) is `[COPY PENDING]`
      (Oleksii, answer 7). That commit wires the provider-backed invitation sender with
      `cachedBlockList(config)` built once per process, so `registry.admins.blockedAddresses` reads
      Brevo instead of answering `unknown` (`unsupported_provider`).
- [ ] **A2's new third paragraph ships here (EM-Q1)**, in the wiring commit itself (Oleksii,
      verbatim: "(b). A2 keeps the current text; the new paragraph ships in the commit that turns
      production sign-in on."). His provisional text is on `docs/h2-copy-sheet.md` A2; it still needs
      his final yes. The same commit updates `copy-status.test.ts`'s A2 pin, commitments row 6 in
      `docs/standing-constraints.md` and the `docs/marketing/brand-voice.md` note.
- [ ] **The runtime boot check stays as the second guard** (IN-R2, Decision 1): production refuses
      to boot without them from the same commit, tested.
- [x] **The one-membership unique violation is a typed error, never a 500** (IN-Q8, IN-T1): in the
      PR that first writes `auth_member` (auto-accept on first sign-in), `auth_member_user_id_unique`
      maps to `ADDRESS_HAS_A_ROLE` (`shelter_admin`), with a test that accepts two invitations for one
      address and asserts the typed refusal. Built in #94 (`kabinetInvitationAcceptRepo`), tested on
      postgres-js, and verified on neon-http by the real-Neon smoke's step 16 above.
- [ ] **`registry.admins.invite` refuses an operator's address** (RG-T10; Oleksii, verbatim: "RG-T10:
      accepted as an invite-PR item. It must land before admin:bootstrap."), so inviting an operator can
      never end in `conflicting_roles`. Lands before the rollout's `admin:bootstrap` step.
- [ ] **`www.opika.org.ua` redirects 308 to the apex** (IN-R2, Decision 2): a Vercel domain setting,
      Oleksii's action before sign-in goes live; `PRODUCTION_ORIGIN` is `https://opika.org.ua`.
- [ ] **Production rollout order** (RG-Q2, superseding HS-Q13's; Oleksii, verbatim: "Rollout order
      becomes: invite merged → admin:bootstrap → I sign in → first shelter invite."), after the
      registry PR has merged:
  1. invite PR merged
  2. `admin:bootstrap <email>` on production (creates Oleksii's user and grants super_admin, once)
  3. Oleksii signs in on production
  4. first shelter invite

  Full order as restated 2026-10-13 (IN-E1, verbatim): "LOCATION_HMAC_SECRET + location:verify →
  provider, DNS and auth env → Neon run → merge → admin:bootstrap → sign-in → first invite → demo
  corpus removed." Status of "provider, DNS and auth env": **provider and DNS done for Brevo**
  (`mail.opika.org.ua` authenticated, DKIM and DMARC `p=none` in place, sender verified); **auth
  env still pending** (`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `EMAIL_*`, `PRODUCTION_ORIGIN` in
  Vercel).

  HS-Q13's earlier order ("… → I sign in → admin:grant on my own user → …") couldn't run: sign-up is
  off, so no production user exists to sign in or to grant (RG-Q2).
