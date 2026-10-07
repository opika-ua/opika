# H2 — kabinet contract & domain shapes: proposal for review

**Status:** answered by Oleksii, 2026-10-07. His answers, quoted verbatim, are in
`docs/decisions-inbox/docs-h2-contract-proposal.md`; §10 below lists what they change in this
document. Implementation follows §8's PR sequence. Originally a proposal, also 2026-10-07. Tier 1 — `packages/domain` and
`packages/contracts` shapes reviewed by Oleksii before any code (`CLAUDE.md`, "Contract-first").
Inputs: `docs/h2-contract-handoff.md` (the delta list), `docs/kabinet-contract-decisions.md`
(his decisions), `docs/design/KABINET.md` (the design), `docs/handoff-2026-10-04.md` §3.1 (scope).

Sketches below are Zod-shaped TypeScript, not final code — names and fields are what is being
reviewed. §0 lists what reading the code turned up that the handoff didn't carry; §9 lists the
questions that need your answer before implementation starts.

---

## 0. What the handoff missed (found by reading the code, not the docs)

1. **`pause`/`resume` aren't pure wiring.** Both events carry `moderatorId: ModeratorId`, and
   the `paused` state stores `pausedBy: ModeratorId` (`verification/events.ts:53-63`,
   `state.ts:19-23`). A shelter_admin is not a moderator; storing their id under that brand
   would make the field lie. Needs an actor union (§1.4) — a small domain change with a JSONB
   backfill (zero paused rows in the seed; production count unknown).
2. **There is no verification history to "reuse".** KABINET N14 (S3's history log) and N23 (the
   audit log, "same entry shape as the verification history log") both assume one exists.
   `shelters.verification` is a JSONB of the *current* state only; nothing records past
   transitions. §3 proposes one append-only history covering both.
3. **`lastConfirmedAt` (K2's «Ще шукає», N4) isn't on the handoff's list.** It's in H2's
   original scope (§3.1: "a new `last_confirmed_at` column distinct from `last_updated_at`").
   It also collides with a settled decision — see §1.6 and Q3.
4. **S2 can't produce a valid `Shelter`.** S2 asks for name + city + first admin + evidence.
   `ShelterSchema` requires `legalEntity`, `exactAddress`, `contact` and `description`, all
   non-null, and `evidenceGaps` can't evaluate anything without `legalEntity.kind`. See Q1.
5. **K5's «Подати ще раз» has no evidence to send.** The `resubmit` event carries a full
   `evidence` list, but shelter self-submission of evidence is out of scope. See Q2.
6. **The reason dialog (N15) has a free-text field and no code select.** But
   `RejectionReason`/`SuspensionReason` require a `code` (`reasons.ts:57-67`). See Q4.

Also, a scope discrepancy between the two input docs, resolved toward the one with your
decision in it. The handoff §4 says the audit log covers "contacts and the voice sentence
only". Your decisions §5 say operator edits to legal/verification data on S4 need "the
audit-log entry below". §3 logs both.

---

## 1. `packages/domain` changes

### 1.1 `EvidenceItemSchema` — `registeredName` (handoff §1)

```ts
z.object({
  kind: z.literal("edrpou_registration"),
  edrpou: EdrpouSchema,
  /** The name as ЄДР shows it at check time. Compared against `legalEntity.legalName`
   *  (what the shelter claimed) and the bank evidence's `holderName`. */
  registeredName: z.string().min(1).nullable(),   // ← see Q5
  documentKey: z.string().min(1).nullable(),
}),
```

**Recommendation:** `nullable` in the domain schema, **required** in the input schema (§1.2).
Every *new* entry must carry it. A record entered before the field existed honestly says "not
recorded", and S3 renders that as «Не записано» (product rule). The alternative is required
everywhere plus a backfill, and the only value available to backfill with is the shelter's own
claimed `legalName`. That would fabricate the exact check this field exists to perform. If no
real shelter has been onboarded to production yet, required-everywhere plus a reseed is cleaner.
That is Q5.

S3 shows it beside `displayName` and the bank evidence's `holderName`, as decisions §2 and
KABINET S3 specify. I'd also add `legalEntity.legalName` to that comparison, because it is the
shelter's own claim about its registered name. It's a display-only addition to a decided
layout, so it's Q8, not a default.

### 1.2 Shared evidence input — `verification/evidence-input.ts` (handoff §2)

New module beside `evidence.ts`. Pure Zod plus one pure function, so it fits the package's
no-I/O rule. `OnboardEvidenceItemSchema` and `toEvidenceItem` move out of
`packages/db/src/onboard-shelter.ts` into it.

```ts
export const EvidenceItemInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("edrpou_registration"), edrpou: EdrpouSchema,
             registeredName: z.string().min(1), documentKey: z.string().min(1).nullable() }),
  z.object({ kind: z.literal("bank_account_holder"), holderName: z.string().min(1),
             documentKey: z.string().min(1).nullable() }),
  z.object({ kind: z.literal("reference_contact"), name: z.string().min(1),
             channel: ContactChannelSchema, relationship: ReferenceRelationshipSchema }),
  z.object({ kind: z.literal("site_visit"), notes: z.string().min(1) }),   // as decided (§4); see Q7
  z.object({ kind: z.literal("supporting_document"), labelUk: z.string().min(1),
             documentKey: z.string().min(1) }),
]);

/** Who is recording this evidence and when — the two facts an operator never types. */
export type EvidenceAttribution = { recordedBy: ModeratorId; recordedAt: Date };

export const toEvidenceItem = (input: EvidenceItemInput, by: EvidenceAttribution): EvidenceItem;
export const toVerificationEvidence = (
  inputs: readonly EvidenceItemInput[], by: EvidenceAttribution,
): VerificationEvidence;   // submittedAt = by.recordedAt
```

- **Two callers, one signature.** The script passes `{ recordedBy: FOUNDER_MODERATOR_ID,
  recordedAt: now }`. S2's handler passes `{ recordedBy: actor.moderatorId, recordedAt:
  context.now }`. Neither caller is a special case of the other, because the moderator is a
  parameter rather than a constant inside the function.
- **`site_visit` stays notes-only, as decisions §4 settles.** The caller fills `visitedBy`
  and `visitedAt` from the attribution (`visitedAt = recordedAt`), and the script's CLI
  behaviour is unchanged. One thing I'd change: `visitedAt = recordedAt` is false whenever
  the visit happened before the data entry. That's Q7, not a default, because it reopens a
  decision.
- **`edrpou`/`bank` gain an optional `documentKey`** (today the script hardwires `null`). For
  kabinet callers a client-supplied storage key is a trust boundary. The handler must accept
  only keys it issued itself, in the private evidence bucket. See Q6.

### 1.3 Pending donation (handoff §3)

```ts
// shelters/donation.ts
export const PendingDonationSchema = z.object({
  link: DonationLinkSchema,           // url + provider, exactly what approval would make live
  proposedAt: z.date(),
  proposedBy: ShelterAdminIdSchema,
});

