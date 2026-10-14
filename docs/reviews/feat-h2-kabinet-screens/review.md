# Review: feat/h2-kabinet-screens (d9c8108, 37d763b, d07c22b on ccd9301)

VERDICT: PASS WITH NOTES

VERIFIED | TAKEN ON TRUST
--- | ---
Touched suites: apps/web kabinet layout, features/kabinet, home-page (real DB): 5 files, 40 passed; i18n copy-status: 14 passed | Full `pnpm check` (pasted green for d9c8108/37d763b, but no `test:harness` line in any commit body; d07c22b gives only lint and typecheck)
Spot-check mutation: home.ts FORBIDDEN mapped to sign_in gives 3 failed, "expected { kind: 'sign_in' } to deeply equal { kind: 'not_found' }", which matches the commit | The other 10 recorded mutations (they are present and specific)
Access mapping: anonymous goes to sign_in; no_role, conflicting roles and super_admin give not_found; admin gets own shelter; support_view gets its shelter (real DB) | Harness 404 pin for /kabinet and /kabinet/vkhid (caller's run: 219 passed, 3 fixme)
Mock K1 360/1440 and K4 360 opened: K1 paddings, gaps, 56px controls, 64px header match; K4 card padding, row typography and dashed block match | 360px geometry and focus rings in the rendered page (the specs are `fixme`, KS-T3)
No engagement data anywhere; exactAddress rendered only as city + line1/2, no coordinates; ShelterProfile is a server component, so only `shelterName` crosses to the client | 
Every new uk string is COPY_PENDING and pinned by exact key list; «Не записано» is fixed by the standing constraints | 

FINDINGS (most severe first)
1. [medium] SignOutButton.tsx:1198-1200, 1220 and SessionControls.test.tsx:283 claim that "the sign-in page re-checks the session". It doesn't: `app/kabinet/vkhid/page.tsx` is static.
   Failure scenario: on a shared PC, sign-out fails (offline or 5xx). The user still lands on the sign-in form and believes they are signed out. The cookie is still live, so the next person who opens /kabinet is inside the shelter's cabinet.
   Fix: either the vkhid page checks the session and redirects a live session to /kabinet, or a failed sign-out shows an error. Then correct the comment and the test name.
2. [medium] features/kabinet/home.ts:1354-1372 calls `decideAccess` + `profileGet` directly, which bypasses `shelterKabinetRouter`'s guard and the `KabinetShelterViewSchema` output stripping. `kabinetShelterViewOf` passes nested objects (legalEntity, exactAddress, contact) through unparsed. This departs from gallery-contract-decisions §5 (Server Components call the router in-process via a router client). No leak today: rendering is field-by-field on the server. The home-page test only pins the top-level keys.
   Fix: call the kabinet router in-process and map its errors (UNAUTHENTICATED goes to sign_in, FORBIDDEN to not_found).
3. [medium, unrecorded decision] The /kabinet page sits outside every limiter. The HS-Q10 per-IP/per-user limits live only in `rpc-route.ts`, and `proxy.ts` limits only `/tvaryny`. Each page load does getSession, a role lookup, support, shelter and city queries with no cap. It is dark in production now. Needs an inbox row (Tier 1 subject, rate limits) before the invite PR turns it on.
4. [low] SignInCard.tsx:1066-1069: a failed resend is silent. `sendFailed` renders only in the entering state, so the user taps «Send again» and nothing happens.
5. [low] Claims inside the pending drafts, for Oleksii's copy pass (KS-C1/C2):
   - "opens the cabinet on this device" is false: the link opens on whichever device clicks it.
   - "we cannot see who wrote to you" sits close to commitment #2, while `reveals` does record who took the contact.
   - "15 minutes" (MAGIC_LINK_TTL_SECONDS) and "about a kilometre" (decision #11) are true.
6. [low] KS-T10 drops the operator email, so the locked note says "write to {operator}" with no channel to write through. The page gives an instruction the shelter cannot follow.
7. [low] K4 360 draws the chip after the note. The code puts it before the note.

Tests that don't test:
- SignInCard.test.tsx:874 "looks the same for any address" passes by construction: the component receives no signal that could differ. The real guarantee belongs to the route test.
- The focus/48px assertions match class names only (shape). Rendered proof is deferred to the fixme specs.

SIMPLIFICATIONS
- home.ts: replace the access mapping with a router-client call (finding 2). It removes a second copy of the access matrix. Risk if wrong: error mapping changes, which the existing home-page tests catch.
- SignInCard.test.tsx:874: delete the tautological test. Nothing that currently guards anything breaks.
- ShelterProfile.tsx:581: unexport `Row` (one file uses it). Nothing breaks.

TESTS
apps/web (touched): Test Files 5 passed (5), Tests 40 passed (40)
packages/i18n copy-status: Test Files 1 passed (1), Tests 14 passed (14)
Mutation spot-check: 3 failed | 4 passed (7), reverted
