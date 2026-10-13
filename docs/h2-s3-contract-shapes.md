# H2 S3 — kabinet contract shapes: addendum for review

**Status:** approved by Oleksii 2026-10-12 with additions (inbox `docs/decisions-inbox.md`, S3-Q1/S3-Q2, verbatim); §8 records what the additions change. Originally a proposal, also 2026-10-12. `CLAUDE.md` requires `packages/contracts` shapes to be
reviewed before implementation. `docs/h2-contract-proposal.md` §4–§6 fixed the **procedure list**
and the **access matrix**, and Oleksii answered them. This addendum fills in what those sections
left as sketches: each procedure's exact input/output schema, the error set, the access-metadata
format, and the **H2-16 undo shape**, which the inbox explicitly left "for S3 to propose in detail".
Two questions at the end need answers; everything else follows from decisions already made.

S3 is contracts only (`packages/contracts` plus the domain pieces it needs). Handlers, Better Auth
and the matrix test against real handlers come in the next slice. Better Auth is not installed yet.

---

## 1. Access metadata: deny-by-default, declared on every procedure

```ts
// packages/contracts/src/kabinet/access.ts
export type KabinetAccess =
  | { surface: "shelter"; mode: "read" | "write" }   // shelterId from the actor
  | { surface: "registry" }                           // super_admin only; shelterId explicit
  | { surface: "support_exit" };                      // the one write a support_view may make

const kabinet = oc.$meta<{ access: KabinetAccess | null }>({ access: null });
```

The policy, which the next slice's middleware applies and the matrix test asserts by hand (proposal
§6):

| access | shelter_admin | support_view | super_admin |
|---|---|---|---|
| `shelter` read | own shelter | its target shelter | FORBIDDEN (must enter support) |
| `shelter` write | own shelter | **FORBIDDEN** | FORBIDDEN |
| `registry` | FORBIDDEN | FORBIDDEN | ✓ |
| `support_exit` | FORBIDDEN | ✓ | FORBIDDEN |

- **`access: null` is the builder's default, and a contract test fails on any kabinet procedure
  that still carries it.** A procedure can't ship without a declared policy (proposal §6's first
  guard).
- **Why a surface + mode, not a per-actor map:** the matrix has only these four shapes. A
  per-actor map on every procedure would repeat one of four rows thirty times, and a typo in one
  copy would be a silent hole.

## 2. Errors (added to `apiErrors`, each with its real HTTP status)

| Code | Status | `data` | When |
|---|---|---|---|
| `FORBIDDEN` | 403 | — | authenticated, wrong actor kind for this surface |
| `CONFLICT` | 409 | — | a compare-and-set lost (someone changed it first) |
| `ILLEGAL_TRANSITION` | 409 | `{ from, event }` | either FSM refused the move |
| `EVIDENCE_INSUFFICIENT` | 422 | `{ gaps: EvidenceGap[] }` | approve with `evidenceGaps` non-empty |
| `PUBLISH_REQUIREMENTS_UNMET` | 422 | `{ gaps: PublishGap[] }` | publish with `publishGaps` non-empty |
| `UNDO_EXPIRED` | 409 | — | `undoConfirm` after its window, or after a newer write |
| `INVALID_EVIDENCE` | 422 | `{ reason: "site_visit_in_future" \| "document_not_issued" }` | evidence input refused |

The existing `UNAUTHENTICATED` (401) is reused for "no kabinet session". `NOT_FOUND` is used for an
`animalId` belonging to another shelter, so a shelter admin learns nothing about other shelters' ids.

## 3. Views (output schemas, all `pick`-built, never `PublicShelterView` plus extras)

```ts
/** K2 row: just what the list shows. Inventory only, no engagement data (commitment #2). */
KabinetAnimalRowView = AnimalSchema.pick({ id, name, species, sex, size, listing, lastUpdatedAt })
  .extend({ coverPhoto: AnimalPhotoSchema.nullable(), freshness: FreshnessSchema.nullable(), publishGaps: PublishGap[] })

/** K3 edit form: every Animal field, listed explicitly. */
KabinetAnimalView = AnimalSchema.pick({ id, name, species, sex, size, age, description, photos,
  vaccination, spayNeuter, documentReadiness, listing, publicLocation, createdAt, lastUpdatedAt })

/** What a shelter sees of its own verification: no evidence, no moderator ids. */
ShelterFacingVerificationView = discriminatedUnion("status", [
  { status: "pending" | "under_review", since: Date },
  { status: "verified", since: Date },
  { status: "paused", since: Date, reason: PauseReason },
  { status: "rejected", at: Date, reason: RejectionReason },     // K5 shows reason.note verbatim
  { status: "suspended", at: Date, reason: SuspensionReason },
])

/** K4. Legal entity and premises address are shown read-only in the locked block. */
KabinetShelterView = ShelterSchema.pick({ id, displayName, description, legalEntity, exactAddress,
  contact, donation, pendingDonation, freshnessSentence }).extend({ verification: ShelterFacingVerificationView })

/** S1 row and S3/S4: operator-only, the full record. */
RegistryShelterRowView  = ShelterSchema.pick({ id, displayName, createdAt }).extend({
  status: VerificationStatus, cityId, animalCount: int })        // inventory, not engagement
RegistryShelterView     = ShelterSchema.pick({ id, displayName, description, legalEntity, publicLocation,
  exactAddress, contact, donation, pendingDonation, freshnessSentence, verification, createdAt, lastUpdatedAt })
  .extend({ admins: ShelterAdminView[] })
ShelterAdminView        = { id: ShelterAdminId, name, email, invite: { status: "pending", expiresAt } | { status: "accepted" } }
HistoryEntryView        = ShelterHistoryEntrySchema                // operator-only; already shape-only in S2b
```

