# H2 registry PR: shapes for review

**Status:** proposal for Oleksii, 2026-10-13. `CLAUDE.md` requires `packages/domain` and
`packages/contracts` shapes to be reviewed before implementation. The Phase 0 answers are recorded
verbatim in `docs/decisions-inbox.md` (RG-Q1 to RG-Q8). This document is the
shapes those answers need. Two points need a choice: **RS-Q1** and **RS-Q2**, at the end.

Built meanwhile, because they need no new shape:
- `admin:bootstrap`, `admin:grant` and `admin:revoke` (RG-Q2, HS-Q4);
- `animals.version` and its edit compare-and-set (RG-Q7);
- the 18 registry procedures that write only history kinds that already exist.

---

## 1. New `ShelterHistoryEntry` kinds (domain)

Every operator write on a shelter is already recorded with the operator as actor. These are the
writes the union can't express yet:

```ts
| { kind: "shelter_created"; at: Date; moderatorId: ModeratorId; via: "registry" | "script" }
| { kind: "admin_invited";   at: Date; moderatorId: ModeratorId; email: string }
| { kind: "admin_invitation_resent"; at: Date; moderatorId: ModeratorId; email: string }
| { kind: "admin_removed";   at: Date; moderatorId: ModeratorId; email: string; wasPending: boolean }
| { kind: "animals_imported"; at: Date; moderatorId: ModeratorId; count: number }   // script import (RG-Q8)
```

