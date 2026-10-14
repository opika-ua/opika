# Review: feat/h2-kabinet-hardening, uncommitted delta on 702bf75 (pass 3, Tier 1, delta only)

VERDICT: STOP, carried over and blocking the merge only. Findings 1–4 from pass 2 are fixed. The delta adds no code blocker. The STOP is the two pass-2 decisions still waiting for Oleksii, plus one new runbook step for him to approve. Everything else is notes.

VERIFIED | TAKEN ON TRUST
--- | ---
Touched suites on **Node 24.21.0**: proxy.test.ts and kabinet/auth.test.ts, 74/74 passed | The builder's full `pnpm check` (2019 unit; harness 219 passed, 3 skipped). It ran on **Node 22.22.3**, not CI's 24
`node:module.stripTypeScriptTypes` exists on Node 24.21 and works: positions kept, `import type` erased. It emits only an ExperimentalWarning, and no deprecation even with `--pending-deprecation --throw-deprecation`. If the API ever changes, the scanner throws or returns nothing for `proxy.ts`, so the sanity test goes red rather than green | That no future 24.x minor changes the experimental API
Builder's mutation spot-checked: a bare `import "./kabinet/runtime";` gives 2 failures, the not-include message and the 11 heavy entries, as recorded. The other two mutations in the message describe real breaks |
I ran the scanner on 31 adversarial inputs (copied out to the scratchpad). It handles: imports inside strings and templates, nested templates, `obj.import(...)`, `?.import`, regexes with `/` in a class, `"http://"` in a string, tagged templates, static fields and static blocks, `if (x) import()` with no braces, ternaries, call arguments, `export default await import()` |
Mutation (finding 2): adding `/api/auth/organization/accept-invitation` to FORWARDED gives "expected [ '/organization/accept-invitation' ] to deeply equal []" |
Runbook: Better Auth 1.6.33 writes `auth_verification` from magic-link, password, update-user (change email / delete user), email-otp, one-time-token, two-factor, phone, siwe, oidc/mcp, and OAuth `state.mjs`. This app configures only magicLink and organization, with `emailAndPassword` off, no social providers and no change-email or delete-user. Invitations live in `auth_invitation`. `consumeVerificationValue` runs before the user lookup and deletes the row. The TTL is 900 s, and `BETTER_AUTH_SECRET` is read only in `auth-route.ts`. So the paragraph is accurate |
All mutated files restored. `git diff --stat` matches the pre-review state |

FINDINGS (most severe first)
1. [low] proxy.test.ts `moduleLoadImports`: an IIFE is a false green. `void (async () => { await import("./kabinet/runtime"); })();` appended to proxy.ts gives 32/32 passed. The scanner treats every arrow or function body as deferred, even one that is invoked right away. Fix: count a function expression wrapped in `(…)` and followed by `(`. Otherwise name IIFEs in the doc comment as a known blind spot. The same blind spot is unavoidable for a callback that runs right away, such as `run(() => import(…))`. The doc comment should say the walk is syntactic.
2. [low] `closure()`: a relative specifier that resolves to none of `.ts`, `.tsx` or `index.ts` is skipped silently (for example a directory with `index.tsx`, or `.mts`). The `.tsx` case throws, this one doesn't. Throw on an unresolved relative specifier as well, so that "fail, don't skip" covers both.
3. [info] The `@/` alias (tsconfig `paths`) is neither followed nor matched by HEAVY. `import "@/kabinet/runtime"` goes red today only because vitest can't resolve the alias (18 behaviour tests fail). The walk itself doesn't catch it. If an alias is ever added to the vitest config, the guard goes blind. Fix: map `@/` to `src/` in `closure()`.
4. [info] The scanner is conservative the other way too: `() => g(import(…))` (an arrow body that is an expression containing a call) counts as loading with the module. That is a false red, which is the safe direction. No action.
5. [note] Finding 2's test is sound. It is built from both live arrays, so it isn't a self-comparison. KH-T4 is now honest about the Node version and describes the widened walk accurately.

SIMPLIFICATIONS
- None new. The pass-2 `hooks.before` simplification was deliberately left out of a fix commit, which is fine.

STOP REASON (merge only; commit is fine)
1. **KH-T6** (carried): production refuses to boot without a `CRON_SECRET` of 32+ characters. Needs Oleksii's yes, and the secret set before deploying.
2. **KH-T5** (carried): `/api/cron/auth-cleanup` is exempt from the pre-launch gate. Needs his yes.
3. **New:** the runbook now tells the operator to run `DELETE FROM auth_verification;` on the production Neon branch after a suspected link exposure. It is safe as written (see the ledger): it is his manual action, no code runs it, and the worst case is someone with a link in flight asking for a new one. But it is a prescribed production deletion, and it goes beyond the "one-paragraph runbook entry" he asked for. He should approve the step in the PR. If the organization plugin or any other Better Auth plugin is ever enabled, re-check the "nothing but links" sentence.
This is pass 3 on the row. Per the two-pass cap, findings 1–3 become PR comments or follow-ups, not blockers.

TESTS
apps/web, Node 24.21.0: src/proxy.test.ts + src/kabinet/auth.test.ts, 2 files, 74 passed. Mutations: side-effect import gives 2 failed, 30 passed; IIFE gives 32 passed (finding 1); `@/` alias gives 18 failed, all module resolution; accept-invitation forwarded gives 1 failed.
