Addendum to the review of 72b8a3b3b3978cf4291b596275b4d460e1d5dc4c: auth answers unchanged. Verdict unchanged: PASS WITH NOTES

Oleksii's extra check, 2026-10-21. The question: does every `APIError` (and every kabinet refusal) without a raw database
error in its chain keep its exact status, body and headers? Is that shown by tests for a wrong password (401, generic), an
unusable link (410), a rate limit and an unknown session? And are the smoke's existing 401 and 410 steps unaffected?
**Yes, on all counts. No user-facing auth answer changed.** The tests ran in scratch worktrees (read-only review), and their
source is below for the builder to adopt.

## Where the rename can happen at all

`cleanedNameOf` (D9) runs only inside `cleanedQueryError`. That is reached from three places:
- `cleanedTransaction`: a callback's throw that holds a raw error or stops the walk, or anything the transaction itself raises;
- the session-method wrapper in `cleaning()`, for errors from Drizzle's `execute`/`all`/… (never an `APIError`);
- `principal.ts:90`, which passes any `APIError` through as itself: `isAPIError(error) ? error : cleanedQueryError(error)`.

No production code runs a transaction on the cleaned handle:
- the only `.transaction(` outside tests is `packages/db/src/demo-remove.ts`, a script on its own raw handle;
- Better Auth's adapter has `transaction: false`;
- neon-http never runs the callback.

## 1. Every answer, byte for byte, at three commits

The same probe (status, every header with `date` dropped and cookie values masked, and the whole body) ran at:
- `dfec9f2`, the default branch's head (before F8-F1);
- `73d03fa` (before D9);
- `72b8a3b`.

It ran twice at each commit. **All six result files are identical** (sha256 of the sorted lines: `7ca8dca3c580…` every
time), 13 answers each:

| Answer | Status | Body |
|---|---|---|
| 401 wrong password | 401 | `{"message":"Invalid email or password","code":"INVALID_EMAIL_OR_PASSWORD"}` |
| 401 unknown address | 401 | `{"message":"Invalid email or password","code":"INVALID_EMAIL_OR_PASSWORD"}` |
| 429 sign-in delay | 429 | `{"message":"Too many sign-in attempts","code":"SIGN_IN_DELAYED","retryAfterMinutes":1}` |
| 429 per-IP | 429 | `(empty)` |
| 429 forgot per address | 429 | `(empty)` |
| get-session unknown session | 200 | `null` |
| get-session no cookie | 200 | `null` |
| 401 change-password unknown session | 401 | `{"message":"Unauthorized","code":"UNAUTHORIZED"}` |
| sign-out unknown session | 200 | `{"success":true}` |
| 400 used sign-in link (confirm POST) | 400 | `(HTML «invalid» page)` |
| 410 invitation used link | 410 | `{"json":{"defined":true,"code":"INVITE_UNUSABLE","status":410,"message":"This invitation link no longer works."}}` |
| 410 invitation unknown link | 410 | `{"json":{"defined":true,"code":"INVITE_UNUSABLE","status":410,"message":"This invitation link no longer works."}}` |
| 429 invitation per IP | 429 | `{"json":{"defined":true,"code":"RATE_LIMITED","status":429,"message":"Too many requests."}}` |

Headers, the same at all three commits:
- the 401s and the 429s: `content-type: application/json`;
- the sign-in delay adds `retry-after: 60`;
- get-session: `cache-control: no-store` and `pragma: no-cache`;
- sign-out: three `Max-Age=0` cookies;
- the confirm page: `no-store`, `referrer-policy`, `x-robots-tag`.

Each probe also asserts its literal values:
- a wrong password and an unknown address give the same 401, `INVALID_EMAIL_OR_PASSWORD`, with no session cookie;
- the sign-in delay gives 429 with `retry-after: 60` and `retryAfterMinutes: 1`;
- a used and an unknown invitation link give the same 410, `INVITE_UNUSABLE`;
- the invitation limit gives 429, `RATE_LIMITED`;
- an unknown session gets get-session `null` and a change refused with 401 `UNAUTHORIZED`.

Two corrections to the question as asked:
- A used *sign-in* link answers the confirm page's "invalid" page with **400**, by design (`confirm-route.ts:211`), at all
  three commits. Every 410 is an **invitation** link answer (an oRPC `INVITE_UNUSABLE`, not a Better Auth `APIError`).
