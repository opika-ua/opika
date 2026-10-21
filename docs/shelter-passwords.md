# Shelter passwords: contract and flows (for Oleksii's review, before any code)

Tier 1 (auth). Planned after PR 6 and before designer round 1. Nothing here is built. His
scope, verbatim, is at the end (§11). §9 is the question batch, and each question has a
recommendation. Every Ukrainian string quoted here is his (from §11) or an existing catalogue
key; any new string is given as its English sense, with the Ukrainian left to him (§7).

## 1. What changes, and what doesn't

- **Shelter admins** get a password: set from the invitation, used on the sign-in page, reset by email,
  changed in the kabinet. The magic link stays as a second way in.
- **The operator stays magic-link only.** No password is ever stored for a user with an active
  `super_admins` row, and no path can create one (§4.6).
- **Unchanged:**
  - who can create shelters or invite (only `registry.admins.invite`, commitment #6);
  - access rules (`decideAccess`);
  - the adopter's anonymous session;
  - every other secret.

## 2. Facts from the code (Better Auth 1.6.33, read from `node_modules`, not assumed)

| Fact | Where | Consequence |
|---|---|---|
| `auth_account.password` already exists (`text`, nullable) | `packages/db/src/schema/auth.ts` | Passwords need **no migration**. A credential is an `auth_account` row with `provider_id = 'credential'` |
| `emailAndPassword: { enabled: false }` today | `apps/web/src/kabinet/auth.ts` | Enabling it adds `/sign-in/email`, `/sign-up/email`, `/request-password-reset`, `/reset-password`, `/change-password` |
| Sign-in with an unknown address, or a user with no credential, still runs `password.hash(password)` and throws the same `401 INVALID_EMAIL_OR_PASSWORD` | `dist/api/routes/sign-in.mjs:287–310` | The enumeration property (§5) holds in Better Auth itself. Our layers must not break it |
| `/request-password-reset` creates a token and calls `sendResetPassword` for **any** existing user, the operator included | `dist/api/routes/password.mjs:58–86` | Our `sendResetPassword` must send only to shelter admins, and a guard must stop the token being created for the operator (§4.6) |
| `/reset-password` **creates** a credential account if the user has none | `password.mjs:162` | Without a guard, a reset would give the operator a password. That's the main hole (§4.6) |
| Reset tokens are stored as `identifier = 'reset-password:<token>'`, in plain text by default | `password.mjs:77`, `db/internal-adapter.mjs:600` | His "stored hashed" needs `verification.storeIdentifier: { default: "plain", overrides: { "reset-password:": "hashed" } }` (SHA-256, built into 1.6.33, `verification-token-storage.mjs`) |
| Sessions today: 7 days idle, 30 days absolute (HS-Q8); the absolute cap is enforced in our `hooks.before` and by the clean-up (`KABINET_SESSION_ABSOLUTE_MS`) | `auth.ts`, `auth-expiry-repo.ts` | F-B9's 30-day rolling / 90-day cap changes those two numbers (§4.5) |
| Auth email goes through **Resend** (EM-B10: production sets `EMAIL_PROVIDER=resend`, `EMAIL_SIGN_IN_PROVIDER` unset; Brevo's code stayed as a grace-period rollback, refused in config since PW1-Q4, §4.4). Resend has **no per-message tracking option**: click and open tracking are per-domain settings, active only with a verified tracking subdomain. Our payloads carry no tracking field or header | `email-provider.ts:296`; Resend's API reference (send email; update domain) | His rule, "no tracking on any auth email, ever", is enforced at the Resend domain plus a payload test (§4.4). The code comments about Brevo's click tracker describe the provider being retired |
| Per-address limiter keys are plain (`address:<email>`); only IP keys are HMAC'd (EM-Q11) | `sign-in-limit.ts:36`, `invite-landing.ts:86` | "HMAC'd keys as now" is true for IPs, not for addresses (§9, Q7) |

**PW1-F5 (2026-10-20), on the first row:** storing a password still needed no migration, but ending
the sessions atomically with it did. Migration 0013 (additive: a function and two triggers on
`auth_account`) ends every session of the user inside the statement that writes the password, and
Better Auth's revokes stay as a second line (`docs/decisions-inbox/fix-pw1-f5-atomic-session-revoke.md`).

## 3. Password policy (domain, pure)

`packages/domain`, no I/O:

```ts
type PasswordVerdict =
  | { kind: "ok" }
  | { kind: "too_short"; min: 10 }
  | { kind: "too_long"; max: 128 }
  | { kind: "common" };            // on the bundled list (§9, Q2)

passwordVerdictOf(password: string): PasswordVerdict
```

- **Length** is counted in characters as a reader counts them (`characterCount`, the same rule as the
  display-name cap). There are no composition rules (NIST 800-63B §5.1.1.2).
- **The check runs on the server, on every write path:** invitation, reset and change. Better Auth's
  own `minPasswordLength: 10` and `maxPasswordLength: 128` stay set as a second line.
- **The common list** is matched case-insensitively against the whole password. The list is a
  bundled module, with no third-party call (§9, Q2).
- **The hint while typing** is client-side and limited to the length and a "too common" result
  returned on submit (§9, Q2). The check itself lives on the server, never only in the browser.
- **Hashing:** Better Auth's default (scrypt). Passwords are never logged, echoed, put in a URL, or
  returned in a response body. A test asserts no response or log line contains the submitted
  password (§8).

**PW1-F8 (2026-10-20), on logging:** Better Auth's own logger and its error handler
(`onAPIError`) write through the masking in `apps/web/src/kabinet/auth-log.ts`: an error (an
`instanceof Error` only) is its name and SQLSTATE only, an address is masked (URL-encoded too), a
token-shaped value replaced, and Drizzle's `params:` part cut whatever its case. Better Auth's
router no longer prints an unexpected error whole. After the review's STOP (two paths that print a
raw query error: Better Auth's fallback join, and a direct `auth.api.getSession`), query errors are
also cleaned where they happen (Oleksii's Q1, (i)): the database handle Better Auth is given, and
the kabinet's principal path, go through `withQueryErrorsCleaned`
(`apps/web/src/kabinet/clean-query-errors.ts`). A cleaned error keeps its name, SQLSTATE and the
constraint, table, schema and column names (both drivers' spellings, on it and its cause); it has
no message, no SQL, no parameters, no `detail` or `where`. `principal.ts` also rethrows anything
else `getSession` throws cleaned. `clean-query-errors.test.ts` forces failures at the driver (both
drivers' error shapes, an outage) and finds no address, token, password or `params:` in any log
line or thrown error; every caller that reads a SQLSTATE behaves as before.

## 4. Contract

### 4.1 Better Auth configuration (`createKabinetAuth`)

```ts
emailAndPassword: {
  enabled: true,
  disableSignUp: true,                 // no self sign-up: an account exists only through an invitation (commitment #6)
  autoSignIn: false,
  minPasswordLength: 10,
  maxPasswordLength: 128,
  resetPasswordTokenExpiresIn: 3600,   // 1 h
  revokeSessionsOnPasswordReset: true, // every session of that user, after a reset
  sendResetPassword: …,                // shelter admins only, after the response (§4.4)
  onPasswordReset: …,                  // «пароль змінено» notice email (§4.4)
},
verification: {
  modelName: "auth_verification",
  storeIdentifier: { default: "plain", overrides: { "reset-password:": "hashed", "invite-password:": "hashed" } },
},
```

`hooks.before` additions, beside the existing per-IP / per-user / absolute-cap checks:

- `/sign-up/email` → always refused, even though `disableSignUp` is set. Two locks, one test each.
- `/sign-in/email`, `/request-password-reset`, `/reset-password`, `/change-password` are added to
  `LIMITED_AUTH_PATHS` (per IP), and each gets its per-account limit (§4.3).
- **Operator guard** (§4.6) on `/request-password-reset`, `/reset-password`, `/change-password` and the
  invite acceptance.

Better Auth's `GET /reset-password/:token` (its redirecting callback) is never emailed and not
forwarded. The email links to our page, like the magic link's confirm page (IN-Q11): its GET only
shows the form, and only its POST consumes.

### 4.2 Pages and the one new procedure

| Route | GET | POST |
|---|---|---|
| `/kabinet/vkhid` | email + password form (primary), «Надіслати посилання для входу» (secondary, today's magic link), «Забули пароль?» | `/api/auth/sign-in/email` (Better Auth) |
| `/kabinet/vkhid?zaproshennia=<token>` | «Створіть пароль»: password, repeat, show/hide. The GET looks nothing up and touches nothing (today's EM-Q3 rule) | `kabinet.invitation.acceptWithPassword` (below) |
| `/kabinet/vkhid/zabuly` | the email field | `/api/auth/request-password-reset` |
| `/kabinet/vkhid/novyi-parol?token=<t>` | new password and repeat. The GET looks nothing up | `/api/auth/reset-password` |
| `/kabinet` → «Змінити пароль» | current, new and repeat | `/api/auth/change-password` with `revokeOtherSessions: true` |

The one new oRPC procedure goes through `implement(contract)`. It takes no session: the token is the
credential.

```ts
// packages/contracts — kabinet.invitation.acceptWithPassword
input:  { token: InviteTokenSchema; password: string }       // never logged
output: { kind: "signed_in" }                                 // session cookie set
errors: INVITE_UNUSABLE            // unknown, expired, withdrawn, already used, or the address is an operator: one answer
        | PASSWORD_REJECTED { reason: "too_short" | "too_long" | "common" }
        | TOO_MANY_REQUESTS
```

What it does, in one transaction where it writes:
1. per-IP charge;
2. consume the `invite-password:<token>` verification row (stored hashed, 72 h, single use);
3. load the invitation it names: live, and the email is the invitation's, never the request's;
4. refuse if that email belongs to an operator;
5. `passwordVerdictOf`;
6. create the user if the invitation hasn't yet;
7. create the `credential` account with Better Auth's hash;
8. accept the invitation (membership);
9. sign in through Better Auth's `sign-in/email`, server-side, so the cookie comes from Better Auth.

**PW1-F5 (2026-10-20):** step 7 before step 9 is required, not only the order written: inserting
the credential ends every session of the user (migration 0013), so a session created before it
would be signed out at once.

Today's invitation id stops being the link's secret. The invite email carries a separate random token,
stored hashed through the same `storeIdentifier` override, so **no migration** is needed.

**As built in PW-2 (2026-10-20, unreviewed; `docs/decisions-inbox/feat-pw-2-invite-password.md`):**
- **The GET reads.** His Q1 replaces "the GET looks nothing up" above: one read-only lookup by the
  token's hash. It shows the form (the shelter and the address, masked) or one identical unusable
  page for every failure kind. It consumes nothing, charges no budget and sends nothing.
- **Headers.** `no-store` and `no-referrer`, since the form's POST is a `fetch`.
- **The token.** Our own `auth_verification` row (`kabinetInviteTokenRepo`): SHA-256 of
  `invite-password:<token>`, value `invitation:<id>`. Better Auth never reads it, so no
  `storeIdentifier` entry was needed.
- **The order.** Charge, read, policy, consume, credential (and the address marked verified),
  void reset links, sign in, accept. The accept runs after the sign-in, as on every sign-in
  (IN-Q12), rather than before it as in steps 8 and 9 above.
- **The output** gains `password_set`: set, but the sign-in didn't go through (the delay).
- **Query errors** (PW1-F8): every statement of the link's page and its POST runs on the cleaned
  handle (`inviteTokensOf`, `withQueryErrorsCleaned`), so a failed one logs no token, address or
  `params:`.

### 4.3 Rate limits (shared Upstash store, keys never plain)

| Action | Per IP | Per account (key = HMAC of the normalised address, §9 Q7) |
|---|---|---|
| Sign in with password | the kabinet per-IP budget | **increasing delay, no lockout:** after 5 failures in 15 min, each further attempt for that address waits 1, 2, 4, 8, then 15 min (the cap) before it is even checked; a success resets it |
| Forgot password | 20/h | 3/h |
| Reset (token POST) | 20/h | — (the token is single use) |
| Change password | per user, the existing budget | — |
| Invite acceptance | 20/h | — (single use) |

The per-account delay applies to **any submitted address**, existing or not, so it can't be used
to find accounts. Its message is the same for every address (§9, Q5).

### 4.4 Emails (copy → him, §7)

- **Reset link**, sent only if the address is a shelter admin's (never the operator's). It's sent
  after the response, like today's magic link (`deps.schedule`), so the answer takes the same time
  either way.
- **The «пароль змінено» notice**, sent after a reset (and after a change, §9 Q4), with his
  «…якщо це не ви — напишіть мені» and the contact address.
- **No tracking on any auth email, ever** (his rule, 2026-10-19). Resend can't express this per
  message, so three locks:
  1. **A test** pins every auth email's provider payload to exactly `{ from, to, reply_to, subject,
     html, text }`. A `headers`, `tags` or tracking field fails it. The same test runs for each
     provider config can route to (Resend alone, item 3).
  2. **The domain check, by hand** (revised 2026-10-20, PW1-Q5). As first built,
     `email:delivery-test` read the Resend domain and refused unless `click_tracking` and
     `open_tracking` were both false; that read needs more than a sending-only key. His answer,
     verbatim: "PW1-Q5: (b). Keep a sending-only key and drop the domain-reading check from the
     script. Tracking stays verified by hand: the Resend dashboard shows click and open tracking
     off, and the links in the received email are plain. Add both as runbook steps for each
     delivery test." The two steps are in `docs/onboarding-a-shelter.md` ("Every delivery test").
  3. **Resend only, in config** (2026-10-20, PW1-Q4). `EMAIL_PROVIDER` and
     `EMAIL_SIGN_IN_PROVIDER` accept `resend` alone (`AUTH_EMAIL_PROVIDERS`), so Brevo, whose
     click tracker rewrites every link (IN-E8), can't carry an auth email; the delivery test
     refuses `--…-provider brevo` by name. His answer, verbatim: "PW1-Q4: (a). Lock auth emails
     (sign-in, invite, reset, password changed) to Resend in config, with a test that a Brevo
     setting is refused for them. Note: the Brevo keys are already revoked, so this makes the
     current state explicit. The full Brevo removal stays planned for after the 14 Nov check."

### 4.5 Sessions (F-B9)

- `expiresIn: 30 days`, `updateAge: 1 day`: a rolling 30-day idle expiry.
- `KABINET_SESSION_ABSOLUTE_MS = 90 days`, the same constant in our `hooks.before` and in the
  clean-up (which deletes sessions past the cap, KH-Q12's job).
- **As built (revised 2026-10-20).** The two bullets above are not what shipped:
  - Better Auth's `expiresIn` is the 90-day cap, and the 30-day idle limit is ours, on
    `updated_at`, in `hooks.before`, the second line and the clean-up. The kabinet reads sessions
    server-side, which never renews the cookie, so a 30-day `expiresIn` would end every session 30
    days after sign-in, used or not (PW1-D12, the builder's decision).
  - `updateAge` is 0: the session refreshes on every kabinet request, so "30 days from the last
    visit" is exact (PW1-Q2, answered (b); his words in `docs/decisions-inbox/feat-pw-1-passwords.md`).
  - The one source for the numbers, by role, is `KABINET_SESSION_LIMITS` (`packages/db`), not a
    `KABINET_SESSION_ABSOLUTE_MS` constant.
- For the operator, see §9 Q3.
- **/pro:** no sentence states a kabinet session length today. F-B9 asks /pro to gain one (new copy,
  §7). The «…протягом доби» clause keeps holding, because the clean-up deletes a session at most a
  day after either expiry.

### 4.6 The operator can never have a password

- **Guards** (each tested, each mutated):
  - `request-password-reset` for an operator address answers exactly as for an unknown one, and
    creates no token;
  - `reset-password` whose token names an operator user is refused (`INVITE_UNUSABLE`-style
    generic), so no credential is created;
  - `change-password` by an operator session → 403 (they have no credential anyway);
  - invite acceptance for an operator address → `INVITE_UNUSABLE`;
  - `sign-up/email` → refused for everyone.
- **Invariant test:** after every flow in §8, no `auth_account` row with `provider_id='credential'`
  belongs to a user with an active `super_admins` row.
- **If one ever appears anyway,** sign-in with it is refused. A `hooks.before` on `/sign-in/email`
  checks the role first and answers the generic 401.

## 5. Sign-in security: the indistinguishability test

- **One answer for every failure:** an unknown address, a known address with the wrong password, a
  shelter admin with no password yet, and the operator all get the same status (401) and the same
  body text.
  - A fifth (PW1-F6): a sign-in whose password was right when Better Auth checked it, but was
    written by a reset or a change while the sign-in ran, gets that same answer, its headers
    included, and keeps no session (`apps/web/src/kabinet/sign-in-race.ts`).
- **Timing:** Better Auth hashes a dummy on the unknown and no-credential paths. The test runs each
  case N times and asserts the medians lie within a tolerance that a real difference (hash skipped)
  breaks. Its mutation removes the dummy hash in a wrapper and shows the test going red.
- **The per-account delay** (§4.3) behaves identically for existing and unknown addresses.

**PW1-F4 (2026-10-20), on the timing bullet:** the test no longer reads the clock. Comparing
wall-clock medians went red once on a busy machine and passed in CI, so it now asserts the work
that makes the time instead, by order (`password-flows.test.ts`, "similar timing, as the work behind
it …"): every cause, and a success, runs exactly one scrypt, awaited before anything else starts,
among a wrong password's limiter calls and statements. Two causes run fewer reads, and the test
pins that rather than hiding it: an unknown address skips Better Auth's credential read, and the
operator skips both of Better Auth's reads (inbox PW1-F4-Q1). Mutations: the operator guard's dummy
hash removed, Better Auth's unknown-address dummy hash removed, the guard's hash left un-awaited,
an extra statement on the operator's path; each turns it red.

**PW1-F7 (2026-10-20), on the operator's two reads:** the operator guard now makes Better Auth's
user and credential reads itself, through Better Auth's own call
(`internalAdapter.findUserByEmail(email, { includeAccounts: true })`), before its dummy hash, so the
operator's work equals a wrong password's, statement for statement, and the test pins that
equality. The unknown address's skipped credential read stays, a recorded residual (inbox
PW1-F4-Q1, his (b)): revisit if the per-address delay is ever loosened.

## 6. Flows

1. **Invite:** the operator invites (unchanged); the email carries `/kabinet/vkhid?zaproshennia=<token>`
   → «Створіть пароль» → POST → signed in, the membership accepted, the invitation used up. Opening it
   again → the existing "already accepted" state (`inviteLanding.alreadyAccepted`, his text).
2. **Sign in:** email + password → kabinet. Wrong → the generic error. Too many → the delay message.
3. **Forgot:** the address → always the same answer (English sense: "if this address is a shelter admin's, a link is on its way"; copy → him) → the email (shelter admins
   only) → the reset page → new password → **every session of that user ends** → the notice email →
   sign in.
4. **Change:** the kabinet's «Змінити пароль» → current + new → other sessions end, this one stays
   → the notice email (§9 Q4).
5. **Existing admins** (they have no password): they use «Забули пароль?» (his item 9). The magic link
   still works too.
6. **Operator:** magic link only, everywhere.

## 7. Copy (→ him; one sheet per PR, nothing invented)

- **Sign-in page:** the password label, the sign-in button, his «Надіслати посилання для входу» (secondary)
  and «Забули пароль?», the generic error, the delay message.
- **Invite page:** his «Створіть пароль», the repeat field's label, show/hide labels, the hint, the three
  rejection reasons, a mismatch message, the unusable state (reuse today's).
- **Forgot / reset pages:** the field, the always-same answer, the new-password form, success, an
  expired or used token.
- **Kabinet:** his «Змінити пароль», the current/new/repeat labels, success, a wrong-current-password message.
- **Emails:** the reset email (subject, body, button, expiry); the «пароль змінено» notice (subject,
  body, his «…якщо це не ви — напишіть мені»).
- **/prytulkam:** «Увійти в кабінет» → `/kabinet/vkhid` (his item 1).
- **/pro, public claims:**
  - the password-storage line («зберігається лише незворотний хеш», his item 10);
  - the kabinet session length (F-B9).
- **Runbook:** the `BETTER_AUTH_SECRET` rotation section changes. Rotation no longer signs everyone
  out for good, since passwords survive a rotation. The KH-Q12 purge steps still apply, because
  sessions and links are the secret-bound part.

## 8. Tests (logic and flows only, by role, label and text)

- Set a password at the invitation → signed in, membership accepted. A second use → unusable.
- Sign in; wrong password; the generic error, the same for an unknown address (§5).
- Forgot → reset → **every old session is gone** (a second signed-in client is refused) → the
  notice is sent.
- Change password → the other session is gone and this one survives → the notice is sent.
- The operator can't: request a reset (no token row), reset, change, accept an invite, sign up, or
  sign in with a password (§4.6, with the invariant test).
- Rate limits: the per-IP and per-account delays and their messages, the same for unknown addresses.
- The policy: 9 / 10 / 128 / 129 characters, a common password, a multi-part character counted as
  one.
- Reset tokens and invite tokens are stored hashed: the row's identifier isn't the token.
- No password in any response body or log line.
- Neon smoke (new SQL paths: credential create, reset-token consume): steps after the last one, his
  run.

## 9. Questions for him: answered 2026-10-19

**His answers, verbatim (2026-10-19):** "1. (a): separate single-use hashed 72h token; opening the link only shows the form; no tracking; reset links the same. 2. SecLists top-100k (MIT, NOTICE line), server-only; the live hint shows length; "too common" on submit. Also reject passwords containing the email's local part, the shelter's name, or "opika" (case-insensitive). 3. (a): the operator keeps 7 days idle / 30-day cap, enforced by role. The operator never has a password. 4. Yes: «пароль змінено» after a change too. 5. (a): generic wrong-credentials sentence, plus «Забагато спроб входу. Спробуйте ще раз через {minutes} хв.» shown identically for every address (plural pin for minutes). 6. Confirmed: 30-day rolling / 90-day cap for shelter admins ships with passwords. 7. Yes: every per-address limiter key becomes an HMAC of the address, like IP keys. Send the copy sheet, then build after PR 6 merges." Also: "Both #136 safeguards approved: the exact-payload test ({from,to,reply_to,subject,html,text} only) and delivery-test refusing if tracking is on."

**What they change in this contract:**
- §3's verdict gains one variant: `{ kind: "contains_personal" }`, for a password containing the email's local part, the shelter's name, or "opika", case-insensitive. The policy function therefore takes `{ email, shelterName }` alongside the password.
- §4.3's delay message is his «Забагато спроб входу. Спробуйте ще раз через {minutes} хв.», pinned for several values of `{minutes}`.
- §4.5: the operator keeps 7 days idle and a 30-day cap, enforced by role in `hooks.before`. Shelter admins get 30 days rolling and a 90-day cap.
- §4.4: the notice goes out after a reset and after a change.
- The questions below are kept as asked, for the record.

### The questions as asked

1. **The invitation link becomes a bearer credential.** Today the invite link only asks for a magic
   link to the invited mailbox, so holding the link isn't enough. With «Створіть пароль» on the link,
   whoever holds the URL in its 72 h sets the password: a mail scanner or a forwarded email. A click
   tracker would too, if one were on; with Resend and tracking off (§4.4) there is none.
   - (a) As specified: a separate single-use token, stored hashed, 72 h; the GET shows only the form,
     so a scanner that only opens links consumes nothing; Resend tracking off (§4.4); the reset link
     gets the same.
   - (b) The «Створіть пароль» page first emails a 15-minute confirmation to the invited address.
     This proves the mailbox, at the cost of one more step.
   - **Recommend (a).** It's the standard invite and reset model; the GET-only form already
     defends against scanners that open links.
2. **The common-password list (asset licensing).**
   - Recommend SecLists' `10-million-password-list-top-100000.txt`, MIT licence (an attribution
     line in NOTICE), about 0.8 MB, bundled server-side only.
   - The hint while typing shows the length. "Too common" comes back on submit, so the 0.8 MB never
     ships to browsers.
3. **The operator's session length.** F-B9's 30 rolling / 90 cap is "for shelter admins".
   - (a) The operator keeps 7 idle / 30 cap, enforced in our hook by role.
   - (b) The same as shelter admins.
   - **Recommend (a):** the most privileged account keeps the shorter sessions.
4. **The «пароль змінено» notice after a change too, not only after a reset?** Recommend yes: the
   same email, the same reason.
5. **The delay message.**
   - (a) One generic sentence for wrong credentials, plus a separate honest sentence (English sense:
     "too many attempts, try again in N minutes"; your Ukrainian), identical for every address.
   - (b) Fold everything into the one generic sentence.
   - **Recommend (a):** it tells the truth, and it reveals nothing about which addresses exist.
6. **F-B9's timing.** You said "Not before the first real shelter". This scope lands before the
   first real shelter (after PR 6, before designer round 1). Confirm the 30/90 change ships with
   passwords.
7. **HMAC the per-address keys.** Today `address:<email>` sits in Upstash in plain text. Switch every
   per-account key (the magic link, reset, the password delay) to an HMAC of the address, the way IP
   keys already work. Nothing user-visible changes, and existing counters simply restart. Recommend
   yes.

## 10. PR split (two feature PRs, contract first, one copy sheet each)

- **PW-1:**
  - the policy domain;
  - the Better Auth config;
  - the sign-in page (password primary, magic link secondary);
  - forgot → reset with the notice;
  - change password;
  - the operator guards;
  - the limits;
  - sessions (F-B9);
  - /pro lines;
  - the runbook rotation update;
  - the Neon smoke steps.
- **PW-2:**
  - invite → «Створіть пароль» (the hashed invite token, the procedure, the page);
  - /prytulkam «Увійти в кабінет»;
  - the dress-rehearsal steps.

**Migration:** none expected (`auth_account.password` and `auth_verification` already exist). If
building shows otherwise, the PR states its kind (additive expected) and follows the
"Migrating production" block.

**PW1-F5 (2026-10-20):** one migration after all, additive: 0013, the session revoke made atomic
with the password write (§2's note). It follows the "Migrating production" block.

**Dress rehearsal, added to the final script:** invite → set the password → sign out → sign in with
the password → forgot password → reset (the old session is gone).

## 11. His scope, verbatim (2026-10-19)

"New scope (Tier 1, auth). Plan it after PR 6, before designer round 1. Contract and flow first in docs/shelter-passwords.md for my review, then build.

Shelter admins get passwords; the operator account stays magic-link-only (no password ever).
1. «Для притулків» page: add «Увійти в кабінет» → /kabinet/vkhid.
2. Invite flow: the invite link opens «Створіть пароль» (password + repeat, show/hide). Single-use, 72h, bound to the invited address. Accepting sets the password and signs in.
3. Sign-in page: email + password as the primary form; «Надіслати посилання для входу» (existing magic link) stays as a secondary option; «Забули пароль?» link.
4. Password policy (NIST 800-63B): min 10, max 128 characters, no composition rules, reject passwords on a bundled common/breached list (local, no third-party calls), hint while typing. Hash with Better Auth's default (scrypt); never log or echo passwords.
5. Sign-in security: one generic error for every failure; rate limits per IP and per account (HMAC'd keys as now) with increasing delays, no hard lockout; tests that a wrong email and a wrong password are indistinguishable (same text, same status, similar timing).
6. Forgot password: always the same on-screen answer; an email only if the address belongs to an existing shelter admin (never the operator); single-use token, 1h, stored hashed, rate-limited per address and per IP. On reset: all other sessions are revoked, and a «пароль змінено» notice email is sent («…якщо це не ви — напишіть мені»).
7. Kabinet: «Змінити пароль» (requires the current one; revokes other sessions).
8. Sessions: 30-day rolling, 90-day absolute cap (F9), for shelter admins. Check the /pro sentences still hold.
9. Existing admins without a password use «Забули пароль?»; no migration of credentials. If Better Auth's schema needs a change, state the migration kind (additive expected).
10. Copy: a copy sheet for every new string and both emails → me. The /pro line on password storage («зберігається лише незворотний хеш») is a public claim → me.
11. Tests: flows by role/label (set password at invite, sign in, wrong password, forgot → reset → old sessions gone, change password); operator can't set or use a password; the enumeration test; the rate-limit tests.
Add it to the final dress-rehearsal script: invite → set password → sign out → sign in with password → forgot password → reset."
