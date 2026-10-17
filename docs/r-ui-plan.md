# R-UI: operator screens (plan)

Scope is Oleksii's (inbox RU-B1..RU-B5, verbatim there). This is the plan he asked for before any
UI: the screen list, the API gaps, the PR split and the access model. The copy is in
`docs/r-ui-copy-sheet.md`. Read at `main` `a92e8a1`.

**What R-UI supersedes.** RG-Q1 (verbatim: "API only (19 procedures, scripts, migration). Screens
in their own PR + copy sheet.") never ruled screens out; R-UI is that screens PR. R-UI does
replace RO-D1's "404 intended for now" (which retires RO-F1), KS-T11's "after leaving support the
operator goes to `/`", and the "API only (RG-Q1)" comments in `apps/web/src/features/kabinet/home.ts`
and `SupportBanner.tsx`.

**Sources.** `M33`/`M34`/`M35` = `docs/design/Opika Kabinet.dc.html` at that line (frames S1–S5).
`K` = `docs/design/KABINET.md`. The mock gives structure only (test logic, not looks; the designer
restyles). Where the markdown and the mock disagree, the markdown wins.

---

## 1. Screens

| Screen | Route | Purpose | Procedures | States |
|---|---|---|---|---|
| Operator entry | `/kabinet` | Replaces the operator's 404 | None new. `kabinetHomeOf` gains an `operator` kind, decided by `decideAccess({surface:"registry"})`, and redirects to `/kabinet/prytulky` | super_admin: redirect · shelter admin, support view: unchanged · no role, conflicting roles: 404 · anonymous: `/kabinet/vkhid` |
| S1 Притулки | `/kabinet/prytulky` | Every shelter, the ones waiting on the operator first (RG-T2); name search; status filter with counts; open one | `registry.shelters.list` (search and status in URL params), public `cities.list` for city names | loading · empty (link to S2) · no match · load error with retry · stale cursor (restart at page 1) · 404 for non-operators |
| S2 Новий притулок | `/kabinet/prytulky/novyi` | Create a shelter and invite its first admin. The normal path; the onboarding script stays as the bulk backup (RU-B2) | `registry.shelters.create`, then `registry.admins.resendInvite` from the success state | idle · field errors (checked by the contract's own input schema) · submitting (one request only) · success, per invite-email outcome · refusals (the address already has a role ×3, a site visit dated in the future, an unknown city) · lost answer (never retried: create is not idempotent; the screen says to check the list) |
| S4 Притулок (S3 folded in) | `/kabinet/prytulky/[id]` | One shelter: status and time in it, evidence and the decision panel, donation decision, admins and blocked addresses, read-only legal data, address and contacts, history | `registry.shelters.byId`, `registry.history.list`, `registry.admins.blockedAddresses`; writes `registry.verification.*`, `registry.donation.*`, `registry.admins.*` | one panel per status (pending, under review, verified, paused, suspended, rejected); refusals: illegal transition, insufficient evidence (with the gap list), donation conflict, admin already gone; a lost answer re-reads before saying anything |
| S5 support view | the existing `/kabinet` support render | Read-only view as the shelter | `registry.support.enter` (one button on S4), exit lands on `/kabinet`, which redirects to the list | already built: banner, frame, exit |

The S4 edit forms (contacts, description, legal data, address) are not in the first cut: the
procedures exist (`updateProfile`, `updateVerifiedData`), but Oleksii's minimal scope doesn't list
them. They are R-UI 4, later.

## 2. API gaps

Every interaction in the minimal scope has a procedure except one.

| Interaction | Verdict |
|---|---|
| **Admins count on the S1 row** (RU-B2 item 1) | **Gap.** `RegistryShelterRowView` has no admin field; only `byId` carries admins, and one `byId` per row would be N+1. Proposal: `admins: { joined, invited }` on the row, filled by one grouped subquery in `listPage` (built like `animalCount`, counting the way `adminsOf` does: members, plus pending invitations including expired ones, each address once). SQL change: a real-Neon check before it's called verified |
| Why a verified shelter sorts first on S1 | **Minor gap**, proposed alongside: `donationPending: boolean`. The rank already puts a shelter with a pending donation link first, but the row doesn't say why |
| City names on the row, the create form's city list | Not a gap: public `cities.list` |
| Search | Not a gap, but it matches the display name only (RG-T3), so the copy can't promise city or ЄДРПОУ search |
| Create | Not a gap. The form must also collect the **description** (required, public) and the **coordinates** (required by `ExactAddressSchema`, never public, and there is no geocoder) |
| Evidence documents | Not a gap, by design: `acceptEvidence` refuses every `documentKey` (RG-Q5). The form offers the four kinds that need no document; every legal form's policy can be met without one |
| Verification, donation, admins, blocked addresses, history | Not gaps: `procedures.ts:592-701` |
| Admin join date and invite-sent date (the mock shows both) | Not in `ShelterAdminView`. Dropped from the first cut, not claimed as a gap |
| **Changing the display name** | **Gap outside the minimal scope.** No procedure changes it; a typo made at create can only be fixed in SQL, which a UI-only rehearsal can't do (RU-B1). See question 8 |
| Support mode | Nearly free: one button, one constant, one copy key, about three tests |

## 3. PR split

All three are Tier 1 (review before commit, mutations, full inbox records). One R-UI PR open at a
time beside PR 4 → 5 → 6, never more than two open feature PRs (RU-B4, WM-B1).

| PR | Scope | Key tests | Needs first |
|---|---|---|---|
| **R-UI 1** | The row contract change and its SQL (real Neon); `/kabinet` operator redirect; the operator shell (nav, name from `KABINET_OPERATOR_DISPLAY_NAME`, role label, «Вийти»); S1; S4 read-only (status, evidence, legal data, address, contacts, donation, admins, blocked list, history with paging) | principal table through the served router (anonymous → sign-in; super_admin → data; shelter admin, support view, no role, conflicting → 404; unknown id → 404); each new page 404s while sign-in is unavailable; the row's counts (joined vs invited, expired invitation counted as invited, a member with a stale invitation counted once); every history kind renders a line (exhaustive switch); Playwright: an operator lands on the list and opens a shelter, a shelter admin gets 404 there | his approval of the contract change, and his final copy for section 1 of the sheet |
| **R-UI 2** | S2 create; the four-kind evidence editor (reused by resubmit); the form-to-input mapping as pure functions; K4's contact fields reused | the mapping's output parsed by the contract's own input schema (never re-implemented); no `documentKey` ever produced; each invite outcome and each refusal mapped; a lost answer sends exactly one request; Playwright: create an unregistered initiative (site visit plus two references) and open it as «Очікує» | R-UI 1, section 2 copy |
| **R-UI 3** | S4 actions: verification moves (approve gated by the domain's own `evidenceGaps`, the reason dialog with code and note, reinstate naming the prior state, resubmit prefilled); donation approve/reject; admins invite/resend/remove with confirmation; support mode if he says so (Q5); the shelter-side reason if he says so (Q7) | **FSM parity:** for each of the six states, the offered actions are exactly the operator events `transition()` accepts; the dialog stays disabled until code and note are set; illegal transition and conflict re-read the view; resubmit with no edits sends the same items; Playwright along RU-B5 step 5: start review → approve → suspend with a reason → reinstate → history shows each line | R-UI 1 and 2, section 3 copy, and the shared reason dialog (risks) |
| R-UI 4 (later) | S4 edit forms, and the display-name path if Q8 is yes | | |

## 4. Access model

- **Who gets in:** a super_admin outside support mode (`decideAccess` → `allow_registry`). Everyone
  else signed in gets 404 on `/kabinet/prytulky/**` and FORBIDDEN from `/api/kabinet/registry/*`
  (already pinned for every `registry.*` procedure by `kabinet-registry-access.test.ts`). Anonymous
  goes to sign-in.
- **Each page guards itself.** It resolves the identity and calls a picked, read-only registry
  router in-process, never `support.enter` (that sets a cookie); the router's own access check
  decides, and FORBIDDEN or NOT_FOUND becomes `notFound()`. A layout can't stop its page, so there
  is no layout-only guard and no `principal.kind` check outside `decideAccess`.
- **Writes** go from the browser to `/api/kabinet/registry/*`, which already has the Origin check,
  the per-user limit and the 503 without the location key.
- **The operator never sees a shelter write screen.** `decideAccess(shelter, write)` refuses a
  super_admin, and `/kabinet` redirects the operator before the profile loads. PR 4/5's
  `/kabinet/tvaryny…` pages get an operator row in their page tests (404 outside support).
- **One role per address holds**, so the redirect can't collide with K4: conflicting roles are
  404 everywhere, invite refuses an operator's address, `admin:grant` refuses an invited one.
- **Independent of the allowlist.** The registry path never reads the shelter write policy, so
  R-UI needs no `KABINET_WRITE_ALLOWLIST`, no `testShelterOnly` copy, and its harness runs without
  them. Commitment #6 is unchanged (R-UI opens no shelter write; the operator still does the work)
  and #2 holds (no engagement numbers; the view key-list tests pin it).
- **The operator's browser receives the full record** (exact address, evidence). Kabinet pages are
  already `force-dynamic`; a source scan keeps `features/kabinet/operator/**` imported only from
  `app/kabinet/prytulky/**`.

## 5. Decisions taken (reversible, for the PR body)

- RU-T1: `/kabinet` redirects the operator to `/kabinet/prytulky`.
- RU-T2: S3 is folded into S4; no separate review route.
- RU-T3: S1 rows only link; no row actions, and the mock's per-row state line is dropped (the row has no such data).
- RU-T4: search and status filter live in URL params.
- RU-T5: operator pages 404 without `LOCATION_HMAC_SECRET`, as the API does (RG-Q10).
- RU-T6: coordinates are one "lat, lng" field; the district is not collected (sent as null).
- RU-T7: new keys live in `kabinet.operator.*`.
- RU-T8: history lines by another operator get a generic label (there is one operator today).
- RU-T9: a lost create answer is never retried.
- RU-T10: the S4 edit forms wait for R-UI 4.

## 6. Risks

- **The reason dialog is shared** by K4's pause, PR 5's withdraw reason and R-UI 3. Whichever lands
  first extracts it; R-UI 3 ideally follows PR 5.
- **`uk.ts` and `copy-status.test.ts` conflicts** with #115 and PR 4–6: R-UI keeps its keys and pins
  in their own blocks.
- **Resubmit replaces the evidence list wholesale.** The form prefills it. ~~The old list survives in
  the history entry~~: false (R-UI 3 review): `shelter_created` stores no evidence and `resubmit`
  stored only what it sent. Fixed per his answer (N6, option (a)): the server carries existing
  `supporting_document` items over on resubmit, and an unchanged site visit keeps its original
  `visitedBy` (AW-R3-11).
- ~~Site-visit dates are checked in UTC.~~ Fixed in R-UI 2 (RU-B6, his code change): the "not in
  the future" check uses the Kyiv calendar date (`isSiteVisitInFuture`), so a visit entered as
  "today" just after Kyiv midnight is accepted.

## 7. Questions for Oleksii

RU-Q1..RU-Q9 in `docs/decisions-inbox/docs-r-ui-scope.md`, each with a recommendation: the copy
gate, the row contract change, evidence documents, create-then-verify, support mode, the first
admin vs RU-B5 step 2, the shelter seeing the reason, the display-name gap, and the voice.
