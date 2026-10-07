# Kabinet ↔ domain reconciliation

**Status:** investigating, pre-implementation. H2 (`docs/handoff-2026-10-04.md` §3.1) requires
type/schema/route proposals reviewed by Oleksii before any code — this document is that review's
input, not its output. Nothing here is a contract proposal yet; it is the reconciliation pass
between `docs/design/KABINET.md` (the design handoff, landed 2026-10-07) and what `packages/domain`
already decided, which the design pass worked from the build-plan's prose summary rather than the
actual domain code for. Per `docs/standing-constraints.md`'s "when a mock exists, open the mock" —
and its mirror, when the *code* already decided something, the design needs to open that, not
re-derive it from a one-paragraph summary.

Read `docs/design/KABINET.md` alongside this. Every finding below cites the domain file it checked
against.

---

## 1. Two of KABINET.md's four "open questions" are already answered by existing code

The design pass flagged these as product decisions still needed. They aren't — the domain model
already made both calls, just not by anyone the design pass consulted.

### 1.1 Who sets «На паузі» (Open question 1)

**Answered: the shelter does, self-service, not the operator.**
`packages/domain/src/shelters/verification/reasons.ts`'s own comment is explicit: *"`shelter_requested`
used to sit in [`SuspensionCode`], and its presence was the clearest evidence that `paused` was
missing: a shelter closing for the season is not a moderation outcome... It now lives in `PauseCode`,
on a state whose exit does not require a moderator."* `PauseReasonSchema`'s comment: *"this is
self-declared, that is imposed"* (contrasting `pause` with `suspend`). The FSM has distinct `pause`/
`resume` events (`events.ts`), separate from `suspend`/`reinstate`.

