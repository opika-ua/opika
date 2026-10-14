# Review: merge fixes on 9de1abd (uncommitted delta), Tier 1

VERDICT: PASS WITH NOTES

VERIFIED | TAKEN ON TRUST
--- | ---
Touched suites: invite-landing, no-self-serve-yet, confirm-route, 36/36 green | Full `pnpm check` (2072 unit, harness 221/3 skipped, no orphan): read from the builder's message, not re-run
`tsc --noEmit --incremental false`: apps/web exit 0, packages/db exit 0 | PR #95 claim ("with disableIpTracking the forwarded headers change nothing"): scratch test not kept; the code agrees (`getIp` returns null first, `resolveRateLimitConfig` returns null)
Better Auth 1.6.33 source: default `ipAddressHeaders` = `["x-forwarded-for"]`; with no `trustedProxies` it accepts only a single-entry value, otherwise null, which means the `no-trusted-ip` shared bucket in production and 127.0.0.1 under test | Vercel overwriting `x-forwarded-for` (cited from `client-ip.ts`'s documented check, not re-fetched)
Mutation (spot-check): removed `x-forwarded-for` from `FORWARDED`. Both limiter tests went red: "six invitees…" and "six opens from one IP…", `expected [ 'send_failed', 'send_failed', …(4) ]`. Restored | Builder's guard mutations (`db.delete` / `db.insert(authInvitation)`): present, concrete, with failure text
Merge 9de1abd: its only conflict hunk is `docs/h2-invite-copy-sheet.md`, which kept both sides. The email track never touched `confirm-route.ts` or `/kabinet/page.tsx`, so the accept's versions came in unchanged. The vkhid page passes `requestHeaders` both to `clientIp` and to `sendMagicLinkThroughAuth` |
`AcceptableInvitation` / `AcceptPlan`: nothing imports them outside the module |
The A2 text quoted in `brand-voice.md` matches `uk.ts` `whenAnimalFindsHome` exactly. Row 6 says provisional and that the window awaits Oleksii (EM-Q1), with no claim of approval. EM-Q3 is open, Tier 1, no default taken, (b) recommended |

FINDINGS (most severe first)

1. [low] apps/web/src/kabinet/no-self-serve-yet.test.ts:152: `AUTH_INVITATION_WRITE` misses raw SQL that interpolates the table, which is the style the accept module already uses throughout (`sql\`…${authInvitation}…\``).
   Failure scenario: someone adds ``db.execute(sql`DELETE FROM ${authInvitation} WHERE …`)`` to the accept module. Both the narrowed test and the file allowlist stay green.
   Evidence: I appended exactly that to `kabinet-invitation-accept-repo.ts`; no-self-serve-yet still gave 8/8 passed. Restored. Fix: add an alternative such as `(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+\$\{\s*(?:\w+\.)*authInvitation\b`. The same hole applies to `auth_member`'s scan (pre-existing). The file comment says the scan covers "raw SQL", so today that claim is partly false. A renamed import (`authInvitation as inv`) also slips past, and the comment already discloses that one as out of scope.
2. [low] apps/web/src/kabinet/invite-landing.test.ts:251: `rateLimit.enabled = true` is set in `beforeEach` and never reset. Any test added after this describe inherits Better Auth's limiter, and its shared 127.0.0.1 bucket, so it would fail for reasons unrelated to what it tests. Add an `afterEach` that restores the previous value.
3. [note] IP trust: the forwarded value is no weaker than what Better Auth's own `/api/auth` route already trusts. On Vercel, `x-forwarded-for` is overwritten with one address, so it cannot be spoofed and equals the `x-vercel-forwarded-for` that `clientIp` prefers. A client-supplied chain gets no fresh bucket in Better Auth: a multi-entry value resolves to null, which lands in the shared bucket. If a proxy is ever put in front of Vercel, the two keys can diverge (the app reads the Vercel header, Better Auth reads XFF). That divergence is the same for the auth route itself, so it is not new here.
4. [note] docs/decisions-inbox/feat-h2-invite.md IN-T9/IN-T10: "**To do in this PR**" is left in place before "**Built**". The status column is correct; the prose reads contradictory.

SIMPLIFICATIONS
- None. `forwardedClientHeaders` has two callers and replaced a duplicated loop, which is the right size.

TESTS
apps/web: invite-landing + no-self-serve-yet + confirm-route, 3 files, 36 passed (36). Under the mutation: 2 failed | 26 passed (28) for invite-landing + confirm-route; 8 passed (8) for no-self-serve-yet with the raw-SQL delete appended.