A contract test asserts that **no kabinet view has a key outside its hand-written expected list**,
so no reveal, swipe or view count can creep in (commitment #2).

## 4. Procedures and their inputs

`shelterId` never appears in a `shelter.*` input: it comes from the actor. Writes that guard with a
compare-and-set take the version they read: `expectedVersion` (the shelter's integer `version`), or
the animal's `lastUpdatedAt`.

**This needs `Shelter.version: int`, which doesn't exist yet.** Proposal §3 chose an integer
version over a timestamp guard (a timestamp breaks at microsecond precision). S2b deferred the
column to "its first writer", and these contracts are what define those writers. So S3 adds it:
`version: z.int().nonnegative()` on `ShelterSchema`, a `shelters.version` column defaulting to 0
in the undo migration, and `version` picked into `KabinetShelterView` and `RegistryShelterView`
so a client can send back what it read.

| Procedure | Input | Output |
|---|---|---|
| `shelter.profile.get` | `{}` | `KabinetShelterView` |
| `shelter.profile.updateContact` | `{ contact, expectedVersion }` | `KabinetShelterView` |
| `shelter.profile.updateFreshnessSentence` | `{ freshnessSentence, expectedVersion }` | same |
| `shelter.profile.proposeDonation` | `{ url: https URL }` (provider derived) | same |
| `shelter.profile.cancelDonationProposal` | `{}` | same |
| `shelter.profile.pause` | `{ reason: PauseReason }` | same |
| `shelter.profile.resume` | `{}` | same |
| `shelter.verification.requestReview` | `{}` (resubmits current evidence, H2-2) | same |
| `shelter.animals.list` | `{ listing: ListingKind \| null, cursor, limit }` | `{ items: KabinetAnimalRowView[], nextCursor, counts: Record<ListingKind, int>, staleCount: int }` |
| `shelter.animals.byId` | `{ animalId }` | `KabinetAnimalView` |
| `shelter.animals.createDraft` | `{ name, species, sex, size, age, description }` | `KabinetAnimalView` |
| `shelter.animals.update` | `{ animalId, expectedLastUpdatedAt, patch: {…editable fields, vaccination/spayNeuter as MedicalDeclarationInput} }` | same |
| `shelter.animals.transition` | `{ animalId, event: ListingEvent minus "confirm" }` | same |
| `shelter.animals.confirm` | `{ animalId }` | `{ animal: KabinetAnimalView, undoUntil: Date }` |
| `shelter.animals.undoConfirm` | `{ animalId }` | `KabinetAnimalView` |
| `shelter.animals.deleteDraft` | `{ animalId }` | `{}` |
| `registry.shelters.list` | `{ search: string \| null, status: VerificationStatus \| null, cursor, limit }` | `{ items: RegistryShelterRowView[], nextCursor, counts }` |
| `registry.shelters.byId` | `{ shelterId }` | `RegistryShelterView` |
| `registry.shelters.create` | `{ displayName, description, legalEntity, exactAddress, contact, freshnessSentence, evidence: EvidenceItemInput[], firstAdmin: { name, email } }` (H2-1: S2 collects S4's sections) | `RegistryShelterView` |
| `registry.shelters.updateVerifiedData` | `{ shelterId, expectedVersion, change: { field: "legal_entity", next } \| { field: "exact_address", next } }` | same |
| `registry.shelters.updateProfile` | `{ shelterId, expectedVersion, contact?, description?, freshnessSentence? }` | same |
| `registry.verification.startReview` / `.approve` / `.reinstate` | `{ shelterId }` | same |
| `registry.verification.reject` | `{ shelterId, reason: { code: RejectionCode, note: string.min(1) } }` (H2-4: note required here) | same |
| `registry.verification.suspend` | `{ shelterId, reason: { code: SuspensionCode, note: string.min(1) } }` | same |
| `registry.verification.resubmit` | `{ shelterId, evidence: EvidenceItemInput[] }` | same |
| `registry.donation.approve` / `.reject` | `{ shelterId }` | same |
| `registry.admins.invite` | `{ shelterId, name, email }` | `ShelterAdminView` |
| `registry.admins.resendInvite` / `.remove` | `{ shelterId, adminId }` | `{}` |
| `registry.history.list` | `{ shelterId, cursor, limit }` | `{ items: HistoryEntryView[], nextCursor }` |
| `registry.support.enter` | `{ shelterId }` | `{}` |
| `session.exitSupport` | `{}` | `{}` |

The domain reason schemas keep `note` nullable. Requiring it for reject/suspend is a property of the
kabinet input, not of every stored reason.

## 5. H2-16: the undo shape (decided B; storage needs one answer)

Oleksii's decision, verbatim: "B, server-side undo accepted only within the window … The undo
restores the previous last_confirmed_at exactly (store it, don't recompute)."

Domain (`listing-transition.ts`):
- **`confirm` records what it replaced.** The published/reserved variants gain
  `undoable: { previousConfirmedAt: Date; confirmedAt: Date } | null`. `confirm` sets it, and every
  other event clears it. A `release` keeps the listing but drops the window.
- **`undo_confirm { at }` restores exactly.** It is legal only when `undoable` is set,
  `undoable.confirmedAt` equals the current `confirmedAt`, and `at` falls within
  `UNDO_WINDOW_MS` of it. It sets `confirmedAt = undoable.previousConfirmedAt` and `undoable = null`.
  Anything else is `UNDO_EXPIRED`.
- **`UNDO_WINDOW_MS = 8_000 + 5_000`.** That is K2's 8-second undo plus 5 seconds of server slack
  for latency, so an undo tapped at 7.9 s on a slow connection still lands. It lives in a domain
  policy constant, with a test exercising both sides of the boundary.

This is a JSONB shape change on published/reserved listings. The same migration adds
`"undoable": null` to every existing row (with a guard) and adds `shelters.version`
(integer, default 0, §4).

## 6. Domain pieces S3 also needs

- `shelterFacingVerificationOf(state): ShelterFacingVerificationView`: a pure projection with a test
  that no evidence or moderator id survives it.
- `UNDO_WINDOW_MS` and the `undo_confirm` event (§5).
- `MedicalDeclarationInputSchema` (proposal §1.7).
- `Shelter.version` (§4).

## 7. Questions

**S3-Q1, where the "previous confirmation" is stored (§5).**
- **A (recommended): on the listing (`undoable`), as above.** The undo reads and restores one
  value on the same row it already writes, so there's no second table to keep in sync. The
  cost is one small JSONB migration.
- **B: in the shelter history table.** The undo would read the last `confirm` history entry
  back. But that table doesn't exist yet (it ships with the registry writers), and confirmations
  aren't in the history union, which is shelter-level. It would widen both.

**S3-Q2: approve this addendum as the S3 spec?** That covers the access metadata (§1), the errors
(§2), the views (§3) and the procedure inputs and outputs (§4). After your answer I build the
contracts, the domain pieces and the undo migration as one Tier 1 PR. Handlers and Better Auth
follow in the next slice.

---

## 8. Decisions, 2026-10-12: what the answers change above

- **S3-Q1 → A, plus a double-tap rule.** A `confirm` while `undoable` is live (within
  `UNDO_WINDOW_MS` of `undoable.confirmedAt`) keeps the **original** `previousConfirmedAt` and only
  moves `confirmedAt`. Without that rule, confirm, confirm, undo would leave the animal confirmed.
  A test pins exactly that sequence: confirm, confirm, undo restores the value from before the first
  confirm.
- **Reject/suspend note: trimmed, then `min(1)`.** A whitespace-only note is refused.
- **§4 addition:** the reject/suspend note is shown to the shelter verbatim, so it follows
  `docs/marketing/brand-voice.md`: first person «я», plain words, no officialese. The S-screen
  dialog's helper text says, in sense, "the shelter will read this as written". That's Ukrainian
  copy, so it goes on the copy sheet and ships `[COPY PENDING]`.
- **§1 addition, which changes proposal §6:** besides "every procedure declares access", there's a
  **cross-tenant negative test for every shelter-scoped procedure**, `confirm` and `undoConfirm`
  included. A member of shelter A acting on shelter B's animal or shelter gets **`FORBIDDEN`**, per
  Oleksii's instruction. That replaces proposal §6's `NOT_FOUND` for the `SA-other` column. The
  trade accepted: a `FORBIDDEN` confirms an id exists elsewhere. Animal ids are already public on
  every feed card, and draft ids are unguessable UUIDs.
  - **Where the test lives:** the cross-tenant tests call real handlers, so they're an obligation
    of the **handlers slice**, not S3. S3 declares `FORBIDDEN` on every shelter-scoped procedure,
    and its contract test asserts that declaration.
  - **S3-Q3 (2026-10-13):** B. S3 is committed on the branch; PR #85 stays draft until the
    handlers slice and its 16 cross-tenant tests are on this branch, with the ownership-filter
    breakage in the mutation list. Oleksii's correction, verbatim: 'My "before commit"
    should have said "before merge".' Until then, each test is an `it.todo` in
    `apps/web/src/api/kabinet-cross-tenant.test.ts`.
- **Migration rule:** the S3 migration runs on a real **child** Neon branch first, never through
  the production connection string; production is a separate, later step.

