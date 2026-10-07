# H2 — kabinet contract shapes: handoff to Opus

Investigated and resolved on Sonnet (reconciliation + every decision Oleksii gave), handed off here
per `docs/model-policy.md`'s explicit assignment ("M1 contracts + domain | Opus | Type design. Every
later milestone inherits these shapes") — same reasoning already applied to G4's spring physics and
R5's seen-set query this session. **Nothing below is implemented. Propose the shapes for Oleksii's
review before writing any `packages/contracts`/`packages/domain` code**, per H2's own requirement
(`docs/handoff-2026-10-04.md` §3.1).

Read, in this order, before drafting anything:
1. `docs/design/KABINET.md` — the design, now corrected to match every decision below (2026-10-07).
2. `docs/kabinet-contract-decisions.md` — the reconciliation and every decision, with Oleksii's own
   reasoning quoted where he gave it.
3. `docs/handoff-2026-10-04.md` §3.1 — H2's original scope (actors, routes, must-nots, the
   non-negotiable test list).

This document is the delta: the specific shapes that still need designing, each with exact file
citations so a fresh session doesn't need to re-search for them.

---

## 1. `EvidenceItemSchema` — one field added, one considered and rejected

`packages/domain/src/shelters/verification/evidence.ts`. `edrpou_registration` gains
`registeredName: z.string().min(1)` — the ЄДР-registered name at the time evidence was checked, shown
beside the shelter's own name/the bank evidence's `holderName` so a reviewer can actually compare them
(the point of asking for it at all). No `edrStatus` — decided against, goes stale. `bank_account_holder`
is unchanged (`holderName` + `documentKey`, already correct — the design was wrong, not the schema).

Mechanical: this is one field on one variant of an already-stable discriminated union. The main judgment
call is whether `registeredName` is ever optional (a shelter whose registered name is identical to its
display name — still worth requiring, or can it be omitted then?) — Oleksii didn't say; default to
required unless there's a real case for null.

## 2. Shared evidence-input schema — extract, don't duplicate

`packages/db/src/onboard-shelter.ts:185-235` already has `OnboardEvidenceItemSchema` and
`toEvidenceItem()` — an operator-friendly input shape (no `ModeratorId`/`submittedAt` asked for, both
filled in by the caller) that already covers all 5 evidence kinds correctly, including the
`bank_account_holder` shape Oleksii just confirmed is right as-is. It needs:
- **Extraction to a shared module** both `onboard-shelter.ts` (the script) and the future kabinet S2
  evidence-entry procedure import — one schema, two callers, per Oleksii's own instruction. Likely home:
  alongside `evidence.ts` in `packages/domain/src/shelters/verification/`, since it's pure Zod + a pure
  conversion function, no I/O — matches that package's existing constraint (no dependency beyond Zod).
  Decide the exact export name/module path.
- **The `registeredName` addition from §1** needs to flow through `OnboardEvidenceItemSchema`'s
  `edrpou_registration` variant and `toEvidenceItem()`'s mapping too — both the script's own input
  files (not committed, operator-supplied) and the kabinet form need to supply it now.
- **`toEvidenceItem()`'s `now`/`moderatorId` fill-in needs a second caller path.** Today it's hardwired
  to `FOUNDER_MODERATOR_ID` (`onboard-shelter.ts:148-150`, "no real moderator login system yet" — which
  H2 is the system that fixes). The script keeps using `FOUNDER_MODERATOR_ID` (it still has no login);
  S2's handler needs to pass the *real* authenticated super_admin's moderator id instead. Design the
  function signature so both callers are natural, not one as an awkward special case of the other.

## 3. Donation pending-approval — a new, small, additive shape

