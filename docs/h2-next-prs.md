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
- [ ] **Real-Neon run before the production 503 lifts** (HS-T4, HS-T4b, HS-Q12): sign-in,
      verify, getSession, accept-invitation, the audited-write CTE, the listing jsonb
      compare-and-set, the deleteDraft 23503 catch, and the `last_updated_at` round-trip
      (S3-T6).
- [ ] **Production rollout order** (RG-Q2, superseding HS-Q13's; Oleksii, verbatim: "Rollout order
      becomes: invite merged → admin:bootstrap → I sign in → first shelter invite."), after the
      registry PR has merged:
  1. invite PR merged
  2. `admin:bootstrap <email>` on production (creates Oleksii's user and grants super_admin, once)
  3. Oleksii signs in on production
  4. first shelter invite

  HS-Q13's earlier order ("… → I sign in → admin:grant on my own user → …") couldn't run: sign-up is
  off, so no production user exists to sign in or to grant (RG-Q2).