/** Derived from the host, so a single URL field (K4) is enough to propose. */
export const donationProviderOf = (url: string): DonationProvider;  // send.monobank.ua → monobank_jar, …, else "other"

// shelters/shelter.ts — ShelterSchema gains:
pendingDonation: PendingDonationSchema.nullable(),
```

- **The provider is derived, then stored on the proposal**, so the approver sees exactly the
  `DonationLink` that will go live. No provider select in K4, matching the design's single
  URL field.
- **Re-proposing replaces the pending value.** There is one proposal in flight, and the history
  records each one (§3). There's no "cancel first" step.
- **`PublicShelterViewSchema` is `pick`-built and doesn't list `pendingDonation`**, so it's
  excluded by construction. A test still asserts its absence, because the rule is what
  protects it and the test is what proves the rule still holds.
- `proposedBy` uses a new brand, below.

### 1.4 Actors — `primitives/ids.ts` + `shelters/actor.ts` (fixes §0.1)

```ts
// primitives/ids.ts — same "named for the role" reasoning as ModeratorId
export const ShelterAdminIdSchema = brandedId<"ShelterAdminId">();

// shelters/actor.ts
/** Who acted on a shelter. Only the variants an event admits are allowed on it. */
export const ShelterActorSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("moderator"), moderatorId: ModeratorIdSchema }),
  z.object({ kind: z.literal("shelter_admin"), shelterAdminId: ShelterAdminIdSchema }),
]);
```

Applied narrowly. The actor union goes **only** where a shelter_admin may legitimately act:

| Event / state field | Today | Proposed |
|---|---|---|
| `pause.moderatorId`, `resume.moderatorId` | `ModeratorId` | `actor: ShelterActor` |
| `paused.pausedBy`, `InterruptedState(paused).pausedBy` | `ModeratorId` | `ShelterActor` |
| `resubmit` | *(no actor at all)* | `actor: ShelterActor` (Q2 decides whether `shelter_admin` is reachable) |
| `start_review`, `approve`, `reject`, `suspend`, `reinstate` | `ModeratorId` | **unchanged** |

Keeping the last row `ModeratorId` puts part of the authorization matrix into the type system:
a shelter_admin *can't construct* a suspend or approve event, whatever a handler gets wrong.
The FSM table itself (`transition.ts`) is untouched. No edge opens or closes.

*Migration:* a JSONB rewrite of `pausedBy: "<uuid>"` → `{ kind: "moderator", moderatorId:
"<uuid>" }` in `verification` (top level and inside `priorState`). The seed has no paused
shelters. Tier 1 (migration path).

### 1.5 Listing transitions — `animals/listing-transition.ts` (new)

K2's forward actions imply a second state machine that doesn't exist yet. Today
`AnimalListingState` has no transition function, and every write path would hand-assemble
states. Same shape as `transition.ts`: a pure table, a result union, and an exhaustive pair test.

```ts
export const ListingEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("publish"), at: z.date() }),          // draft → published
  z.object({ type: z.literal("reserve"), at: z.date() }),          // published → reserved
  z.object({ type: z.literal("release"), at: z.date() }),          // reserved → published, publishedAt kept (decision #16)
  z.object({ type: z.literal("adopt"), at: z.date() }),            // published|reserved → adopted
  z.object({ type: z.literal("withdraw"), at: z.date(), reason: WithdrawalReasonSchema }), // published|reserved → withdrawn
  z.object({ type: z.literal("restore_to_draft"), at: z.date() }), // withdrawn → draft
  z.object({ type: z.literal("confirm"), at: z.date() }),          // published|reserved self-loop (§1.6)
]);
export type ListingTransitionResult =
  | { kind: "ok"; next: AnimalListingState }
  | { kind: "illegal"; from: AnimalListingState["kind"]; event: ListingEvent["type"] }
  | { kind: "non_monotonic"; /* same as verification */ };

