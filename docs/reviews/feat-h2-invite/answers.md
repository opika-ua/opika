# Review: uncommitted "Oleksii's 2026-10-14 answers" on feat/h2-invite (HEAD 0be5158), Tier 1, synchronous

VERDICT: PASS WITH NOTES

VERIFIED | TAKEN ON TRUST
--- | ---
A2 byte-exact: `git diff origin/main -- packages/i18n/src/messages/uk.ts` has exactly one `-` line (the old `kabinet.support.title`); `forShelters.*` and `pro.*` are byte-identical to main. Same for en.ts | Oleksii's verbatim answers (relayed; the inbox labels them "not seen directly", which is correct)
Commitments row 6 and the brand-voice note now describe the live text (A2 unchanged until the wiring commit); the wiring-commit item in h2-next-prs carries the swap, its pin, row 6 and brand-voice | Full `pnpm check` (commit body: 2092 unit, harness 222 passed / 3 skipped)
GET page (read page.tsx): no lookup, limiter, repo, send or clientIp import; only `getDb` for the existing session identity. The action is passed as a reference, never called | Harness case (GETs/HEAD send nothing, POST sends one, Origin + bare-origin Referer). Not run per instructions
Next 16.3 `action-handler.js:440`: Next lets an origin-less action POST through with only a warning, and treats `Origin: null` as a host mismatch. `isSameOriginPost` refuses both and pins to BETTER_AUTH_URL rather than Host. It is stricter and consistent with Next, not in conflict | Works without JS (finding 1)
Action input: `getAll` gives exactly one string or else null; a File or anything else becomes `""`. `inviteLandingOf` charges per-IP first, then the UUID regex, so every unusable id gives the same answer and the same charge. `_previous` (client-serialised) is ignored | Builder's other 13 mutations (present, each names the break and the failure text)
`referrer` metadata emits a `<meta name="referrer">` tag only: no global Referrer-Policy header in next.config or proxy. The meta governs the form POST's and fetch's Origin/Referer. The builder's harness mutation (metadata dropped gives a full-URL Referer) shows the assertion covers it |
Confirm route: `isSameOriginPost` gives the same predicate as the inline check (`origin !== null &&` adds nothing, since `get()` already returned null) |
Cancel CTE: runs only through EXISTS on `"accepted"`'s RETURNING. It touches other ids only, so no double update of one row, and is case-insensitive on the address. Better Auth 1.6.33 `InvitationStatus` includes `"canceled"` (schema.d.mts:319). The guard pins `accepted`/`canceled`. Smoke step 17 logic read |
`tsc --noEmit --incremental false` on apps/web, packages/db and packages/i18n: clean |
**My mutation:** I dropped the email match from the cancel's EXISTS. Result: `accepts the newest … cancels the older ones`, "expected [ 'canceled', 'pending' ] to deeply equal [ 'pending', 'pending' ]" (another address at the same shelter got canceled). Restored, cmp clean |

FINDINGS (most severe first)
1. [low] `InviteLandingForm.tsx:17`, `send-invite-link.ts:22`, inbox EM-T9: claim that the landing "works without JavaScript" has no test. The harness drives only the hydrated fetch path. React/Next do support a server-reference `useActionState` without JS, so this is probably true, but it is unverified. The no-JS path is also the one where the meta referrer must govern a real form navigation.
   Failure scenario: a progressive-enhancement regression (action not a server reference, hidden `$ACTION_*` fields missing) leaves a scanner-safe page whose button does nothing without JS, and the suite stays green.
   Fix: one harness case with `javaScriptEnabled: false`. It should assert one link sent and the same Origin/Referer pair.
2. [low] `send-invite-link.ts:65`: a `forbidden` POST renders as `unusable` («expired»). A cross-site forger learns nothing, which is right. A real volunteer whose Origin differs from BETTER_AUTH_URL (a `www.` or `*.vercel.app` host) is told their invitation is dead. The confirm route answers a plain 403 instead. Invite links point at the canonical origin, so exposure is small. Record the trade-off in EM-T9 or route a canonical-host redirect.
3. [note, for Oleksii] `kabinet.inviteLanding.ready` is builder-added. It carries English sense only, `[COPY PENDING]`, and no Ukrainian is invented. It is flagged in EM-T9 and in copy sheet L. It needs his keep-or-drop.

No defect found in the cancel's scope. Canceling a newer re-invite that lands between plan and write is safe: the accepted invitation is valid for the same shelter and role, the person is a member, and accepting the newer one later would only hit the one-membership conflict. A re-invite committed after the statement's snapshot stays pending. That is outside the stated window, and the registry's invite path is the guard there (not reviewed here).

SIMPLIFICATIONS
- `confirm-route.ts:362`: `origin !== null &&` is redundant against `origin === new URL(...).origin`. Harmless and self-documenting, so keep it if preferred.
- `invite-landing-get.test.ts:17,34`: the `charges` mock is wired into `kabinet/runtime`, which page.tsx no longer imports. The real budget proof is the harness. The mock is a cheap tripwire against re-importing, so it can stay. Just don't cite it as the budget evidence.

TESTS
- apps/web, 11 touched files: 104 passed (104)
- packages/db (accept repo and neon-smoke local): 22 passed (22)
- packages/i18n: 39 passed (39)
