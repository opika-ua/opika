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
      `no-self-serve-yet.test.ts` is changed here, which is the signal.
- [ ] **Magic-link provider** chosen by a real delivery test to Gmail, ukr.net and i.ua (HS-Q2).
- [ ] **An invitation reaches the invitee.** The registry PR's `registry.admins.invite` and
      `registry.shelters.create` write the invitation and the invitee's user but send nothing
      (no provider yet). This PR decides how the invitee hears of it (an invite email through the
      provider, or the operator telling them and them signing in by magic link) and tests it.
- [ ] **Real-Neon run before the production 503 lifts** (HS-T4, HS-T4b, HS-Q12): sign-in,
      verify, getSession, accept-invitation, the audited-write CTE, the listing jsonb
      compare-and-set, the deleteDraft 23503 catch, and the `last_updated_at` round-trip
      (S3-T6).
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
- [ ] **Production rollout order** (RG-Q2, superseding HS-Q13's; Oleksii, verbatim: "Rollout order
      becomes: invite merged → admin:bootstrap → I sign in → first shelter invite."), after the
      registry PR has merged:
  1. invite PR merged
  2. `admin:bootstrap <email>` on production (creates Oleksii's user and grants super_admin, once)
  3. Oleksii signs in on production
  4. first shelter invite

  HS-Q13's earlier order ("… → I sign in → admin:grant on my own user → …") couldn't run: sign-up is
  off, so no production user exists to sign in or to grant (RG-Q2).
