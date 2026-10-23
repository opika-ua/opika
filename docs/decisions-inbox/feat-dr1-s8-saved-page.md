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
| S8-D1 | 2026-10-23 | DR1-Q2's `credentials: "omit"` for `animals.cardsByIds` collides with `proxy.ts`'s pre-launch gate: every request to that path carries no cookie, so the gate (which reads the request's `cookie` header) denies it with 403 on every call while `SITE_IS_PUBLICLY_DISCOVERABLE` is false — found running the saved-page harness against a real server, not inferred from the gate's code; the gate is documented as "a bot shutter, NOT a security boundary" (`proxy.ts`'s own top comment) | leave the gate as-is (the feature silently 403s on every call until launch) · add `/api/rpc/animals/cardsByIds` as a narrow, exact-path gate exemption, the same shape already used for `/api/kabinet`/`/api/auth` and `/api/cron/auth-cleanup` | the exemption (my decision, not his): the alternative ships a feature that cannot work before launch, and the exemption leaks nothing DR1-Q2 was protecting against — the gate's cookie carries no adopter identity, and the data this path returns is the same shape/visibility `/tvaryny` already serves through the gate normally. Reversible: the one-line exact-path list in `proxy.ts` is trivial to narrow or remove. `proxy.test.ts` gained the same exempt/still-gated/no-cookie-minted coverage the cron exemption already has | builder's decision, for his review |
| S8-D2 | 2026-10-23 | DR1-Q2's copy list gives `unavailable: "{name} більше не показується на сайті."` for a saved animal whose record still has a name, but says nothing for the case where the id doesn't resolve to any animal at all (never published, or truly gone) and the contract has no name to fill the template with | `name: null` falls back to the generic `unavailableUnnamed` sentence (my own addition, English sense: "This animal is no longer shown on the site.") · `name: null` renders nothing (an empty card) · `name: null` is refused as a contract shape (every id either has a name or doesn't belong in the response) | `unavailableUnnamed`, my own key, `[COPY PENDING]`-free (direct English→Ukrainian gloss, no judgment call beyond a literal translation — recorded here because the key itself is new, not because the Ukrainian needs his review) | builder's decision | continuing |

## What this PR builds

`animals.cardsByIds`: contract, DB (`animalRepo.findByIds`), handler, the saved page
(`/zberezheni`), its hook and screen, the nav link, the `/pro` fifth paragraph (DR1-Q4), and the
`proxy.ts` gate exemption above. Full `pnpm check` green (typecheck, lint, 5741 unit/component
tests across all packages, `build:web`, 156 Playwright harness specs including the four new
`saved-page.harness.ts` flows).

Mutation recorded: removing `!isGateExemptExactPath(...)` from `proxy.ts`'s gate condition turns
`proxy.test.ts`'s "exempts animals.cardsByIds..." test red (`expected 403 to be 200`), confirming
the guard is load-bearing, not decorative.
