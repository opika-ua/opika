# Decisions inbox: feat/dr1-s8-saved-page

Rows for the shared table (`docs/decisions-inbox.md`), appended at merge. Tier 1 (a public
page's claim, plus a new public endpoint — adds SQL via `animalRepo.findByIds`, so this PR does
not merge on a clean review; it waits for Oleksii's real-Neon smoke per the autonomous-mode
instructions).

| ID | Date | Row | Question | Options | Default taken | Oleksii's answer | Status |
|---|---|---|---|---|---|---|---|
| S7-F1 | 2026-10-23 | Carried from S7 (`feat-dr1-s7-save-button.md`), unresolved by S8 | — | — | none: his call on brand voice / accessibility trade-off | — | queued |
| S7-F2 | 2026-10-23 | Carried from S7, unresolved by S8 | — | — | add both tests | — | queued |
| S7-F3 | 2026-10-23 | Carried from S7, unresolved by S8 | — | — | add both tests, or record them as deliberately deferred | — | queued |
| S7-F4 | 2026-10-23 | `docs/designer-round-1.md`'s S7/S8 slice table still assigned `animals.cardsByIds` to S7 after S7 itself deferred building it to S8 | — | — | fixed in this PR: S7's row now reads "store, control" only; S8's row and the coordinator-review bullet underneath the table now name the endpoint | resolved | resolved |
| S7-F5 | 2026-10-23 | Carried from S7, unresolved by S8 | — | — | fix the comment | — | queued |
| S8-D1 | 2026-10-23 | DR1-Q2's `credentials: "omit"` for `animals.cardsByIds` means the request can never satisfy `proxy.ts`'s pre-launch gate (it reads the request's `cookie` header), so the gate 403s this endpoint on every call while `SITE_IS_PUBLICLY_DISCOVERABLE` is false. **Revised after review of 529a6cc, finding 3:** my first version claimed the exemption "leaks nothing… the same shape/visibility `/tvaryny` already serves through the gate" — false. `/tvaryny` still requires the gate cookie; this path, once exempted, answers *anyone* with a bare id and no cookie, a materially wider exposure during the pre-launch window than the kabinet/cron exemptions (both his own prior answers — IN-Q1, KH-T5 — not a builder default) | Exempt this one endpoint from the pre-launch gate, accepting what it exposes pre-launch — yes or no? | leave the gate as-is (the feature silently 403s on every call until launch) · add the exact-path exemption | **no default taken — his call, not mine.** Code built and tested either way; `proxy.test.ts` covers the exempt/still-gated/no-cookie-minted cases regardless of which way this goes | — | **open — blocks merge** |
| S8-D2 | 2026-10-23 | DR1-Q2's copy list gives `unavailable: "{name} більше не показується на сайті."` but no sentence for the case where a saved id resolves to no animal at all (the contract has no name to fill the template with). **Twice-revised after review of 529a6cc, finding 2:** first tried inventing Ukrainian myself (not the builder's call); then tried `unavailableUnnamed: [COPY PENDING]`, which `open-writes-copy-gate.test.ts`'s "nothing in the entire uk catalogue is pending" caught — Q-B (Oleksii, 2026-10-19: "the guard checks the entire catalogue; nothing pending anywhere") means `[COPY PENDING]` live anywhere in `uk.ts` turns production sign-in off site-wide, not only under `kabinet.*` | Give this case a sentence (his Ukrainian), or drop it from the page? | `unavailableUnnamed` ships `[COPY PENDING]` · drop the case entirely | drop the case — the only option that's neither invented Ukrainian nor a sign-in kill switch. `hasSomethingToShow` filters a `name: null` item out before render; the dead key removed from both catalogues | — | taken (reversible — his call to overturn at merge) |
| S8-F4 | 2026-10-23 | Review of 529a6cc, finding 4: the handler returned a draft's real `name` to any cookie-less caller — a draft was never public, so this leaked more than the contract's own doc comment claimed ("no one outside it can ever see this response," also false for a cookie-less public endpoint) | — | — | fixed: `name` is the real name only when `isListedAnimal(animal) && hasBeenVerified(shelter.verification)`. Contract comment corrected. New tests for a draft and a listed-but-shelter-never-verified fixture; the "shelter no longer verified" fixture switched from one review of 3fce3b7 flagged as its own overclaim — see S8-F5 below | — | taken (reversible — his call to overturn at merge) |
| S8-F1 | 2026-10-23 | Review of 529a6cc, finding 1 (blocker): CI was red — `neon-smoke.test.ts` still asserted `outcomes.length).toBe(40)` in two places after step 41 was added to `neon-smoke.ts` in the same commit, because that commit's own `pnpm check` claim hadn't actually run this file | — | — | fixed: both assertions updated to 41, confirmed green against local Postgres (plain and the `{ rows }`-shaped driver simulation) | — | resolved |
| S8-F5 | 2026-10-23 | Review of 3fce3b7, finding 1 (not a blocker, batched): `wasEverPublic`'s premise overclaims — publishing does not require shelter verification (a pending shelter's admins can publish; `uk.ts:1826`, `email-senders.ts:188`), so a card published while pending/paused/suspended and withdrawn before the shelter ever reached `verified` still has its name returned, even though that specific listing was never actually rendered on any public page. `hasBeenVerified` approximates "was this row ever shown" with "has the shelter ever been verified," which aren't the same fact when a shelter can write before verification | — | — | left as the approximation for this round — closing it precisely needs a stored "was ever publicly rendered" fact per listing, which doesn't exist today and is real product/schema work, not a quick fix. Softened the overclaiming comments in the handler and contract; the test comment that called the never-verified fixture "unreachable" was false and is removed | — | queued, follow-up batch |

## Review notes (not blockers — follow-up batch, not fixed in this round)

From the review of 529a6cc:
- The harness's "no cookie" test (`saved-page.harness.ts`) checks `request.headers()`, which
  Playwright strips cookies from regardless of what the request actually sent — the test can't
  fail even if `credentials: "omit"` were removed. Needs `request.allHeaders()` instead.
- Nothing tests that exactly 200 ids are accepted (only that 201 is refused), and `MAX_LIKES`
  (the client cap) isn't tied to `MAX_SAVED_CARDS_PER_REQUEST` (the server cap) by any assertion.
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
`proxy.ts` gate exemption above (open, S8-D1). Full `pnpm check` green (typecheck, lint, apps/web
3028+ tests, `build:web`, 156 Playwright harness specs including the four new
`saved-page.harness.ts` flows) — rerun after the review-driven fixes below, not just at 529a6cc.

Mutations recorded:
- removing `!isGateExemptExactPath(...)` from `proxy.ts`'s gate condition turns
  `proxy.test.ts`'s "exempts animals.cardsByIds..." test red (`expected 403 to be 200`);
- removing the `wasEverPublic` guard in the handler turns the new draft test red (the real name
  comes back instead of `null`).

## Status after the review of 529a6cc

**STOP**, two blockers fixed in this round (S8-F1, S8-F4 above), one left genuinely open for him
(S8-D1) and one copy decision converted to the standard pending mechanism (S8-D2). Re-review
needed as a delta before this can merge; real-Neon smoke still required regardless (new SQL).
