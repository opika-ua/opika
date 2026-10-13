# H2: what the next two PRs must carry

Order decided by Oleksii, 2026-10-13: **the registry PR first, the invite PR after it.** Each
section below is copied into that PR's checklist when it opens. A box here is a merge blocker
unless it says otherwise. Sources are inbox rows in `docs/decisions-inbox.md`.

---

## Registry PR (next)

Serves `registryContract`: `registry.*` plus `session.exitSupport` (HS-Q1). Tier 1: Phase 0
questions go to Oleksii before code.

- [ ] **`admin:grant` / `admin:revoke`** (HS-Q4, HS-T11: a merge blocker here). Behind the
      production guard. `admin:grant` prints the host and the target email, asks for
      confirmation, and refuses unless the user already exists. `admin:revoke` sets `revoked_at`
      and never deletes (HS-T2).
- [ ] **`animals.version`** (S3-T6) in this PR's migration, **rehearsed on a child branch**
      before production. Edits compare-and-set on `version`; listing moves keep their own guard.
- [ ] Invitations go only through `kabinetInvitationRepo`, with the operator's own user as the
      inviter (HS-Q7). The end-to-end accept test passes on the pinned better-auth.
- [ ] The organization plugin keeps `allowUserToCreateOrganization: false`.
      `FORWARDED_AUTH_PATHS` gains no organization path until the invite PR forwards
      accept-invitation on purpose.
- [ ] `no-self-serve-yet.test.ts` stays green. Nothing here lets a real shelter sign in;
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
- [ ] **Production rollout order** (Oleksii, verbatim: "registry merged → invite merged → I sign
      in → admin:grant on my own user → first shelter invite. (admin:grant requires an existing
      user, and prod users only exist once the email provider is live.)"):
  1. registry PR merged
  2. invite PR merged
  3. Oleksii signs in on production
  4. `admin:grant` on his own user
  5. first shelter invite
