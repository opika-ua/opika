# H2 registry PR: Phase 0 questions

**Status:** questions for Oleksii, 2026-10-13. No code until they're answered (Tier 1: operator
access, account bootstrap, a migration, support-mode sessions).

**Scope, already decided** (`docs/h2-next-prs.md`):
- serve `registryContract`, which is 18 `registry.*` procedures plus `session.exitSupport`;
- `admin:grant` / `admin:revoke`, a merge blocker (HS-T11);
- `animals.version` in this PR's migration, rehearsed on a child branch (S3-T6).

oRPC can only mount the router when all 19 procedures are served, so there are no partial
routers and no stubs (HS-Q1).

Settled and not asked again:
- **Invitations:** written server-side by `kabinetInvitationRepo`, with the operator's user as
  inviter, and accepted through Better Auth's endpoint (HS-Q7).
- **`super_admins`:** one row per grant; revoke sets `revoked_at` (HS-T2).
- **Reasons:** a reject or suspend note is trimmed, then required, and shown to the shelter
  verbatim (S3-Q2).
- **History:** every registry write records history in the same statement (proposal §3).
- **Cross-tenant:** FORBIDDEN (S3-Q2).
- **Rate limits:** per user and per IP (HS-Q10).

---

## Q1. This PR: the API only, or the S-screens too?

KABINET S1-S5 is five operator screens, including the reason dialog, the decision panel, the
evidence step and the support bar. They need Ukrainian copy (`[COPY PENDING]`) and harness
coverage.

- **A (recommended):** the API only: the 19 procedures, the scripts, the migration and their tests.
  The S-screens are a separate PR once the API is merged, built from the mock, with their own copy
  sheet. Each PR stays reviewable, and the screens are built against a contract that's already
  served.
- **B:** API and screens together. One PR delivers the operator's whole workflow, but it is
  several times the size, and it mixes Tier 1 access code with UI.

## Q2. How does your own production user come to exist? (This collides with the rollout order.)

The rollout order says: invite PR merged → "I sign in" → `admin:grant` on my own user. But
sign-in has **sign-up switched off** (it was decided that users exist only because the operator
invited them). So the first sign-in on production finds no user and refuses, and `admin:grant`
refuses too, because it requires an existing user (HS-Q4). Nothing in the current design can
create the first user.

- **A (recommended):** `admin:create-user --email …`, a script behind the production guard, like
  `admin:grant`. It prints the host and the email, asks for confirmation, and creates the
  `auth_user` with no role. You then sign in by magic link and run `admin:grant`.
  - It's explicit and audited, and it's the only way a user exists other than an invitation.
  - The rollout order gains one step: create-user before "I sign in".
- **B:** `admin:grant --create`, so one script creates the user and grants in a single step. Fewer
  steps, but this script then both creates identities and grants the highest role at once.
- **C:** turn sign-up on for everyone, so roleless users can exist. This rejects the "users only
  by invitation" decision, and anyone whose inbox receives the link creates a row.

## Q3. Who creates an invited shelter admin's user?

The same gap, one level down. `registry.admins.invite` writes an invitation, but the invitee can't
sign in to accept it, because no user exists for that address.

- **A (recommended):** the invitation write also creates the invitee's `auth_user` (no role), in
  `kabinetInvitationRepo`, the one module that writes invitations. They can sign in at once, and
  stay roleless until they accept.
  - If an invitation expires unaccepted, the user remains, roleless and harmless. It is reused if
    they're invited again.
- **B:** a narrow Better Auth sign-up hook: let an address sign up only while it holds a pending
  invitation. No user exists before it's needed, but it is more moving parts inside Better Auth's
  flow, and it's harder to test.

## Q4. Support mode (S5): what a "support session" is

`registry.support.enter` turns a super_admin into a `support_view` of one shelter. The view is
read-only, ends after 30 minutes idle or when the tab closes, and `session.exitSupport` leaves it.
The `support_view` principal already exists in the access matrix; what's missing is where that
state lives.

- **A (recommended):** a `support_sessions` table: id, operator user id, shelter id, started,
  last seen, ended, plus its own HttpOnly `__Host-` cookie set by `enter` and cleared by `exit`.
  - Identity resolution reads it alongside the Better Auth session. Idle expiry follows the same
    pattern as decision #13's adopter session.
  - "Tab closes" is a session cookie (no Max-Age), so the browser drops it.
  - Every entry and exit is a row, so support viewing is auditable. It is a new table in this PR's
    migration.
- **B:** a field on Better Auth's session. No new table, but no record of who viewed which
  shelter, and a second meaning grafted onto Better Auth's session row.

## Q5. Evidence documents in `registry.shelters.create` and `resubmit`

`documentKey` points at registration paperwork, which needs the private evidence bucket (H2-6:
"its own sub-PR"). Until then, the operator script refuses any typed `documentKey`.

- **A (recommended):** the registry procedures refuse a non-null `documentKey` the same way, with
  INVALID_EVIDENCE and a new reason, `document_not_supported_yet`. The `supporting_document` type
  (a document is required there) is then unusable until the bucket PR. The other four types work.
- **B:** build the private bucket and the presigned upload in this PR. It is the work H2-6 put in
  its own sub-PR, and it would roughly double this one.

## Q6. Removing a shelter admin (`registry.admins.remove`)

- **Recommended:** removal deletes the membership and **revokes that user's sessions immediately**,
  so a removed admin's open tab stops working on the next request, not after 7 days idle.
  - Removing a shelter's last admin is allowed: the operator decides, and the shelter then simply
    has nobody signed in.
  - The user row stays (as in Q3).
- Or tell me if removing the last admin should be refused.

## Q7. `animals.version`: the contract change it brings (for confirmation)

S3-T6 replaces the edit guard. `shelter.animals.update`'s input changes from
`expectedLastUpdatedAt` to `expectedVersion`, and `KabinetAnimalView` gains `version`. Listing
moves keep comparing on the listing itself and **don't** bump `version`, so an edit form and a
«Ще шукає» still never conflict (HS-T8).

No client exists yet, so nothing breaks. **Recommended: as described.**