- "Rate limit" covers four distinct answers (the sign-in delay, the per-IP limiter, «Забули пароль?» per address, and the
  invitation's per-IP limit). All four are above.

## 2. The probes go red when an answer changes (scratch mutations, each restored)

- `auth-route.ts`: a 401 rewritten to 500 → red, 2 tests: "wrong password and an unknown address: the same generic 401"
  and "an unknown session: … the change refused 401": `expected 500 to be 401`.
- `invitation-router.ts`: `unusable` throws a plain `Error` → red: `expected 500 to be 410`.
- `onAPIError`: every non-500 `APIError` turned into a plain `Error` (D9 applied to every refusal) → red, 3 tests (the
  three 429s). The 401s don't pass through `onAPIError` (Better Auth answers them from the endpoint), which is why the
  401 mutation above was made at the route.

## 3. D9 cannot reach these answers

`mustBeCleaned` was forced to return `true` for every throw, so every transaction-callback throw is cleaned and renamed:
- the full `password-flows`, `invite-password-flows`, `auth`, `sign-in-race`, `principal` and kabinet `handlers` suites:
  **221 passed**;
- the smoke's local run (`neon-auth-smoke.test.ts`): **2 passed**.

No auth or kabinet flow sends an answer through that path.

Unit, through a real postgres-js transaction on the cleaned handle. The code's own refusals each come out as **the same
object**:
- the wrong password's 401;
- the unknown session's 401;
- the sign-in delay (body plus the `Retry-After` header);
- the limiter's bare 429;
- sign-up closed (403);
- the oRPC `INVITE_UNUSABLE` 410 and `RATE_LIMITED` 429.

better-call's `toResponse` answers the same status, headers and body for each as for the original. With the walk forced to
clean everything, this test goes red: `expected [ '401 wrong password', false ] to deeply equal [ '401 wrong password', true ]`.

## 4. The smoke's 401 and 410 steps

Across the whole PR, `apps/web/scripts/neon-auth-smoke.ts` gains 36 lines (step 20) and changes none.

`runAuthSmoke` was run locally (postgres-js) at `dfec9f2` and at `72b8a3b`. **Steps 1–19 match exactly in name, result
and printed detail.** Step 20 is new and passes. The steps that check a 401 or a 410, as printed at `72b8a3b`:
- 9: "old password 401";
- 14 and 15: "status 401, a wrong password's answer true, cookies set 0, …";
- 17: "second POST 410";
- 18: "POST 410/410/410";
- 19: "forced POST 500; … same link 410".

Step 19's 500 comes from a forced plain `Error` on an uncleaned stepped handle, the same at `dfec9f2`.

Not run: real Neon. The local run proves the script and the answers. Oleksii's
`pnpm --filter @opika/web kabinet:neon-auth-smoke --expect <child>` is still the gate, expected **20 passed, 0 failed**.

## The probe tests (scratch; for the builder to adopt)

Appended to `password-flows.test.ts` and `invite-password-flows.test.ts` (shared snapshot helpers):

```ts

// ---- REVIEWER PROBE (auth answers unchanged) ----
type AnswerSnapshot = { status: number; headers: string[]; body: string };
async function reviewerSnapshot(response: Response): Promise<AnswerSnapshot> {
  const headers: string[] = [];
  response.headers.forEach((value, key) => {
    if (key === "date" || key === "set-cookie") return;
    headers.push(`${key}: ${value}`);
  });
  for (const cookie of response.headers.getSetCookie()) {
    headers.push(`set-cookie: ${cookie.replace(/^([^=]+)=[^;]*/, "$1=<value>")}`);
  }
  return { status: response.status, headers: headers.sort(), body: await response.clone().text() };
}
async function reviewerRecord(label: string, snapshot: AnswerSnapshot) {
  const { appendFileSync } = await import("node:fs");
  const out = process.env.REVIEWER_PROBE_OUT;
  if (out !== undefined) appendFileSync(out, `${JSON.stringify({ label, ...snapshot })}\n`);
  return snapshot;
}


describe("REVIEWER PROBE: auth answers without a raw error keep status, body and headers", () => {
  const record = async (label: string, response: Response) =>
    reviewerRecord(label, await reviewerSnapshot(response));

  it("wrong password and an unknown address: the same generic 401", async () => {
    await adminWithPassword();
    const wrong = await record("401 wrong password", (await signInWithPassword(ADMIN, "не-той-пароль-зовсім")).response);
    const unknown = await record("401 unknown address", (await signInWithPassword("nobody@example.org", GOOD)).response);
    expect(wrong.status).toBe(401);
    expect(JSON.parse(wrong.body)).toEqual({ message: "Invalid email or password", code: "INVALID_EMAIL_OR_PASSWORD" });
    expect([unknown.status, unknown.body, unknown.headers]).toEqual([wrong.status, wrong.body, wrong.headers]);
    expect(wrong.headers.some((h) => h.startsWith("set-cookie: kabinet.session_token="))).toBe(false);
  });

  it("the sign-in delay: 429 with Retry-After and retryAfterMinutes", async () => {
    await adminWithPassword();
    for (let i = 0; i < 5; i++) await signInWithPassword(ADMIN, "не-той-пароль-зовсім");
    const waiting = await record("429 sign-in delay", (await signInWithPassword(ADMIN, "не-той-пароль-зовсім")).response);
    expect(waiting.status).toBe(429);
    expect(waiting.headers).toContain("retry-after: 60");
    expect(JSON.parse(waiting.body)).toMatchObject({ retryAfterMinutes: 1 });
  });

  it("the per-IP limiter: 429", async () => {
    build({ kabinet: { perUser: generous(), perIp: inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 1 }) } });
    await signInWithPassword("nobody@example.org", GOOD);
    const refused = await record("429 per-IP", (await signInWithPassword("nobody@example.org", GOOD)).response);
    expect(refused.status).toBe(429);
  });

  it("«Забули пароль?» per address: 429", async () => {
    build({ password: { forgotPerAddress: inMemoryRateLimiter({ windowMs: 3_600_000, maxRequests: 1 }) } });
    await shelterAdmin(ADMIN);
    await forgot(ADMIN);
    const refused = await record("429 forgot per address", (await forgot(ADMIN)).answer.response);
    expect(refused.status).toBe(429);
  });

  it("an unknown session: get-session null, the change refused 401, sign-out", async () => {
    const cookie = "kabinet.session_token=unknown-session-token.c2lnbmF0dXJl";
    const got = await record("get-session unknown session", (await route(new Request(`${BASE}/api/auth/get-session`, { headers: { cookie, origin: BASE } }))).response);
    expect([got.status, got.body]).toEqual([200, "null"]);
    const none = await record("get-session no cookie", (await route(new Request(`${BASE}/api/auth/get-session`, { headers: { origin: BASE } }))).response);
    expect([none.status, none.body]).toEqual([200, "null"]);
    const change = await record("401 change-password unknown session", (await route(post("/api/auth/change-password", { currentPassword: GOOD, newPassword: NEWER }, { cookie }))).response);
    expect(change.status).toBe(401);
    const out = await record("sign-out unknown session", (await route(post("/api/auth/sign-out", {}, { cookie }))).response);
    expect(out.status).toBeGreaterThanOrEqual(200);
  });

  it("a used sign-in link: the confirm page's POST answers 410", async () => {
    await shelterAdmin(ADMIN);
    const link = await requestLink(ADMIN);
    await confirmLink(link);
    const token = new URL(link).searchParams.get("token") ?? "";
    const again = await handleKabinetConfirm(
      new Request(link, { method: "POST", headers: { origin: BASE }, body: new URLSearchParams({ token }) }),
      { availability: available(), auth: () => auth, acceptInvitation: invitationAccepter(db, () => new Date()) },
    );
    const snap = await record("410 used sign-in link (confirm POST)", again);
    expect(snap.status).toBe(410);
  });
});


describe("REVIEWER PROBE: the invitation's refusals keep status, body and headers", () => {
  async function acceptRaw(token: string, password: string) {
    const ip = "198.51.100.7";
    const request = new Request(`${BASE}/api/kabinet/invitation/acceptWithPassword`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE, "x-vercel-forwarded-for": ip },
      body: JSON.stringify(toRpcBody({ token, password })),
    });
    const response = await handleKabinetRpc(request, {
      availability: available(),
      resolve: async () => ({
        ...(await kabinetIdentityOf(auth, db, request.headers, clock, false)),
        db,
        cursorSecret: "test-cursor-secret",
      }),
      limiters: { perUser: generous(), perIp: generous() },
      ip,
      now: clock,
      newId: () => crypto.randomUUID(),
      operatorDisplayName: "Олексій",
      locationPolicy: null,
      production: false,
      shelterWrites: SHELTER_WRITE_POLICY,
      invitePasswords: () => ({ kind: "on", perIp: invitePerIp, ip, credentials: inviteCredentialsOf(auth, BASE, request.headers) }),
    });
    await Promise.all(pending);
    return reviewerSnapshot(response);
  }

  it("a used link and an unknown link: the same 410 INVITE_UNUSABLE; the per-IP limit: 429 RATE_LIMITED", async () => {
    const { token } = await invited();
    expect((await accept(token, GOOD)).status).toBe(200);
    const used = await reviewerRecord("410 invitation used link", await acceptRaw(token, "інший-довгий-пароль-для-другого-разу"));
    const unknown = await reviewerRecord("410 invitation unknown link", await acceptRaw(newInviteToken(), GOOD));
    expect(used.status).toBe(410);
    expect(errorCode(fromRpcBody(JSON.parse(used.body)))).toBe("INVITE_UNUSABLE");
    expect([unknown.status, unknown.body, unknown.headers]).toEqual([used.status, used.body, used.headers]);
    invitePerIp = inMemoryRateLimiter({ windowMs: 3_600_000, maxRequests: 1 });
    await acceptRaw(newInviteToken(), GOOD);
    const limited = await reviewerRecord("429 invitation per IP", await acceptRaw(newInviteToken(), GOOD));
    expect(limited.status).toBe(429);
    expect(errorCode(fromRpcBody(JSON.parse(limited.body)))).toBe("RATE_LIMITED");
  });
});

```

Inside the transaction `describe` of `clean-query-errors.test.ts`:

```ts
  describe("REVIEWER PROBE: the code's own refusals through a cleaned transaction", () => {
    const passThrough = (thrown: unknown) =>
      failureOf(withQueryErrorsCleaned(db).transaction(async () => { throw thrown; }));
    const answerOf = async (response: Response) => ({
      status: response.status,
      headers: [...response.headers].sort(),
      body: await response.text(),
    });
    it("each passes as the same object, and answers byte for byte as itself", async () => {
      const { toResponse } = await betterCall();
      const { ORPCError } = await import("@orpc/server");
      const refusals: Array<readonly [string, unknown]> = [
        ["401 wrong password", new APIError("UNAUTHORIZED", { message: "Invalid email or password", code: "INVALID_EMAIL_OR_PASSWORD" })],
        ["401 unknown session", new APIError("UNAUTHORIZED")],
        ["429 sign-in delay", new APIError("TOO_MANY_REQUESTS", { message: "Too many sign-in attempts", code: "SIGN_IN_DELAYED", retryAfterMinutes: 1 }, { "Retry-After": "60" })],
        ["429 limiter", new APIError("TOO_MANY_REQUESTS")],
        ["403 sign-up closed", new APIError("FORBIDDEN", { message: "Sign-up is closed", code: "SIGN_UP_CLOSED" })],
        ["410 invitation unusable (oRPC)", new ORPCError("INVITE_UNUSABLE", { status: 410, message: "This invitation link no longer works." })],
        ["429 invitation limit (oRPC)", new ORPCError("RATE_LIMITED", { status: 429, message: "Too many requests." })],
      ];
      for (const [label, refusal] of refusals) {
        const escaped = await passThrough(refusal);
        expect([label, escaped === refusal]).toEqual([label, true]);
        if (isAPIError(refusal)) {
          expect([label, await answerOf(toResponse(escaped))]).toEqual([label, await answerOf(toResponse(refusal))]);
        } else {
          const { status, code, message } = escaped as InstanceType<typeof ORPCError>;
          expect([label, status, code, message]).toEqual([label, (refusal as InstanceType<typeof ORPCError>).status, (refusal as InstanceType<typeof ORPCError>).code, (refusal as InstanceType<typeof ORPCError>).message]);
        }
      }
    });
  });


```

The smoke comparison (`src/kabinet/zz-reviewer-smoke.test.ts`, with `REVIEWER_PROBE_OUT` set):

```ts
import { appendFileSync } from "node:fs";
import { setupTestDatabase } from "@opika/db/test";
import { afterAll, beforeAll, expect, it } from "vitest";
import { runAuthSmoke } from "../../scripts/neon-auth-smoke";

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;
beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());

it("REVIEWER PROBE: the smoke's steps, as reported", async () => {
  const outcomes = await runAuthSmoke(db);
  for (const o of outcomes) {
    appendFileSync(process.env.REVIEWER_PROBE_OUT ?? "/dev/null", `${JSON.stringify({ name: o.name, ok: o.ok, detail: o.detail })}\n`);
  }
  expect(outcomes.filter((o) => !o.ok)).toEqual([]);
});

```
