# Kabinet ↔ domain reconciliation

**Status:** decided, 2026-10-07 (Oleksii's own answers below, on every item this document raised).
Contract shapes not yet drafted — see "What this document is not" at the bottom. H2
(`docs/handoff-2026-10-04.md` §3.1) requires type/schema/route proposals reviewed by Oleksii before
any code; this document is that review's *input*, now resolved, not its output.

Read `docs/design/KABINET.md` alongside this — it has been updated to match every decision below.

---

## 1. Two of KABINET.md's four "open questions" were already answered by existing code

**Agreed, both.**

### 1.1 Who sets «На паузі» (Open question 1)

The shelter does, self-service — `reasons.ts`'s own comment: pause "is self-declared,"
suspend "is imposed." Distinct `pause`/`resume` events in the FSM, separate from
`suspend`/`reinstate`.

**Landed in the design:** K4 (shelter profile) gains a pause/resume control —
"Призупинити прийом тварин", with `PauseCodeSchema`'s five codes as the reason options. K2 shows a
persistent banner when paused, so a shelter managing animals is never left unaware of its own
state.

### 1.2 Rejected → pending transition (Open question 2)

Exists — `transition.ts`'s `rejected` state handles `resubmit` → `pending`.

**Landed in the design:** K5 gains «Подати ще раз», alongside «Написати Олексію», not instead of it.

---

## 2. Verification evidence — §2.1

**Decision: mostly (b), trim the design — with one schema change.**

- **`bank_account_holder`: no bank name, no IBAN, masked or not.** `holderName` + `documentKey`
  only, matching the schema exactly today — no change needed there. Oleksii's own reasoning,
  verbatim sense: *the verification copy promises "реквізити на ту саму організацію" — the
  holder-name check is the check, and storing account data adds risk without adding rigour.* The
  design's S3 table is corrected to drop "bank, masked IBAN".
- **`edrpou_registration`: add `registeredName`.** The schema gains one field — the name as it
  appears in ЄДР at the time evidence is checked — so the card can show it **side by side with the
  shelter's own `displayName`/`holderName`**, which is the other half of the same identity check
  the bank evidence performs. **No `edrStatus`** — a point-in-time registry status goes stale the
  moment it's recorded and would read as current when it isn't; not added.
- **`visitedBy` stays a `ModeratorId`, no picker.** §3 below settles who fills it.

This is a real `packages/domain` schema change (`EvidenceItemSchema`'s `edrpou_registration`
variant gains `registeredName: string`), proposed in the contract-shapes step, not made here.

---

## 3. Health & documents — §2.2

**Decision: (b) for documents, fix vaccination/spay-neuter now.**

- **`documentReadiness` stays `{kind: "unknown"}`, no K3 editing.** Matches the schema's own
  documented default; the field already behaves correctly with zero UI, and the feature it serves
  (cross-border eligibility) isn't live. K3's "Здоров'я й документи" section drops the
  Чіп/Ветпаспорт/Довідка checkbox row entirely.
- **Vaccination and spay/neuter get a real fix in the K3 spec, not a deferral:** both become a
  3-option `MedicalState` control, writing a `shelter_declared` attestation. A `source ===
  "registry"` value (not reachable yet — no adapter exists — but the shape already permits it)
  renders read-only, reusing the exact same already-built, already-reviewed display logic below —
  never as an editable control.
- **Checked, not assumed: the public side already has this exact rendering.**
  `apps/web/src/features/animal-detail/medical-labels.ts`'s `vaccinationRow`/`spayNeuterRow`
  already implement the full `MedicalState`-to-label mapping, reusing `uk.medical.*`:
  `unknown` → `uk.medical.unknown` («Не записано» — not «Невідомо»; the earlier draft of this row
  had the wrong word), `in_progress` → `uk.medical.inProgress` («У процесі»), `confirmed` +
  `shelter_declared` → `uk.medical.shelterDeclared` («Слова притулку»), `confirmed` + `registry` →
  a rabies-specific badge (`uk.medical.rabies`/`uk.medical.registry`, per that file's own comment
  on why a registry-sourced vaccination in Ukraine specifically means rabies). **K3's two input
  controls reuse `uk.medical.unknown`/`uk.medical.inProgress` directly for their first two
  options** — no parallel strings. The third option is a different case: `shelterDeclared`
  ("Слова притулку") is a *display* badge naming the provenance, not an action label a shelter
  admin would click to assert "this is done" — there is no existing plain "confirmed" action
  string to reuse. This needs one new key (e.g. `uk.medical.confirm` or similar — Oleksii's to name
  if he wants a specific word) used only by the edit control; **the resulting saved state still
  renders through the unchanged `vaccinationRow`/`spayNeuterRow` functions**, so the display side
  needs no new string and no risk of drifting from the adopter-facing copy.
- **`documentReadiness` already has a public display path too, confirmed unaffected by this
  decision:** `AnimalDetailScreen.tsx` renders `uk.documents.chipPresent`/`.rabiesPresent` chips
  when those two specific items are `present` — an existing, narrower read path that has nothing to
  do with K3's editing question and needs no change here.

---

## 4. Evidence entry — §3

**Decision: S2 gains an evidence step.**

- Reuses `OnboardEvidenceItemSchema` from `packages/db/src/onboard-shelter.ts` — **extracted to a
  shared module** so the script and the kabinet form validate against the exact same schema, one
  definition, two callers (the script's CLI parsing, S2's form submission).
- `site_visit.visitedBy` = **the acting moderator** (the logged-in super_admin completing S2),
  never a free-text field or a picker. The shared schema's `site_visit` variant stays shaped the
  way `OnboardEvidenceItemSchema` already has it (notes only — no `visitedBy` asked for in the
  input shape); the caller fills `visitedBy`/`visitedAt` server-side. `onboard-shelter.ts` keeps
  using its own `FOUNDER_MODERATOR_ID` stand-in (no real moderator login reaches that script); S2's
  handler uses the real authenticated super_admin's id instead — one shared input schema, two
  different fill-in values, matching the `toEvidenceItem`-style conversion already in
  `onboard-shelter.ts`.
- `onboard-shelter.ts` **stays the bulk/import path**, unchanged in its own CLI behaviour.
- **Shelter self-submission is out of H2** — only S2 (operator-entered, at shelter creation)
  exists; no shelter-facing evidence screen.

---

## 5. Smaller items — §4

- **Email: `hello@opika.org.ua`.** No `ops@` inbox stood up. Every kabinet mention (S2 success
  copy, K5) corrected.
- **Naming register:** «Олексій» is fine inside the kabinet — logged-in shelters already know who
  they're dealing with — but **one register per screen**, never mixed within the same screen.
  **Name and email come from one app-level config value**, never hardcoded as a string literal at
  each call site (same reasoning as `CLAUDE.md`'s "name is not final" discipline — one place to
  change, not a grep-and-replace across every kabinet string). Public pages (`/pro`, `/prytulkam`)
  stay unnamed «я», unchanged — this decision is kabinet-only.
- **Profile edits (KABINET.md's own Open question 3) — split, not uniform:**
  - **`donateUrl` and legal/verification data → pending until the operator approves.** Reasoning,
    Oleksii's own: *a swapped donation link on a compromised shelter account is the realistic fraud
    vector, and it's the field adopters trust because it was verified.*
  - **Contacts and descriptions → live immediately**, recorded in an audit log visible in the
    S-screens (S1/S4).
  - **Checked against the FSM for a re-verify trigger, as asked — none fits.** `verified ->
    under_review` is explicitly closed (`transition.ts`'s own comment: a verified shelter moved
    back to review "would silently vanish from the feed with no record it had ever been verified").
    `suspend` is moderator-imposed, punitive, and removes the shelter from the feed — wrong shape
    and wrong optics for "a trusted field changed, give it a second look while staying live."
    **No existing transition does "stay visible, flagged for re-check."** Building one properly is
    the not-yet-built `re_review` state CLAUDE.md's decision 5 already named as future work, not
    H2's. Proposed instead, as its own small addition in the contract-shapes step: a **pending-value
    pair, not a status-machine change** — `donateUrl` gets a proposed value sitting beside the live
    one (`{ url, proposedAt }` or similar) until a super-admin approves or rejects it; the
    adopter-facing contract keeps reading only the live value regardless. Legal/verification data
    edited by a super-admin on S4 needs no new mechanism at all — the operator is already the FSM's
    own authority, so there's no third party to seek approval from; what it needs is the audit-log
    entry below, not a pending-value pair.
  - Both halves land in the actual contract shapes next, not here.

---

## What this document is not

Not a contract proposal. The actual `packages/contracts` shapes — the `EvidenceItemSchema` change,
the extracted evidence-input module, the donation pending-value pair, the audit-log shape, the
kabinet router's procedures — come next. `docs/model-policy.md` assigns exactly this kind of work
("M1 contracts + domain | Opus | Type design. Every later milestone inherits these shapes") to
Opus, the same reasoning already applied to G4's spring physics and R5's seen-set query this
session — flagged for Oleksii's call before drafting, not decided unilaterally here.