**Consequence for the design:** K2 or K4 (the shelter's own kabinet) needs a pause/resume control —
e.g. "Призупинити прийом тварин" on the profile screen, with `PauseCodeSchema`'s five codes
(`seasonal_closure`, `relocation`, `capacity_reached`, `staff_shortage`, `other`) as the reason
options, the same `{code, note}` shape `RejectionReason`/`SuspensionReason` already use. S3/S4's
existing "reinstate names the prior state" logic (N14) is unaffected — pausing and suspending remain
genuinely separate interruption mechanisms, as decision 5 in `CLAUDE.md` already settled; this
finding is about *who can start one of them*, not about merging the two.

### 1.2 Rejected → pending transition (Open question 2)

**Answered: yes, it exists.** `transition.ts`'s `rejected` state handles a `resubmit` event,
transitioning to `pending` with fresh evidence (`transition.ts:179-189`).

**Consequence for the design:** K5 (rejected shelter's own view) needs «Подати ще раз», not only
«Написати Олексію» — matching what the design itself anticipated as the alternative ("If yes, K5
gains «Подати ще раз»").

---

## 2. Real mismatches — design assumed fields or a UI shape the schema doesn't have

These are not questions the domain model already answered; they're places the design and the
actual Zod shapes disagree, genuinely needing a decision before a contract proposal is written.

### 2.1 Verification evidence cards — two of five types show fields the schema doesn't carry

`packages/domain/src/shelters/verification/evidence.ts`'s `EvidenceItemSchema`, checked field by
field against KABINET.md's S3 table:

| Type | KABINET.md shows | Schema actually has | Match? |
|---|---|---|---|
| Реєстрація · ЄДРПОУ | code, **name in registry, ЄДР status** | `edrpou` (the code), `documentKey` | **Extra fields not in schema** |
| Банківський рахунок | holder name, **bank, masked IBAN** | `holderName`, `documentKey` | **Extra fields not in schema** |
| Рекомендація | who, how to reach them, relationship | `name`, `channel`, `relationship` (4 options matching exactly) | Match |
| Візит на місце | who visited, when, note | `visitedBy` (a **moderator ID**, not free text), `visitedAt`, `notes` | Match, with a caveat below |
| Документ | label | `label`, `documentKey` (required) | Match |

**Decision needed on the two mismatched types** (CLAUDE.md decision #6: evidence item shape is "a
proposal, not a specification... the numbers are yours to change" — this is exactly that kind of
call):
- (a) extend the schema — add `registeredName`/`edrStatus` to `edrpou_registration`, add
  `bankName`/an IBAN field (masked how? last 4 digits, matching the design's "masked" framing) to
  `bank_account_holder`; or
- (b) correct the design to show only what the schema carries — EDRPOU code + document, holder
  name + document.

No recommendation given here — this is a verification-rigor tradeoff (how much a bank/registry
claim needs to be independently checkable from the evidence card alone vs. from the attached
document), not an engineering one.

**Caveat on "Візит на місце":** `visitedBy` is a `ModeratorId`, not a free-text name — a future S3
"add evidence" flow (see §3 below) would need a moderator picker there, not a text field. Doesn't
block today's read-only review rendering (resolving the ID to a display name is enough for S3 as
currently scoped), but worth knowing before anyone builds an entry form for this type.

### 2.2 Health & documents section substantially under-specifies the real shapes

KABINET.md's K3 "Здоров'я й документи" section: *"vaccination [Зроблено | Не зроблено | Не
записано]; spay/neuter, same options; documents are multi-select checkbox chips (Чип · Ветпаспорт
· Довідка про сказ). Registry-confirmed facts (e.g. rabies) are read-only here and update
themselves."*

Checked against `packages/domain/src/animals/attestation.ts` and `document-readiness.ts`:

- **`VaccinationStatus`** is a discriminated union on `source`: `shelter_declared` (a 3-state
  `MedicalState` — `unknown`/`in_progress`/`confirmed` — plus `declaredAt`) or `registry`
  (pinned to `state: "confirmed"`, plus `registryRef`/`verifiedAt`, produced by a not-yet-built
  Phase 3 adapter). The design's three options (done/not done/unrecorded) are missing
  `in_progress` entirely, and conflate the two-source structure into one tri-state. The "registry-
  confirmed facts are read-only" line in the design text is actually gesturing at the right idea
  (correctly anticipating the `registry` variant should render read-only) but applies it to the
  wrong field — it's written under "documents," not under vaccination, and vaccination is the
  field that actually has a registry source today.
- **`SpayNeuterStatus`** is `shelter_declared`-only (no registry variant — the schema's own comment
  says a registry source "can never legitimately occur" for this fact), but still uses the same
  3-state `MedicalState`, so it needs `in_progress` too, not just the 2 states the design offers
  (plus unknown).
- **`DocumentReadiness`** is the largest gap: `{kind: "tracked"}` holds **four** independently
  tracked items (`microchip`, `rabiesVaccination`, `rabiesTitration`, `vetCertificate` — the
  design's 3-item checkbox list is missing `rabiesTitration` entirely and names a generic
  "Ветпаспорт"/"Довідка про сказ" that doesn't map cleanly onto the four real item names), and each
  item is independently one of **four** states (`unknown`/`absent`/`pending` with a `since` date/
  `present` with `issuedAt`+`expiresAt`+an optional `reference`) — not a boolean checkbox. The
  schema's own comment explains why: *"the hard part of cross-border movement is the ordering
  between items — chip before vaccination, titration a set interval after it."* This is
  deliberately-built-ahead structure for the cross-border phase (Phase 4, per
  `docs/stack-decision.md`), not accidental complexity.

**Decision needed:**
- (a) design a richer per-item document-status control now (4 items × 4 states, with conditional
  date/reference fields for "present") — more design work, a follow-up pass on K3 specifically; or
- (b) ship H2 with `documentReadiness` fixed at `{kind: "unknown"}` for every new animal (its own
  documented default — "every animal ships as `{kind: unknown}`" per the schema's comment) and
  **omit document-status editing from K3 entirely** for now, since the field already defaults
  correctly without any admin UI at all, and the feature it serves (cross-border eligibility) isn't
  live yet.

Recommendation: (b) for documents specifically, matching `docs/standing-constraints.md`'s "do not
scaffold ahead of the current phase" — the field already behaves correctly with zero UI, and
building a mismatched 3-checkbox version now would need redoing when cross-border actually needs
it. For vaccination/spay-neuter, the fix is small (a 3-option control instead of 2, writing a
`shelter_declared` attestation; a conditional read-only render on `source === "registry"`, which
can't actually occur yet but costs nothing to render correctly) — worth just fixing in the K3 spec
rather than deferring, since unlike documents this field is in active, immediate use.

---

## 3. A screen/flow KABINET.md doesn't show: how does evidence get into the system at all?

S3 is specified as a *review* screen — it assumes `VerificationEvidence.items` already has
content. Nothing in K1–K5 or S1–S5 shows evidence being submitted. H2's own scope
(`docs/handoff-2026-10-04.md` §3.1) says `onboard-shelter.ts` "survives as the bulk import path for
a shelter that hands over a spreadsheet" and CSV import is cut from the UI — but evidence
*specifically* (registration docs, bank details, references, site-visit notes) isn't CSV-shaped
data; it's the thing S2's "create shelter + invite" flow presumably needs to capture, or that
`onboard-shelter.ts` already populates today. Needs a decision: does S2 grow an evidence-entry step
(so the operator enters what a shelter emailed them), does the shelter submit it themselves before
`verified` (a screen not yet in scope for anyone), or does the script remain the only path and S3
is purely read-only until re-review is built? Check `onboard-shelter.ts` for what it already does
before deciding — it's the one place evidence might already be getting created today, outside any
of the screens above.

---

## 4. Smaller items, cheap to resolve, listed so they don't get silently picked either way

- **`ops@opika.org.ua` vs. the already-shipped `hello@opika.org.ua`** (`/pro`'s contact row,
  `uk.about.contact`). KABINET.md's own file list calls this out as a placeholder — confirming here
  that the product already has a real, different address live, in case that's the one to reuse
  rather than standing up a second inbox.
- **"«Олексій»" named directly** (S2's success copy, K5's "Написати Олексію") **vs. the
  unnamed-first-person convention the rest of the product uses** — `/prytulkam`'s own commitment
  register (`docs/standing-constraints.md`, commitment 6: «я внесу все сам», «відповідаю я») never
  names him; K5 itself elsewhere says «оператор реєстру» (role, not name) in the same screen. Worth
  picking one register and using it consistently, same reasoning as the name-not-final discipline
  in `CLAUDE.md` — a literal name in a button label is a different kind of commitment than a role
  description.
- **Does a shelter's contact/donation edit need operator review before going live?** (KABINET.md's
  own Open question 3.) Genuinely open, not resolved by any existing code — this one is really
  Oleksii's call.

---

## What this document is not

Not a contract proposal. The actual `packages/contracts` shapes for the kabinet router, the
Zod schemas for new procedures, and the route map come after the decisions above — writing them
before would mean building against evidence-card fields and a documents UI that may not survive
review, the exact thing H2's own "contract-first... reviewed by Oleksii before implementation"
requirement exists to prevent.