/** What blocks publishing, as data, so K2 can write the reason in the row (not a bare no). */
export const publishGaps = (animal: Animal): readonly PublishGap[];  // today: [{ kind: "photo" }] or []
```

Closed edges (defaults, flag any you disagree with):
- `adopted` is terminal. KABINET gives it no forward action, and an adoption entered by
  mistake goes to the operator.
- `draft → withdrawn` is closed. A draft is deleted, not withdrawn.
- `withdrawn → draft` drops `publishedAt`, so republishing restarts the wait clock.

### 1.6 Confirmation — `lastConfirmedAt` (fixes §0.3)

The confirmation goes **on the listing variants that can be confirmed**, not on `Animal` as a
nullable top-level field. A draft that "was confirmed on" a date is then unrepresentable:

```ts
z.object({ kind: z.literal("published"), publishedAt: z.date(), confirmedAt: z.date() }),
z.object({ kind: z.literal("reserved"), since: z.date(), publishedAt: z.date(), confirmedAt: z.date() }),

/** Mirrors waitAnchorOf: persistence writes it to an indexed `last_confirmed_at` column. */
export const confirmationAnchorOf = (listing: AnimalListingState): Date | null;
```

`publish` sets `confirmedAt = at`, `confirm` sets it to `at`, and `release` carries it forward.
Backfill for the 320 seeded rows: `confirmedAt := last_updated_at`. Today that column has never
moved (`animalRepo.update` has no callers, commitment #7's own analysis), so the backfill
preserves exactly what adopters see now.

**This collides with decision #10 and commitment #7. Q3.** Freshness (`freshnessOf`), the
deck's keyset (`feed-repo.ts:74`) and the gallery's `freshest` sort (`gallery-repo.ts:54`) all
read `last_updated_at`. Once H2's edit path exists, a typo fix would make a four-month-old
listing read "оновлено сьогодні" and jump to the top of both orders. That is the failure
commitment #7 predicted. **Recommendation:** all three read `last_confirmed_at`, and
`last_updated_at` becomes what its name says (edit time, shown only in the kabinet). That
changes decision #10's sort key, and it makes commitment #7's sentence ripe for «востаннє
підтверджено». The new sentence is your Ukrainian, Tier 1.

### 1.7 Medical declaration input (K3, N19)

```ts
export const MedicalDeclarationInputSchema = z.object({ state: MedicalStateSchema });
```

The server builds the `shelter_declared` attestation and bumps `declaredAt` only when `state`
actually changes. An update that touches a `source: "registry"` vaccination is refused, not
overwritten. The read-only rendering is enforced on the server, not just in the UI.
`documentReadiness` isn't in any kabinet input (decision §3).

---

## 2. Identity — how `context` carries the actor

Better Auth 1.6.x is a **new catalog dependency** (ADR-decided, not yet installed): magic link
only, plus the `organization` plugin. Adopters keep the hand-rolled anonymous session
(decision #13). Nothing here touches it.

```ts
// apps/web/src/api/context.ts — AppContext gains:
kabinetActor: KabinetActor | null;

