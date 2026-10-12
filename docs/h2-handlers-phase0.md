# H2 handlers slice: Phase 0 questions

**Status:** questions for Oleksii, 2026-10-13. No code until they're answered (Tier 1: auth,
sessions, a migration with production data, and the `/prytulkam` commitments).

**Why this slice, and why on #85:** S3-Q3 → B. PR #85 merges only once the 16 cross-tenant
tests are real tests over real handlers, with the ownership-filter breakage in the mutation list.
So this slice is whatever makes those 16 tests possible: an authenticated shelter actor, the
ownership check, and the 16 `shelter.*` handlers.

Already settled (not asked again):
- Better Auth 1.6.x with the `organization` plugin, magic link only for the kabinet (ADR §Auth,
  proposal §2).
- Adopters keep the hand-rolled anonymous session (decision #13).
- `KabinetActor` = `super_admin | shelter_admin | support_view` (proposal §2), with `support_view`
  as its own variant rather than impersonation.
- Better Auth issues UUID ids. The magic-link endpoint answers identically for any address.
- 60 s resend lockout, 15-minute link expiry, 72 h invite expiry (KABINET N1, proposal §4).
- Every audited write is one conditional statement (`WITH upd AS (UPDATE … WHERE guard
  RETURNING …) INSERT INTO shelter_history …`), because neon-http has no transactions
  (proposal §3). It gets verified against real Neon.
- Cross-tenant answers FORBIDDEN (S3-Q2). An id that exists nowhere answers NOT_FOUND.
- Email: Resend or Postmark, never self-hosted SMTP (ADR §12). Which one is open (Q2).

---

## Q1. What lands on #85, and how half a kabinet is served

oRPC's `implement(contract).router()` requires every procedure in the contract to be served.
The 16 cross-tenant tests need only the `shelter.*` handlers. The 18 `registry.*` handlers and
`session.exitSupport` are the later registry and support PRs (proposal §8, PRs 5–6).

- **A (recommended):** split `kabinetContract` into `shelterKabinetContract` (`shelter.*`) and
  `registryContract` (`registry.*` + `session.exitSupport`). #85 serves the shelter one in full,
  with Better Auth, the actor, the ownership check, the 16 handlers and their tests. The registry
  contract stays unserved until its own PR serves all of it. Each router is complete when
  mounted, and none is a stub.
- **B:** keep one `kabinetContract`, and #85 grows until all 35 procedures are served, including
  registry, invites, support mode and the evidence step. That is most of H2 in one PR.
- **C:** serve all 35, with registry handlers that throw for now. Rejected: a stub answering a
  real route is exactly the half-wired code `CLAUDE.md` warns about.

**Consequence of A:** a shelter admin can't come into existence in production through the product
until the registry PR (invites). The 16 tests create memberships through fixtures.

## Q2. Email provider, and whether #85 needs one at all

Under Q1-A, nobody can be invited on #85, so no real email is ever sent from it.

- **A (recommended):** #85 ships a `MagicLinkSender` interface. Tests capture the link, and in
  local dev it is printed to the console. In production, the kabinet's sign-in procedure answers
  503 when no sender is configured, rather than pretending to send. The provider is chosen and
  wired in the registry PR, alongside invites, which is the first thing that emails a real
  person.
- **B:** choose the provider now (Resend or Postmark) and wire it on #85. That means a new
  dependency, a new secret and DNS (SPF/DKIM) work, for a sign-in nobody can use yet.

**If A:** the provider question comes back to you, with its trade-offs, at the registry PR.

## Q3. When does "self-serve shipped" happen, for the `/prytulkam` copy gate?

`/prytulkam` §7/§9/§10 (commitment #6) and the «оновлювали» sentence (commitment #7, copy sheet
B1) go false on the day a shelter can edit or confirm its own listings. Your rule: that copy
must land before the self-serve merge, never after.

Under Q1-A, #85 serves `shelter.*` in production, but no shelter account can exist: there are no
invites, the only route to a membership is fixtures in tests, and there is no kabinet UI. Every
real caller gets UNAUTHENTICATED.

- **A (recommended):** the gate is the first PR in which a real shelter can sign in, which is the
  registry/invite PR or the K-screens PR, whichever completes that path. #85 can merge without
  A1–A3 and B1, and a test pins that nothing outside tests can create a `shelter_admin`
  membership.
- **B:** the gate is #85, because its handlers are deployed and reachable. A1–A3 and B1 must be
  written before #85 merges.

**This is a user-facing-claim question, so I won't take a default.**

## Q4. Bootstrapping the first super_admin

super_admin is a platform role on the user record (proposal §2), not an org role. Today there is
no way to create one.

- **A (recommended):** a script, `pnpm --filter @opika/db run admin:grant -- --email …`. It needs
  `--prod` for production, like every writing script (prod guard), and it is the only path that
  sets the role. Granting is logged to stdout. There's no UI, no endpoint and no environment
  variable allow-list.
- **B:** an env allow-list (`SUPER_ADMIN_EMAILS`), checked at sign-in. This is simpler to run,
  but it makes an env var an authorization source, and a typo in a deploy grants or locks out
  silently.

## Q5. Magic-link abuse limits

N1 fixes the per-address resend lockout at 60 s. The open question is the rest: the sign-in
endpoint sends email to any address typed in, so it is an email-bombing and enumeration surface.

- **Recommended:** per address, 5 links an hour; per IP, 20 sign-in requests an hour. Both run on
  the existing shared Upstash limiter (ADR §12, in-memory fallback locally), not Better Auth's
  per-instance one. Over the limit, the endpoint gives the same response as success (no
  enumeration), and the link simply isn't sent.
- Or name your own numbers.

## Q6. Migration 0009 (for confirmation, not choice)

The slice needs:
- Better Auth's tables: `user`, `session`, `account`, `verification`, `organization`, `member`,
  `invitation`, generated into `packages/db`'s Drizzle schema and reviewed by hand;
- `shelters.organization_id` (unique FK, nullable until a shelter is invited);
- `users.role` for super_admin;
- `shelter_history` (its first writer is `shelter.profile.updateContact`).

It follows the 0008 rule: a real child branch first, then production with your separate OK,
before #85 merges. The only question is whether the history table should wait for the registry
PR instead. **Recommended: no.** `updateContact` and `updateFreshnessSentence` are in the 16 and
must write history from day one, or the first edits go unrecorded.

---

## Decisions, 2026-10-13

Answers verbatim in the inbox (HS-Q1–HS-Q6). Their effect on the slice:

- **Q1 → A.** The contract is split into `shelterKabinetContract` and `registryContract`. #85
  serves the 16 `shelter.*` procedures with real handlers. No stubs.
- **Q2 → A.** `MagicLinkSender`: tests capture, dev prints, production answers 503 with no sender.
  The provider is decided in the invite PR by a real delivery test to Gmail, ukr.net and i.ua.
- **Q3 → A.** The gate is the first PR where a real shelter can sign in. The "no membership outside
  tests" test names the `/prytulkam` keys it protects (A1–A3, B1, §7/§9/§10) in its title and
  message.
- **Q4 → A, plus:** `admin:grant` prints the host and the target email and asks for confirmation.
  It refuses unless the user already exists. `admin:revoke` ships alongside it.
- **Q5 → as proposed.** The email is trimmed and lowercased before it keys the limiter.
- **Q6 → one 0009, including `shelter_history`.**
  - Better Auth's tables are prefixed `auth_` so none can be confused with the adopter
    `sessions` table.
  - `shelter_history`'s columns are pinned by an exact-field test: no adopter, reveal or swipe
    data, ever.
  - Order: 0008 rehearsal → 0008 production (done, 2026-10-13) → 0009 rehearsal on a fresh child
    branch.
