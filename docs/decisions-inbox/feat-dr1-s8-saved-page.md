# Decisions inbox: feat/dr1-s8-saved-page

Rows for the shared table (`docs/decisions-inbox.md`), appended at merge. Tier 1 (a public
page's claim, plus a new public endpoint — adds SQL via `animalRepo.findByIds`).

**Real-Neon smoke: run by Oleksii, 2026-10-23**, against a fresh child branch at head `3fce3b7`,
guard on, Node 24: 41 passed, 0 failed (step 41 is `animals.cardsByIds`'s own, added this PR).
Child branch deleted after.

| ID | Date | Row | Question | Options | Default taken | Oleksii's answer | Status |
|---|---|---|---|---|---|---|---|
| S7-F1 | 2026-10-23 | Carried from S7 (`feat-dr1-s7-save-button.md`), unresolved by S8 | — | — | none: his call on brand voice / accessibility trade-off | — | queued |
| S7-F2 | 2026-10-23 | Carried from S7, unresolved by S8 | — | — | add both tests | — | queued |
| S7-F3 | 2026-10-23 | Carried from S7, unresolved by S8 | — | — | add both tests, or record them as deliberately deferred | — | queued |
| S7-F4 | 2026-10-23 | `docs/designer-round-1.md`'s S7/S8 slice table still assigned `animals.cardsByIds` to S7 after S7 itself deferred building it to S8 | — | — | fixed in this PR: S7's row now reads "store, control" only; S8's row and the coordinator-review bullet underneath the table now name the endpoint | resolved | resolved |
| S7-F5 | 2026-10-23 | Carried from S7, unresolved by S8 | — | — | fix the comment | — | queued |
| S8-D1 | 2026-10-23 | DR1-Q2's `credentials: "omit"` for `animals.cardsByIds` means the request can never satisfy `proxy.ts`'s pre-launch gate (it reads the request's `cookie` header), so the gate 403s this endpoint on every call while `SITE_IS_PUBLICLY_DISCOVERABLE` is false. Revised after review of 529a6cc, finding 3: my first version claimed the exemption "leaks nothing… the same shape/visibility `/tvaryny` already serves through the gate" — false, and the comment was corrected before asking | Exempt this one endpoint from the pre-launch gate, accepting what it exposes pre-launch — yes or no, and if yes, what has to be enforced? | leave the gate as-is (the feature silently 403s on every call until launch) · add the exact-path exemption, with a specific enforcement list | — (no default — his call) | **his answer, verbatim:** "(b), exempt /api/rpc/animals/cardsByIds from the pre-launch gate, with all of these enforced and tested: POST only; valid animal ids only, at most 200; the per-IP rate limit; the public view only (what /tvaryny/{id} shows, via PublicShelterSchema); Cache-Control: no-store; nothing logged about which ids were asked for. The gate is a bot shutter, not a security boundary (my 2026-09-13 note). The ids come only from gated pages, so this adds no way to enumerate. Record the reason next to the exemption in proxy.ts / prelaunch-gate.ts in those words." Built: POST-only enforced in `route.ts` (`CARDS_BY_IDS_PATH`, checked before the rate limiter or the DB, new harness test `"refuses anything but POST"`); the 200-id cap already existed, now also tested at exactly 200 (`"accepts exactly 200 ids"`), not only past it; the per-IP rate limit confirmed independent of the gate exemption with a new harness test that spends the real budget; the shelter shape confirmed `ShelterSummaryView`-exact (the same projection `/tvaryny/{id}` returns) with a new test checking both the raw wire text and the exact key set; `Cache-Control: no-store` and the no-logging guarantee were already built and tested. `proxy.ts`/`prelaunch-gate.ts` both carry his reasoning now, attributed | **answered — resolved, merging** |
| S8-D2 | 2026-10-23 | DR1-Q2's copy list gives `unavailable: "{name} більше не показується на сайті."` but no sentence for the case where a saved id resolves to no animal at all (the contract has no name to fill the template with). **Twice-revised after review of 529a6cc, finding 2:** first tried inventing Ukrainian myself (not the builder's call); then tried `unavailableUnnamed: [COPY PENDING]`, which `open-writes-copy-gate.test.ts`'s "nothing in the entire uk catalogue is pending" caught — Q-B (Oleksii, 2026-10-19: "the guard checks the entire catalogue; nothing pending anywhere") means `[COPY PENDING]` live anywhere in `uk.ts` turns production sign-in off site-wide, not only under `kabinet.*` | Give this case a sentence (his Ukrainian), or drop it from the page? | `unavailableUnnamed` ships `[COPY PENDING]` · drop the case entirely | drop the case — the only option that's neither invented Ukrainian nor a sign-in kill switch. `hasSomethingToShow` filters a `name: null` item out before render; the dead key removed from both catalogues | — | taken (reversible — his call to overturn at merge) |
| S8-F4 | 2026-10-23 | Review of 529a6cc, finding 4: the handler returned a draft's real `name` to any cookie-less caller — a draft was never public, so this leaked more than the contract's own doc comment claimed ("no one outside it can ever see this response," also false for a cookie-less public endpoint) | — | — | fixed: `name` is the real name only when `isListedAnimal(animal) && hasBeenVerified(shelter.verification)`. Contract comment corrected. New tests for a draft and a listed-but-shelter-never-verified fixture; the "shelter no longer verified" fixture switched from one review of 3fce3b7 flagged as its own overclaim — see S8-F5 below | — | taken (reversible — his call to overturn at merge) |
| S8-F1 | 2026-10-23 | Review of 529a6cc, finding 1 (blocker): CI was red — `neon-smoke.test.ts` still asserted `outcomes.length).toBe(40)` in two places after step 41 was added to `neon-smoke.ts` in the same commit, because that commit's own `pnpm check` claim hadn't actually run this file | — | — | fixed: both assertions updated to 41, confirmed green against local Postgres (plain and the `{ rows }`-shaped driver simulation) | — | resolved |
| S8-F5 | 2026-10-23 | Review of 3fce3b7, finding 1 (not a blocker, batched): `wasEverPublic`'s premise overclaims — publishing does not require shelter verification (a pending shelter's admins can publish; `uk.ts:1826`, `email-senders.ts:188`), so a card published while pending/paused/suspended and withdrawn before the shelter ever reached `verified` still has its name returned, even though that specific listing was never actually rendered on any public page. `hasBeenVerified` approximates "was this row ever shown" with "has the shelter ever been verified," which aren't the same fact when a shelter can write before verification | — | — | left as the approximation for this round — closing it precisely needs a stored "was ever publicly rendered" fact per listing, which doesn't exist today and is real product/schema work, not a quick fix. Softened the overclaiming comments in the handler and contract; the test comment that called the never-verified fixture "unreachable" was false and is removed | **his answer, verbatim:** "S8-F5 (a never-shown card's name coming back) goes on the launch-gate list as a hard item. It must be fixed before the first real shelter." Added to `docs/build-plan.md`'s Part 5, "Before the first real shelter or animal record is inserted," matching PW1-F6's existing format for a known, hard-gated gap | **known gap — hard launch-gate item, build-plan.md Part 5** |

## Review notes — fixed as part of S8-D1's enforcement list

From the review of 529a6cc, both closed when his S8-D1 answer asked for POST-only and rate-limit
enforcement to be tested:
- The harness's "no cookie" test (`saved-page.harness.ts`) checked `request.headers()`, which
  Playwright strips cookies from regardless of what the request actually sent. Fixed to
  `request.allHeaders()`.
- Nothing tested that exactly 200 ids are accepted (only that 201 is refused). Added
  `"accepts exactly 200 ids"` in `animals-cards-by-ids.test.ts`.

## Review notes — still open, genuinely follow-up material

- `MAX_LIKES` (the client cap, `likes-store.ts`) isn't tied to `MAX_SAVED_CARDS_PER_REQUEST`
  (the server cap) by any assertion.
- `useSavedCards.ts`'s fetch `.catch(() => {})` leaves the page showing only its title on any
  failure (a 429, offline, or a non-UUID id a tampered `localStorage` could hold).
- `SavedPageScreen` has a couple of arbitrary Tailwind values and a `min-h-10` that loses to a
  later class in the built CSS — cosmetic, not a behaviour gap.
- `proxy.test.ts`'s new exemption tests have no percent-encoded/double-slash spellings the way
  the cron exemption's tests do — the gap only ever fails safe (stays gated), so it's a coverage
  gap, not a security one.

## What this PR builds

`animals.cardsByIds`: contract, DB (`animalRepo.findByIds`), handler, the saved page
(`/zberezheni`), its hook and screen, the nav link, the `/pro` fifth paragraph (DR1-Q4), and the
`proxy.ts`/`prelaunch-gate.ts` gate exemption, resolved per his S8-D1 answer. Full `pnpm check`
green: typecheck, lint, apps/web 3063 tests, `build:web`, 158 Playwright harness specs (the
original four `saved-page.harness.ts` flows plus two new ones — `"refuses anything but POST"`,
`"the per-IP rate limit still applies, even though the gate doesn't"`).

Mutations recorded:
- removing `!isGateExemptExactPath(...)` from `proxy.ts`'s gate condition turns
  `proxy.test.ts`'s "exempts animals.cardsByIds..." test red (`expected 403 to be 200`);
- removing the `wasEverPublic` guard in the handler turns the new draft test red (the real name
  comes back instead of `null`);
- disabling `route.ts`'s POST-only check turns `"refuses anything but POST"` red (405 → no
  response/undefined `Allow` header);
- mutating the handler to add `shelter.exactAddress` to the response did **not** turn the new
  shape test red — oRPC's own contract-stripping (`implement(contract)`, the mechanism
  `handlers-implement-contract.test.ts` already proves) drops any field the output schema
  doesn't declare before the handler's return value ever reaches the wire, confirmed by reading
  the raw response text directly. Reverted; the test's real mutation target is its own expected-
  keys list (removing one entry from it does turn the test red), which is what actually guards
  against the contract's picked fields drifting, not a handler-level leak this mechanism already
  closes off structurally.

## Status

**Resolved.** S8-D1 answered (exempt, with the enforcement list built and tested above); real-
Neon smoke run by Oleksii at `3fce3b7` (41/0); S8-F5 added to `docs/build-plan.md`'s launch gate
as a hard item per his instruction. Merging at the reviewed head once CI is green.