type KabinetActor =
  | { kind: "super_admin"; moderatorId: ModeratorId }
  | { kind: "shelter_admin"; shelterAdminId: ShelterAdminId; shelterId: ShelterId }
  /** S5. A super_admin viewing one shelter. Its own variant, so "read-only" is a property
   *  of the type every write procedure rejects, not a flag a handler can forget to check. */
  | { kind: "support_view"; moderatorId: ModeratorId; shelterId: ShelterId };
```

- **super_admin is a platform role, not an org role.** It's stored on the user record. I'm
  deliberately *not* using Better Auth's `admin` plugin's `impersonateUser`, which mints a real
  session *as* the shelter user, so writes would succeed unless every handler remembered to
  block them. KABINET S5 says "enforce this on the server". `support_view` does that by
  construction: no write procedure lists it.
- **shelter_admin → exactly one shelter.** `shelters.organization_id` is a unique FK to Better
  Auth's `organization`. The invite path enforces one membership per user, and a user found
  with two memberships is refused rather than guessed at.
- **`shelterId` is never in a shelter_admin's input.** It comes from the actor, the same rule
  `reveals.listMine` follows for `adopterId` ("accepting one would invite passing somebody
  else's"). `animalId` inputs are checked against `actor.shelterId`, and a mismatch is
  `NOT_FOUND`.
- **Implementation obligations** (checked in the auth PR, not assertable here): Better Auth must
  issue **UUID** user ids, or `ModeratorId`/`ShelterAdminId` (`z.uuid()` brands) won't parse.
  The magic-link endpoint must answer identically for known and unknown emails (K1, N1), and
  a test proves it. The support scope has a 30-minute idle expiry.

---

## 3. History — one append-only log for N14 and N23 (handoff §4, fixes §0.2)

One table, `shelter_history`, and one discriminated union. **Structured snapshots, not
free-text and not field diffs.** A free-text description would mean writing Ukrainian into the
database at write time, which breaks i18n. A diff algorithm over `ShelterContact` (itself a
union of channels) costs more than whole-value snapshots and buys nothing N23 needs. The S4
list renders each entry through i18n at read time.

```ts
export const ShelterHistoryEntrySchema = z.discriminatedUnion("kind", [
  /** Every FSM transition. The event is stored whole: it already carries who, when and why. */
  z.object({ kind: z.literal("verification"), event: VerificationEventSchema,
             from: VerificationStatusSchema, to: VerificationStatusSchema }),
  z.object({ kind: z.literal("contact_changed"), at: z.date(), actor: ShelterActorSchema,
             previous: ShelterContactSchema, next: ShelterContactSchema }),
  z.object({ kind: z.literal("freshness_sentence_changed"), at: z.date(), actor: ShelterActorSchema,
             previous: FreshnessSentenceSchema, next: FreshnessSentenceSchema }),
  /** Decisions §5 says "contacts and descriptions" go live and are audited. KABINET's K4 doesn't
   *  offer description editing, but S4 can edit it, so the entry exists. */
  z.object({ kind: z.literal("description_changed"), at: z.date(), actor: ShelterActorSchema,
             previous: LocalizedTextSchema, next: LocalizedTextSchema }),
  z.object({ kind: z.literal("donation_proposed"), at: z.date(), actor: ShelterActorSchema, link: DonationLinkSchema }),
  z.object({ kind: z.literal("donation_proposal_cancelled"), at: z.date(), actor: ShelterActorSchema }),
  z.object({ kind: z.literal("donation_decided"), at: z.date(), moderatorId: ModeratorIdSchema,
             decision: z.enum(["approved", "rejected"]), link: DonationLinkSchema,
             previousLive: DonationLinkSchema.nullable() }),
  /** S4: operator edits to what verification checked. No approval step (decisions §5). */
  z.object({ kind: z.literal("verified_data_changed"), at: z.date(), moderatorId: ModeratorIdSchema,
             change: z.discriminatedUnion("field", [
               z.object({ field: z.literal("legal_entity"), previous: ShelterLegalEntitySchema, next: ShelterLegalEntitySchema }),
               z.object({ field: z.literal("exact_address"), previous: ExactAddressSchema, next: ExactAddressSchema }),
             ]) }),
]);
// VerificationStatusSchema: z.enum(VERIFICATION_STATUSES), the same pattern contact-reveal.ts:34
// already uses inline. It gets a named export.
```

- **It's hand-wired per entry kind, not a generic field-audit framework**, because H2 has eight
  entry kinds. A new auditable field is a new variant, and the compiler finds every renderer.
- **Who sees it.** super_admin sees all of it (S1/S3/S4). The shelter sees none of it. K5 shows
  the rejection reason from the current state, not from the log.
- **Atomicity is a Neon-specific obligation.** The state write and the history insert must land
  together, and the insert must happen *only if* the write did. Production uses
  `drizzle-orm/neon-http`, where `transaction()` throws. `db.batch` is atomic but not
  conditional: a lost race (0 rows updated) would still insert a history row for a transition
  that never happened. `batch` also doesn't exist on postgres-js, so no local test could reach
  it. So every audited write is **one statement**: `WITH upd AS (UPDATE … WHERE <guard>
  RETURNING …) INSERT INTO shelter_history … SELECT … FROM upd`. That is atomic and
  conditional on both drivers. The guard is `verification_status` plus the state's entered-at
  for FSM writes. For contact, sentence, description and donation writes it is
  an integer `shelters.version = $readVersion`, bumped on every guarded write, so a stale
  `previous` can't be recorded. An integer, not `last_updated_at`: a timestamp equality guard
  breaks the first time anything writes the column at microsecond precision, which a JS `Date`
  can't round-trip. Zero rows back means
  `CONFLICT`. It gets verified against real Neon before it's called verified (standing
  constraint).

---

## 4. Contract — the kabinet router (handoff §5–§6)

Two namespaces split by who supplies `shelterId`. That split is what keeps the authorization
matrix legible:

- **`kabinet.shelter.*`** — the shelter's own cabinet. `shelterId` comes from the actor
  (shelter_admin, or support_view for reads).
- **`kabinet.registry.*`** — the operator's. `shelterId` is explicit, and only super_admin is
  allowed.

Auth itself (`/kabinet/vkhid`, magic link, invite acceptance) runs on Better Auth's own route
handler, not oRPC.

| Procedure | R/W | Notes |
|---|---|---|
| `shelter.profile.get` | R | `KabinetShelterView` (§5) |
| `shelter.profile.updateContact` | W | live + history |
| `shelter.profile.updateFreshnessSentence` | W | live + history |
| `shelter.profile.proposeDonation` / `.cancelDonationProposal` | W | §1.3 |
| `shelter.profile.pause` `{ reason: PauseReason }` / `.resume` | W | FSM, `actor: shelter_admin` |
| `shelter.verification.requestReview` | W | K5 «Подати ще раз», **exists only if Q2 = A** |
| `shelter.animals.list` `{ listing?, cursor, limit }` | R | keyset `(created_at DESC, id)`, signed cursor kind `kabinet_animals`; returns per-kind counts + stale count (inventory, not engagement) |
| `shelter.animals.byId` | R | drafts included |
| `shelter.animals.createDraft` / `.update` | W | `update` bumps `lastUpdatedAt` only, never `confirmedAt` |
| `shelter.animals.transition` `{ animalId, event }` | W | §1.5. `publish` refused with `PUBLISH_REQUIREMENTS_UNMET` + `publishGaps` |
| `shelter.animals.confirm` / `.undoConfirm` | W | N4. Undo is a CAS: applies only if `confirmedAt` still equals the value `confirm` returned, within the 8s window + slack |
| `shelter.animals.deleteDraft` | W | `draft` only |
| `shelter.animals.photos.*` | W | presigned upload + attach + reorder. **Shapes deferred to the photo-upload PR's own proposal** (M7 is Opus too, and it is its own sub-area per §3.1) |
| `registry.shelters.list` `{ search?, status?, cursor }` | R | S1. Keyset `(awaiting_rank, display_name, id)`, so things awaiting the operator come first |
| `registry.shelters.byId` | R | `RegistryShelterView` (§5) |
| `registry.shelters.create` | W | S2: shelter + evidence → `pending`, org, first-admin invite. Wires `productionLocationPolicy` (launch gate, §3.1). Field set depends on Q1 |
| `registry.shelters.updateVerifiedData` / `.updateProfile` | W | S4, history |
| `registry.verification.startReview` / `.approve` / `.reject` / `.suspend` / `.reinstate` | W | one procedure per command so each matrix row and error set is exact. `approve` refused with `EVIDENCE_INSUFFICIENT` + `evidenceGaps` data |
| `registry.verification.resubmit` `{ shelterId, evidence: EvidenceItemInput[] }` | W | operator-side evidence amendment (Q2) |
| `registry.donation.approve` / `.reject` | W | N20, no reason |
| `registry.admins.list` / `.invite` / `.resendInvite` / `.remove` | R/W | S2/S4 |
| `registry.history.list` `{ shelterId, cursor }` | R | keyset `(at DESC, id)` |
| `registry.support.enter` `{ shelterId }` | W | S5, super_admin only |
| `session.exitSupport` | W | S5 «Вийти з режиму». Its own namespace, because it is the one write a `support` actor must be allowed. Under `registry.*` it would be FORBIDDEN and the operator couldn't leave |

There are no super_admin procedures for editing animals. No S-screen designs one, and the scope
rule says don't build ahead. But §3.1 and KABINET both say super_admin "can edit everything",
so this is Q9, not a default.

**Server-enforced limits** (KABINET N1/S2; a documented limit needs a test that exercises it):
60s magic-link resend lockout, 15-minute link expiry, 72h invite expiry with resend, and the
30-minute support-mode idle timeout. **Launch gate (§3.1):** `registry.shelters.create` wires
`productionLocationPolicy`, and `LOCATION_HMAC_SECRET` joins `RequiredProductionEnvSchema` in
the same change (Tier 1, env validation). `/kabinet/*` is `noindex`.

**New `apiErrors`:** `FORBIDDEN` 403, `CONFLICT` 409 (lost CAS), `ILLEGAL_TRANSITION` 409
(either FSM, with `{ from, event }` data), `EVIDENCE_INSUFFICIENT` 422 (with gap data),
`PUBLISH_REQUIREMENTS_UNMET` 422. The existing `UNAUTHENTICATED` is reused, and the kabinet
client redirects to K1 instead of bootstrapping.

---

## 5. Output views — never `PublicShelterViewSchema` plus extras

- **`KabinetShelterView`** — what a shelter sees of itself: `pick` of `id, displayName,
  description, legalEntity, exactAddress, contact, donation, pendingDonation,
  freshnessSentence` (the locked block shows legal entity and premises address read-only).
  It also carries **`verification: ShelterFacingVerificationSchema`**, a projection with no
  evidence and no moderator ids: `{ status: "verified" | "pending" | "under_review", since }
  | { status: "paused", since, reason } | { status: "rejected", at, reason } | { status:
  "suspended", at, reason }`. The operator's name on K5 comes from the app-level config
  (decisions §5), not from a moderator id.
- **`RegistryShelterView`** — a separate, operator-only schema: the full shelter including
  `verification` with evidence, `organizationId`, and admins (name, email, invite state).
- **`KabinetAnimalView`** — `pick` of every `Animal` field, listed explicitly, plus
  `lastUpdatedAt`, so K3's footer can say when the draft was saved.
- **No view has a reveal, swipe or view count.** A projection test asserts that none of these
  schemas has any key outside its hand-written expected list (commitment #2, "no engagement
  numbers" even for the operator).

---

## 6. Authorization matrix (the non-negotiable table test)

Actors under test: `anon` (no session) · `adopter` (anonymous adopter cookie only) ·
`SA-own` · `SA-other` (a shelter_admin passing an `animalId` from another shelter) · `support`
(viewing shelter X) · `support-other` (viewing X, passing an `animalId` from shelter Y) ·
`super`.

| Procedure group | anon | adopter | SA-own | SA-other | support | support-other | super |
|---|---|---|---|---|---|---|---|
| `shelter.*` reads | UNAUTH | UNAUTH | ✓ | NOT_FOUND | ✓ | NOT_FOUND | FORBIDDEN (must enter support) |
| `shelter.*` writes | UNAUTH | UNAUTH | ✓ | NOT_FOUND | **FORBIDDEN** | FORBIDDEN | FORBIDDEN |
| `registry.*` (all) | UNAUTH | UNAUTH | FORBIDDEN | FORBIDDEN | FORBIDDEN | FORBIDDEN | ✓ |
| `session.exitSupport` | UNAUTH | UNAUTH | FORBIDDEN | — | ✓ | — | FORBIDDEN (not in support) |

The real test is one row per procedure, not per group. Every cell is asserted, including the
refusals, as with the FSM table. The `*-other` columns apply only to procedures that take an
`animalId`. For procedures with no id input those cells are omitted, not left in and passing
vacuously. Three guards keep it honest:

- **Every kabinet procedure declares its access policy** (oRPC `.meta()` on the contract,
  declarative data, so it fits `packages/contracts`). One test walks the router and fails on a
  procedure with no entry, so access is deny-by-default like `pick`. It extends the existing
  `implement(contract)` walk.
- **The matrix test's expected cells are hand-written**, not derived from that same `.meta()`.
  Deriving them would compare the code against itself (standing constraint: "a test may not
  compare output against the same constant the code renders").
- **The hand-written table's procedure set equals the router walk's.** A new procedure with no
  row fails, so a wrong `.meta` policy on it can't pass the presence check alone and never be
  matrix-tested.

---

## 7. What H2 needs from you in Ukrainian (Tier 1 copy, goes in the inbox, doesn't block code)

- The third option of the medical control (N19). English sense: "done / I confirm this".
  It's a separate key from the «Слова притулку» display badge.
- `/prytulkam` §7/§9/§10 (`whatToPrepare`, `whenAnimalFindsHome`, `whoIsBehindThis`). These
  become false when self-serve ships (commitment #6, §3.1 already asks for them). This is the
  one item that blocks H2's *merge*.
- Commitment #7's sentence (`whyThatSentence`), **only if Q3 = yes**. It's a `/prytulkam`
  commitment, so in that case it blocks the merge too, not just #6.

Commitments #1, #2, #4, #5 and #8 are unaffected by these shapes: no ranking input, no
engagement surface, no messaging, no money.

---

## 8. Proposed PR sequence (each its own branch)

1. Domain + contracts (this proposal, once answered), with migrations for §1.1/1.4/1.6 and the
   history table.
2. Auth + org model + context actor + matrix test skeleton.
3. Animal CRUD + listing FSM + confirm (K2/K3).
4. Photo upload (own proposal first).
5. Registry: S1–S4, evidence step, donation approval, history.
6. Support mode (S5).
7. `/prytulkam` rewrite with your copy. This one gates the merge of whichever PR ships
   self-serve.

---

## 9. Questions that need your answer before implementation

**Q1 — S2 and the incomplete shelter (§0.4).**
- **A (recommended):** S2 also collects legal entity, premises address, primary contact and a
  description, reusing S4's own sections. The shelter is complete when created, and no type
  changes. *Cost:* a longer S2 form, laid out from S4's existing frames rather than a new mock.
- **B:** a separate `shelter_onboarding` record holding partial data, promoted to a real
  `Shelter` in `pending` once complete. *Cost:* a second entity, a promotion step, and twice
  the surface to authorize.
- **C:** make those `Shelter` fields nullable. Not recommended: it pushes nullability into
  every consumer, the public feed included, for a state the feed never shows.

**Q2 — what «Подати ще раз» resubmits (§0.5).**
- **A (recommended):** the shelter's button resubmits the evidence it already has (the server
  carries it forward, the client sends none). The operator amends evidence through
  `registry.verification.resubmit` with a new list. *Consequence:* `resubmit` gains `actor`,
  and both actors can send it.
- **B:** K5's button only writes to the operator, and resubmission is operator-only.
  *Consequence:* `resubmit` stays moderator-only, and K5's secondary action changes meaning.

**Q3 — move freshness and the freshest-first orders onto `last_confirmed_at` (§1.6)?**
- **Yes (recommended):** freshness, the deck keyset (decision #10's key) and the gallery's
  `freshest` sort move off edit time. *Consequence:* each «Ще шукає» tap sends that animal to
  the top of the freshest-first gallery and the deck. That's honest, since it really was just
  confirmed, and the per-animal, no-bulk rule (N4) is what keeps it from becoming a bump
  button. *Cost:* index and cursor changes in three places, plus your sentence for
  commitment #7, which then blocks the merge.
- **No:** H2's edit path must then never bump `last_updated_at`. The column name would keep
  saying "updated" while meaning "confirmed", which is the mismatch commitment #7 says to fix
  properly rather than paper over.

**Q4 — the reject/suspend dialog has no code select (§0.6).**
- **A (recommended):** add a code select above the textarea, the same pattern N21 already uses
  for pause. The note is required at the contract level for reject and suspend, because the
  shelter reads it verbatim. That's a design addition with no mock.
- **B:** a hidden default `code: "other"` with the textarea as the note. *Consequence:* every
  reason code goes unused, and S1's filters and any future reporting lose them.

**Q5 — `registeredName` on records that predate it (§1.1).** Has any real shelter been
onboarded to production Neon yet? If not, make it required everywhere and reseed. If so, keep
it nullable in the domain and required in input (recommended).

**Q6 — evidence document upload.** Documents must sit in a private bucket, never the public
photo bucket (`CLAUDE.md` obligation). **Recommended:** its own sub-PR, sharing the
presigned-upload mechanism with photo upload (PR 4). Until it lands, S2's type picker omits
`supporting_document` and the optional document rows stay `null`. *Alternative:* keep document
evidence script-only for H2.

**Q7 — the site-visit date.** Decisions §4 keeps `site_visit` input to notes only, and the
caller fills `visitedAt`. If it fills it with *now*, the record is false whenever the visit
happened before the data entry.
- **A (recommended):** add a required `visitedOn` date to the shared input. *Cost:* the
  operator's local script input files need one new field, which changes the script's input
  format.
- **B:** keep it as decided. S3's "when" then means "when it was recorded".

**Q8 — add `legalName` to S3's identity comparison (§1.1)?** Display-only. The decided layout
compares against `displayName` and `holderName`.

**Q9 — super_admin editing animals.** §3.1 and KABINET say super_admin "can edit everything",
but no S-screen designs animal editing, and support mode is read-only by design.
- **A (recommended):** none in H2. The operator asks the shelter, or uses the script.
- **B:** add `registry.animals.*`, which needs a screen that has no mock.

**Q10 — the withdrawal reason.** K2 sends →Знято through N15, whose textarea is required, and
K2's row shows «Знято … · «причина»». `WithdrawalReason` is a code only.
- **A (recommended):** `withdrawn.reason` becomes `{ code, note | null }`, the same shape as the
  three verification reasons, with the note required at input. *Cost:* a JSONB shape change and
  a backfill of seeded withdrawn rows (`note: null`).
- **B:** keep it code-only and drop N15's textarea for this action.

Smaller judgement calls I've taken as defaults, each recorded in the branch inbox and
reversible:
- Re-proposing a donation replaces the pending one.
- The provider is derived from the host.
- `adopted` is terminal.
- `withdrawn → draft` resets the wait clock.
- There is one procedure per FSM command.
- The org is linked by a unique FK column.
- S3's per-card "date added" shows the bundle's `evidence.submittedAt`, because `EvidenceItem`
  has no per-item date and an operator resubmission replaces the whole bundle anyway.
- `confirm` stays a separate procedure from `transition`, even though it's also a listing
  event, because its undo needs its own compare-and-set entry point.

---

## 10. Decisions, 2026-10-07 — what the answers change above

Oleksii's answers are quoted verbatim in the inbox file. This section records only their effect
on the shapes, so the document above can be read as the spec without re-deriving it.

- **Q1 → A.** S2 also collects `legalEntity`, `exactAddress`, `contact` and `description`,
  reusing S4's sections (same components, same schemas). No onboarding record, and no nullable
  `Shelter` fields.
- **Q2 → A.** `shelter.verification.requestReview` exists: it resubmits the current evidence,
  carried forward by the server. `resubmit` gains `actor: ShelterActor`. K5's copy must say
  plainly that a person reviews the resubmission, with no implied automatic re-check (copy
  sheet).
- **Q3 → yes.**
  - Freshness, the deck keyset and the gallery's `freshest` sort move to `last_confirmed_at`.
  - Edits never touch it.
  - Backfill: Oleksii chose `last_confirmed_at = created_at` over §1.6's `last_updated_at`.
    **That choice rested on a false fact from me.** An earlier draft of this bullet, and the
    chat summary he answered, said the two columns are "equal on every row". They are not.
    The seed sets `created_at` 7 days before `last_updated_at` (`seed.ts:1339`), and a check
    against the local corpus found 320/320 rows differ. 224 published or reserved rows also
    have `created_at` before `publishedAt`. Reopened as inbox H2-14 rather than implemented
    either way.
  - Decision #10 in `CLAUDE.md` and commitment #7 in `docs/standing-constraints.md` are
    updated in the same change.
  - The "blue pip" question (`docs/marketing/brand-improvements.md` #3) is closed against this
    change rather than recoloured: a fresh pip will now mean someone confirmed the listing.
- **Q4 → A.** The reason dialog gets a code select above the note. The code labels are
  Ukrainian, so they go on the copy sheet.
- **Q5 → required everywhere, plus a reseed.** `registeredName: z.string().min(1)` in the
  domain schema, with no nullable. **Before the reseed:** a read-only query against production
  confirms that no non-demo shelter exists. If one does, the work STOPs.
- **Q6 → its own sub-PR.** The evidence bucket is private: no public URL ever, short-lived
  presigned GETs, operator-only.
- **Q7 → A.** `site_visit` input gains a required `visitedOn` date.
- **Q8 → yes.** S3 compares `registeredName` with `legalEntity.legalName` as well as
  `displayName` and `holderName`.
- **Q9 → A.** No super_admin animal editing in H2.
- **Q10 → A.** `withdrawn.reason` becomes `{ code, note | null }`. The backfill detail is open
  as inbox H2-13: taken literally, the answer would overwrite real codes.
- **H2-7 defaults accepted. Consequence recorded, so nobody "fixes" it later:** `adopted` is
  terminal. An animal that is adopted and later returned becomes a **new listing**, with a new
  id, a new URL and a wait clock starting from zero. The old listing stays `adopted` as the
  record of the adoption that happened.
- **Copy (H2-8):** everything stays `[COPY PENDING]`, batched into one review sheet
  (`docs/h2-copy-sheet.md`). `/prytulkam` §7/§9/§10 still blocks the self-serve merge, and so
  does the commitment #7 sentence (Q3 = yes).