Not a verification-FSM change — checked, and no existing transition does "stay live, flagged for
re-check" (`packages/domain/src/shelters/verification/transition.ts`'s own comment: `verified ->
under_review` is closed on purpose, "a verified shelter moved back to review would silently vanish from
the feed with no record it had ever been verified"). This is a value-level proposal/approve pair on
`Shelter` itself, independent of `ShelterVerification`.

Needs:
- A shape for "a proposed donation link awaiting approval" — `docs/kabinet-contract-decisions.md` §5
  suggests `{ url, proposedAt }` or similar; decide whether `provider` (mirroring `DonationLinkSchema`'s
  own field, `packages/domain/src/shelters/donation.ts:23-26`) is derived the same way or also proposed.
- Where it lives: a new nullable field on `Shelter` (e.g. `pendingDonation: PendingDonationSchema |
  null`), not a separate table — this is a single in-flight proposal per shelter, not a history.
- **`PublicShelterSchema` must never expose it** — `pick`, never `omit` (`docs/standing-constraints.md`),
  so adding a field to `Shelter` is safe by construction only if the public schema's own `pick` list is
  checked, not assumed safe.
- Procedures: propose (shelter_admin, own shelter only), cancel-own-proposal (shelter_admin), approve /
  reject (super_admin only) — approve copies `pendingDonation.url` into `donation` and clears the
  pending field in one write; reject just clears it. Neither needs a reason (per the design's own N20 —
  "this isn't a state-machine transition, just a value swap").

## 4. Audit log — a new concept, minimal scope

Records shelter_admin edits to **contacts and the voice sentence only** (`docs/kabinet-contract-
decisions.md` §5 — donation is handled by §3's pending-approval pair instead, not double-logged the
same way). Visible to super_admin on S1/S4 (`docs/design/KABINET.md`'s N23).

Needs:
- An entry shape: who (shelter_admin's id), when, what changed. Decide whether "what changed" is a
  free-text description, a structured `{field, oldValue, newValue}`, or a diff — a structured shape is
  more useful for future tooling but costs more to build correctly across different field types
  (contact is itself a union of channels, `ContactChannelSchema`); a plain description string is cheaper
  and may be enough for what N23 actually needs (a human-readable history list, not a revert feature).
- Storage: likely its own table (`shelter_audit_log` or similar) rather than a field on `Shelter` — it's
  an append-only history, not current state.
- Whether this applies to *any* future shelter-editable field automatically, or is hand-wired per field
  today (contact, voice sentence) — given H2's own scope is exactly those two fields, hand-wired is
  probably right; don't build a generic field-level audit framework for two call sites.

## 5. Pause/resume — mostly wiring, not new type design

The FSM already has `pause`/`resume` events and the `verified <-> paused` transition
(`transition.ts:122-139`, `:141-150`). This is lower-risk than §1–4: the new work is a kabinet
procedure (`shelters.pause`/`.resume` or similar) that calls the existing `transition()` with a `pause`/
`resume` event, **authorized for shelter_admin on their own shelter only** — distinct from `suspend`/
`reinstate`, which must stay super_admin-only. Worth including in the authorization-matrix test
(`docs/handoff-2026-10-04.md` §3.1's "non-negotiable" list) precisely because it's the one FSM-mutating
action a non-operator can call at all.

## 6. The kabinet router itself — procedures, actors, auth context

Not drafted at all yet. Needs, at minimum:
- The full procedure list implied by `docs/design/KABINET.md`'s routes (K1–K5, S1–S5) and the items
  above — animal CRUD for shelter_admin, shelter CRUD + verification actions for super_admin, the new
  pause/resume/donation-approval/audit-log procedures.
- How `context` carries actor identity — Better Auth's `organization` plugin gives an org membership;
  decide how `context.actorRole` (`shelter_admin` | `super_admin`) and `context.shelterId` (for
  shelter_admin, their one org) are derived and threaded through, matching the pattern
  `context.adopterId` already sets for the anonymous-session side of this codebase.
- The authorization matrix itself (every procedure × every actor × own/other shelter) — `docs/handoff-
  2026-10-04.md` §3.1 calls this out as the one non-negotiable table test for H2; design the procedure
  list with that table in mind from the start, not as an afterthought once procedures exist.
- Output schemas: the admin router needs its own, never reusing `PublicShelterSchema` with extra fields
  bolted on (H2's own scope document already says this explicitly).

## 7. One loose end from the reconciliation, not a contract shape

`uk.medical`'s third option for the vaccination/spay-neuter edit control needs one new i18n key — the
existing `uk.medical.shelterDeclared` ("Слова притулку") is a *display* badge, not an action a shelter
admin would click. Oleksii didn't name a replacement; propose one (e.g. `uk.medical.confirm`,
"Підтверджено") alongside the contract shapes, or leave it for him to pick — not blocking the type
design itself, since the display path (`vaccinationRow`/`spayNeuterRow`) is unchanged either way.

---

## What's confirmed out of scope — don't design for these

- `documentReadiness` editing (stays `{kind: "unknown"}`, no UI).
- Shelter self-submission of verification evidence (operator-entered only, via S2).
- CSV import in the UI (the script stays the bulk path).
- A `re_review` FSM state (future work; legal-data edits get the audit log, not a new transition).
- Any engagement-number surface, messaging, payment UI, or ranking control (`docs/design/KABINET.md`'s
  "Hard product constraints", unchanged from H2's original scope).
