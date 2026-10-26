# H2 invite: a GET never consumes anything (shapes)

**Why.** The email setup handoff's known limitation: Brevo rewrites every link, and mail
scanners follow links. Today the magic link points straight at Better Auth's
`GET /api/auth/magic-link/verify`, which consumes the token on the GET
(`consumeVerificationValue`, better-auth 1.6.33 `plugins/magic-link/index.mjs`). A scanner that
opens the link signs itself in once and leaves the person with a dead link.

**Binding answer** (Oleksii, ahead of this doc, inbox IN-Q11, verbatim there): one button, not
two. The invite page's GET sends a magic link (GET-safe: the only effect is an email to the
address already on the invitation). The magic link opens a confirm page; a POST on «Увійти»
signs in and accepts a pending invitation for that address. No «Прийняти запрошення» button.
No fork or monkey-patch of Better Auth; prefer a thin route of our own that calls Better Auth's
verification server-side on POST.

**Superseded for the invite page (EM-Q3, Oleksii 2026-10-14):** its GET now shows one button and
sends nothing; only that button's POST sends the magic link (`kabinet/invite-landing.ts`,
`docs/decisions-inbox.md` EM-Q3, EM-T9). The confirm page below is unchanged.

## 1. Routes

| Path | Method | Does | Writes |
|---|---|---|---|
| `/kabinet/vkhid/pidtverdzhennia?token=<t>` | GET | The confirm page: one form, one button «Увійти» (`[COPY PENDING]`), the token in a hidden field. Never reads the database. A token that isn't well-formed renders the "link not valid" state, without a form. | nothing |
| same | POST | Checks `Origin` equals `BETTER_AUTH_URL`'s origin (403 otherwise: login CSRF, a page elsewhere posting the attacker's own token). Reads `token` from the form body. Calls Better Auth's verify **through `auth.handler`**, with a server-built `GET {BETTER_AUTH_URL}/api/auth/magic-link/verify?token=…` and no `callbackURL`. 200 → copy its `Set-Cookie`, answer `303 Location: /kabinet`. Anything else → 400 with the "link used or expired" state and a link to `/kabinet/vkhid`. Better Auth's JSON body (it carries the session token) is never forwarded. | Better Auth's own: consumes the verification row, creates the session |
| `/api/auth/magic-link/verify` | any | **No longer forwarded**: 404 from `handleKabinetAuth`. Scanners and old links can't consume through it. | nothing |
| `/kabinet/vkhid?zaproshennia=<id>` | GET | The invite page (IN-Q11): sends a fresh magic link to the invitation's address, under the existing per-address and per-IP sign-in limits. Changes nothing else. | a verification row (Better Auth's) |

Both confirm methods answer 404 while kabinet sign-in is unavailable (KS-T1's convention for
`/kabinet/*`), so production stays dark exactly as now.

**Where the page lives.** A route handler (GET and POST), not `page.tsx`. The three headers
and "GET leaves the token valid" are then asserted against real `Request`s in vitest, the same
way `auth.test.ts` drives `/api/auth`. A `page.tsx` can't be called that way, and Next.js
rewrites `Cache-Control` on dynamic pages, so the header would have been asserted, not
verified. The cost is that the GET's HTML is a small self-contained document (inline CSS, no
external resources), not the screens PR's K1 card (forced choice C3).

**Emailed URL.** `sendMagicLink` receives `{ email, url, token }`. It now builds
`{BETTER_AUTH_URL}/kabinet/vkhid/pidtverdzhennia?token=<token>` itself (`confirmUrlOf`) and
ignores Better Auth's `url`. A `callbackURL` a caller passed to `sign-in/magic-link` is still
origin-checked by Better Auth (403 cross-origin, as today), and is then dropped: after sign-in
the destination is always `/kabinet`.

## 2. Headers, on every confirm response (GET, POST, 303, 400, 403, 404, 405)

- `Cache-Control: no-store`
- `X-Robots-Tag: noindex, nofollow`
- `Referrer-Policy: strict-origin` (the GET's URL holds the token, so no Referer may carry its
  path or query; IN-T8)