- **`admin_removed`** covers RG-Q6 (removing an admin, the last one included), and removing a
  pending invite (RG-Q3's "revoke"). `wasPending` tells the two apart for the reader.
- **`animals_imported`** records a script's batch as one entry with a count, rather than one row
  per animal. The animals themselves already carry `createdAt`. The history answers "who entered
  data for us, and when", not a per-field diff.
- The seed script writes fictional data with a fictional moderator. It records the same entries,
  so demo history isn't empty.

## 2. What the shelter sees: `ShelterHistoryItemView` (contracts)

Built field by field from an entry (`pick`, never a spread). No evidence and no moderator ids
(RG-Q8). The actor is a union, not an id:

```ts
type HistoryActorView =
  | { kind: "operator"; displayName: string }   // from app config (RG-Q8), never from the row
  | { kind: "shelter" };                          // the shelter's own admin acted

ShelterHistoryItemView = discriminated union on `kind`, one variant per entry kind:
  verification            { at, actor, from, to, event: "start_review"|"approve"|"reject"|"resubmit"|
                            "suspend"|"reinstate"|"pause"|"resume", reason: <code + note> | null }
                            // resubmit's evidence and every moderator id are dropped
  contact_changed         { at, actor, previous, next }
  freshness_sentence_changed { at, actor, previous, next }
  description_changed     { at, actor, previous, next }
  donation_proposed       { at, actor, link }
  donation_proposal_cancelled { at, actor }
  donation_decided        { at, actor, decision, link, previousLive }
  verified_data_changed   { at, actor, change }          // their own legal entity/address
  shelter_created         { at, actor }
  admin_invited / admin_invitation_resent { at, actor, email }
  admin_removed           { at, actor, email, wasPending }
  animals_imported        { at, actor, count }
```

An exact-field test pins every variant's key set, as `KabinetAnimalRowView` does. A deep walk then
fails if any `moderatorId`, `evidence`, `reviewerId` or engagement field appears at any depth
(commitment #2).

## 3. The procedure: `shelter.history.list`

```ts
input  { cursor: KabinetCursor | null, limit }            // strict, like every kabinet input
output { items: ShelterHistoryItemView[], nextCursor }    // newest first, keyset (at, id)
access { surface: "shelter", mode: "read" }               // shelter_admin; a support view reads it too
errors UNAUTHENTICATED, FORBIDDEN, INVALID_CURSOR
```

This makes `shelterKabinetContract` 17 procedures. The cross-tenant suite gains a case: a smuggled
`shelterId` is BAD_REQUEST, and B's history doesn't appear.

## 4. ~~New error: `ALREADY_A_MEMBER` (409)~~ Superseded

Replaced by `ADDRESS_HAS_A_ROLE` in the invite PR: see `docs/h2-invite-shapes.md` §1 (IN-Q7, RG-T10).

`INVALID_EVIDENCE.data.reason` gains `document_not_supported_yet` (RG-Q5).

## 5. Support sessions (RG-Q4)

A `support_sessions` table: `id`, `operator_user_id` → `auth_user`, `shelter_id` → `shelters`,
`token_hash`, `started_at`, `last_seen_at`, `ended_at`.

- **Cookie:** `__Host-kabinet.support` in production, the bare name in dev. HttpOnly. No Max-Age, so
  it ends when the tab or browser closes.
- **Expiry:** 30 minutes idle, like decision #13's idle check.
- **Who can use it:** identity resolution turns a super_admin carrying a valid support session into
  `support_view` of that shelter. Anyone else carrying the cookie is unaffected.
- **Enter and exit:** `registry.support.enter` creates the row and sets the cookie;
  `session.exitSupport` ends the row and clears the cookie.
- Rows are never deleted, so who viewed which shelter, and when, stays auditable.

## 6. A user created by an invitation (RG-Q3)

`kabinetInvitationRepo` creates the invitee's user (no role) in the same write as the invitation.
It records that it did so in a table of its own, so Better Auth's tables are untouched:

```
invitation_created_users (user_id → auth_user, invitation_id → auth_invitation, created_at,
                          first_session_at null)
```

`first_session_at` is set by a Better Auth `databaseHooks.session.create.after`. That makes "no
sessions ever" a fact we hold, not something inferred from `auth_session`, whose rows disappear on
sign-out and expiry.

**Clean-up:** delete the created user when its invitation is revoked or has expired, **and** it has
no membership, **and** `first_session_at` is null. Better Auth's FK cascades then remove its
leftovers. **RS-Q1** asks when expiry clean-up runs.

## 7. The operator's display name (RG-Q8)

`KABINET_OPERATOR_DISPLAY_NAME`: app config, read only in `apps/web`, never stored in a row.

- Required whenever the kabinet is available. Without it the kabinet answers 503, as with no
  sender, so a history can't render an empty actor.
- **RS-Q2** asks whether it's an env var or a constant in the i18n catalogue.

---

## 8. The location key (RG-Q10)

The registry recomputes a shelter's public location (`publicLocationOf`, 1 km fuzz keyed on the
shelter id) on create and on any address change, with `LOCATION_HMAC_SECRET`. Without it the
registry answers 503 while the kabinet is unavailable; the invite PR makes it a required
production variable, after `location:verify` has shown the app's key reproduces every non-demo
stored location (demo rows are the seed's, on its test-only key, RG-Q11).

**Rotating this key is a data migration, not a config change.** Oleksii, verbatim (RG-Q10):
"rotating this key means recomputing every shelter's public location in one migration; it is not
a config-only change."

Our reasoning and procedure, not his words: every stored public location was computed with the
old key, so a new key alone leaves them stale, and the next address edit would move that one
shelter's pin to a new offset, handing anyone with both samples two draws of the fuzz (decision
#11). So the migration ships together with the new key, and `location:verify` against the new
key must report 0 mismatches afterwards.

## Questions

**RS-Q1: when does expiry clean-up run?** There is no scheduler in this stack.
- **A (recommended):** lazily, on every `registry.admins.*` call and on `shelter.history.list`, for
  that one shelter's expired invitations. One bounded query, nothing to schedule.
- **B:** an `admin:sweep-invitations` script you run when you like.
- **C:** both.

**RS-Q2: where the operator's display name lives.**
- **A (recommended):** an env var, `KABINET_OPERATOR_DISPLAY_NAME`. It's a person's name, not
  product copy, and it changes if the operator does.
- **B:** a message in the i18n catalogue, next to the other kabinet strings, so it is reviewed as
  copy.

---

## Decisions, 2026-10-13 (verbatim in the inbox: RS-Q0, RS-Q1, RS-Q2)

- **Approved (RS-Q0)**, with three amendments:
  - **`animals_imported` covers new animals only.** Checked: no script edits an existing animal.
    `onboard-shelter.ts` only inserts (an existing shelter and existing animals are skipped, with a
    warning if they differ), and `seed.ts` truncates and inserts. So no script path needs
    per-animal entries. If one ever edits an animal, it records per-animal history.
  - **`support_sessions` columns** are exactly: id, `operator_user_id`, `shelter_id`, `started_at`,
    `last_seen_at`, `ended_at`, `end_reason`. There is **no IP and no user-agent**, and rows are
    never deleted. §5's `token_hash` stays as the lookup key for the cookie (a hash, never the
    token, as decision #13): flagged here so the column list is complete, not slipped in.
  - **`invitation_created_users` with the `first_session_at` hook**: as proposed.
- **RS-Q1: lazy clean-up on `registry.admins.*` only.** `shelter.history.list` stays
  side-effect-free. **`admin:sweep-invites`** sits behind the production guard: a dry run prints
  what it would delete, and `--apply` deletes.
- **RS-Q2: `KABINET_OPERATOR_DISPLAY_NAME`**, in the nominative case only, and used only where the
  nominative fits (the history actor label). Sentences that need other cases stay catalogue keys.
  - **Missing var:** the fallback is «Оператор реєстру» from the catalogue, and the kabinet never
    fails to boot over it. This supersedes §7's "kabinet answers 503". A test covers the fallback.