**Revised 2026-10-14 (IN-T8, Oleksii's answer to the 9bd1411 review STOP).** This section
originally said `no-referrer`, which contradicted C4: under `no-referrer` a browser sends
`Origin: null` on the «Увійти» form POST (seen in Chromium by the review; in Firefox and
Playwright's WebKit by `test/harness/kabinet-confirm.harness.ts`'s mutation run), so the Origin
check refused every real sign-in. `strict-origin` sends only the origin, to every site
including our own, so the POST carries a real `Origin` and C4's check stays exactly as is. Not
`same-origin`: it sends the full URL, token included, as the Referer of our own POST and into
our own request logs. Not `Sec-Fetch-Site`: Safari before 16.4 (iPhone 7 and older, stuck on
iOS 15) couldn't sign in. Not a double-submit cookie: no new cookie.

## 3. Token lifecycle

| | Value | Where it's set |
|---|---|---|
| Generation | 32 characters, a-z A-Z (~182 bits), Better Auth's `generateRandomString` | Better Auth |
| At rest | SHA-256 hash only (`storeToken: "hashed"`) | `auth.ts`, unchanged |
| TTL | **15 minutes**, `MAGIC_LINK_TTL_SECONDS` (meets "≤15 min"). Kept rather than lowered: ukr.net/i.ua delivery delay hasn't been measured, and a shorter TTL there means links that die before they arrive | `auth.ts`, unchanged |
| Single use | `consumeVerificationValue`: inside `runWithTransaction` + `consumeOne` by row id; the second consume of the same row finds nothing → `INVALID_TOKEN` | Better Auth |
| Consumed by | **POST only** (§1). No GET path reaches `consumeVerificationValue` | this slice |
| Logged by us | Never in production. The development `consoleSender` prints the link by design (it is dev's delivery channel and is never selected in production, `kabinetAuthAvailability`) | unchanged |

The GET's URL still carries the token in its query string, as the verify URL did before. It
reaches the platform's request logs; it is single-use, 15-minute and hashed at rest (C2).

## 4. `FORWARDED_AUTH_PATHS` and the RG-Q9 guard

```ts
export const FORWARDED_AUTH_PATHS = [
  "/api/auth/sign-in/magic-link",
  "/api/auth/get-session",
  "/api/auth/sign-out",
] as const;
```

The confirm POST calls `auth.handler`, the entry point `handleKabinetAuth` already forwards to,
not `auth.api.*`. So **the sign-in part needs no change to `no-self-serve-yet.test.ts`**: no
`.api.` call is added, no organization path is forwarded, nothing writes `auth_member`.

**Acceptance does.** "Accepts it" writes `auth_member` from source, which is exactly what the
guard's "no source file writes auth_member" forbids until A1-A3/B1 are live (HS-Q3), and which
IN-Q4's successor guard replaces in the same commit as that copy. So acceptance is designed
below and **not built in this slice**. *(Built 2026-10-14 per IN-Q12/IN-Q13/IN-Q14, option A below; the guard now allows exactly the accept module to write `auth_member`: inbox IN-T12.)*

## 5. Acceptance: the honest version of "in the same transaction"

Not literally available: production runs `drizzle-orm/neon-http` (no interactive transactions),
the adapter runs with `transaction: false`, and Better Auth's verify does its own writes
(consume, then session). Three options:

- **A (recommended): sign in first, then accept in one statement, and retry wherever a session
  is resolved.** POST → Better Auth verify (consume + session + cookie) → one CTE:
  `auth_invitation` pending→accepted (address match, unexpired, `RETURNING`), `auth_member`
  insert from that row, history row, all one statement (the audited-write CTE pattern). The
  same idempotent `acceptPendingInvitation(userId, now)` also runs where `/kabinet` resolves a
  `no_role` user. `auth_member_user_id_unique` (23505) maps to `ADDRESS_HAS_A_ROLE`, reason
  `shelter_admin` (IN-T1, bound to this PR).
  *Partial failure:* the person is signed in with the invitation still pending. They land on
  `/kabinet`, whose next load retries. If it keeps failing, they see the `no_role` state with
  a "couldn't finish joining" line (new copy, no mock). No state is ever half-accepted: the CTE
  either did all three writes or none.
- **B: accept first, then sign in.** Needs the token's address before consuming it: a direct
  read of `auth_verification` by our own hash of the token (duplicating Better Auth's storage
  format) or its internal adapter (a server API beyond `getSession`). And a token that then
  fails to consume (a second tab, expiry in between) leaves a membership for someone who never
  signed in. Not recommended.
- **C: one statement doing consume + session + membership ourselves.** Reimplements Better
  Auth's verify and its signed cookie: the fork Oleksii said to stop on. Not recommended.

Better Auth's own `accept-invitation` (HS-Q7's original route) is not used for the automatic
step in A: on this adapter it marks the invitation accepted, then inserts the member, then on
failure *compensates* by writing `pending` back. A crash between leaves "accepted, no member",
which no retry can recover (it only accepts `pending`). That departure from HS-Q7 is D2.

## 6. Tests (this slice)

`apps/web/src/kabinet/confirm-route.test.ts`, real Better Auth, real Postgres:

1. GET leaves the token valid: GET the emailed URL (twice), then POST succeeds.
2. POST consumes it: 303 to `/kabinet`, session cookie set, `get-session` returns the user.
3. A second POST fails as already used: 400, no cookie.
4. Headers: the three, on the GET, the 303, the 400, the 403, the 404 and the 405.

`test/harness/kabinet-confirm.harness.ts` (added with IN-T8), real Chromium against the built
app: open the emailed link, reload it, press «Увійти»; the POST carries our real `Origin` and
a bare-origin Referer, answers 303 to `/kabinet`, sets the session cookie and `get-session`
returns the user; no request's Referer contains `token=` or the confirm path.
5. The emailed URL is the confirm page, on `BETTER_AUTH_URL`'s origin; Better Auth's verify URL
   appears nowhere in it.
6. `GET /api/auth/magic-link/verify?token=<valid>` is 404 and the token still works after it.
7. Cross-origin POST is 403 and doesn't consume; a malformed token renders no form; both
   methods 404 while unavailable.

`auth.test.ts`'s `signIn` helper follows the new link (GET then POST); the forwarded-paths test
lists three.

## 7. Forced choices

| # | Choice | Options | Taken / recommended |
|---|---|---|---|
| C1 | How the POST verifies | `auth.handler` with a built GET (no guard change) · `auth.api.magicLinkVerify` (guard allowlist change) · our own consume (fork-like) | **`auth.handler`**, default-taken (IN-T4) |
| C2 | Token in the query vs the fragment | query (works without JS; in platform request logs, as before) · `#token` (never reaches a server log; needs JS to fill the form) | **query**, default-taken (IN-T5); a fragment is a small follow-up if you want it |
| C3 | Page form | route handler, self-contained HTML (headers verified) · `page.tsx` in K1's card (headers asserted only; screens PR not on this branch) | **route handler**, default-taken (IN-T6); restyle once the screens PR lands |
| C4 | Login CSRF on the POST | require `Origin` = our origin · none | **require it**, default-taken (IN-T7); works in a browser only with §2's `strict-origin` (IN-T8) |
| D1 | Acceptance mechanism | §5 A · B · C | **A** - yours (Tier 1: membership writes; not built) |
| D2 | Departing from HS-Q7 for the automatic accept | our one-statement CTE · Better Auth's `accept-invitation` via `auth.handler` (non-atomic on neon-http, see §5) | **the CTE** - yours |
| D3 | A history entry for "joined" | new `admin_joined` kind in the domain union (Tier 1 domain change) · none | **add it** - yours |
| D4 | Copy | confirm page (button, intro, the shelter the invitation is for, invalid/used states), invite page now has no Send button (the copy sheet's L rows change), "couldn't finish joining" | keys as `[COPY PENDING]`, sheet rows in `docs/h2-invite-copy-sheet.md` - your Ukrainian |
