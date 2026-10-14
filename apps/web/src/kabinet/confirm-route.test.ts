import { authSession, authVerification } from "@opika/db/schema";
import { setupTestDatabase, truncateAll } from "@opika/db/test";
import { uk } from "@opika/i18n";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { inMemoryRateLimiter } from "../api/rate-limit";
import { createKabinetAuth, type KabinetAuth } from "./auth";
import { handleKabinetAuth, type KabinetAuthAvailability } from "./auth-route";
import { handleKabinetConfirm } from "./confirm-route";
import { capturingInvitationSender } from "./email-senders";
import { type AcceptInvitation, invitationAccepter } from "./invitation-accept";
import { capturingSender } from "./magic-link-sender";

/**
 * IN-Q11: a GET never consumes anything. Real Better Auth, real Postgres,
 * real `Request`s, as in `auth.test.ts`; the scanner is just a GET.
 */

const BASE = "http://localhost:3000";
const CONFIRM = `${BASE}/kabinet/vkhid/pidtverdzhennia`;

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;
let sender: ReturnType<typeof capturingSender>;
let pending: Promise<void>[];
let auth: KabinetAuth;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());

beforeEach(async () => {
  await truncateAll(db);
  sender = capturingSender();
  pending = [];
  auth = createKabinetAuth({
    db,
    sender,
    schedule: (work) => {
      pending.push(work());
    },
    baseURL: BASE,
    secret: "test-only-secret-that-is-long-enough-0123456789",
    secureCookies: false,
  });
});

const available: KabinetAuthAvailability = {
  kind: "available",
  sender: capturingSender(),
  invites: capturingInvitationSender(),
  secret: "unused-here",
  baseURL: BASE,
};
const realAccept = (): AcceptInvitation => invitationAccepter(db, () => new Date());
const deps = (acceptInvitation: AcceptInvitation = realAccept()) => ({
  availability: available,
  auth: () => auth,
  acceptInvitation,
});

/** A known user asks to sign in; returns the emailed link. */
async function emailedLink(): Promise<string> {
  const ctx = await auth.$context;
  await ctx.internalAdapter.createUser({
    email: "olena@example.org",
    name: "Олена",
    emailVerified: true,
  });
  await handleKabinetAuth(
    new Request(`${BASE}/api/auth/sign-in/magic-link`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE },
      body: JSON.stringify({ email: "olena@example.org" }),
    }),
    {
      availability: available,
      auth: () => auth,
      limiters: {
        perAddress: inMemoryRateLimiter({ windowMs: 3_600_000, maxRequests: 1000 }),
        perIp: inMemoryRateLimiter({ windowMs: 3_600_000, maxRequests: 1000 }),
      },
      now: new Date(),
    },
  );
  await Promise.all(pending);
  const link = sender.sent[0]?.url;
  if (link === undefined) throw new Error("no link sent");
  return link;
}

const tokenOf = (link: string) => new URL(link).searchParams.get("token") ?? "";

const confirmPost = (
  token: string,
  origin: string | null = BASE,
  acceptInvitation: AcceptInvitation = realAccept(),
) =>
  handleKabinetConfirm(
    new Request(CONFIRM, {
      method: "POST",
      headers: origin === null ? {} : { origin },
      body: new URLSearchParams({ token }),
    }),
    deps(acceptInvitation),
  );

const sessionCookieOf = (response: Response) =>
  response.headers.getSetCookie().find((c) => c.startsWith("kabinet.session_token="));

async function sessionCount() {
  return (await db.select().from(authSession)).length;
}

function expectConfirmHeaders(response: Response) {
  expect({
    cacheControl: response.headers.get("cache-control"),
    robots: response.headers.get("x-robots-tag"),
    referrer: response.headers.get("referrer-policy"),
  }).toEqual({
    cacheControl: "no-store",
    robots: "noindex, nofollow",
    referrer: "strict-origin",
  });
}

describe("the emailed link", () => {
  it("is the confirm page on BETTER_AUTH_URL's origin, never Better Auth's verify", async () => {
    const link = await emailedLink();
    expect(link.startsWith(`${CONFIRM}?token=`)).toBe(true);
    expect(link).not.toContain("magic-link/verify");
    expect(tokenOf(link)).toMatch(/^[A-Za-z]{32}$/);
  });
});

describe("GET leaves the token valid", () => {
  it("shows one button carrying the token, writes nothing, and the POST after it still signs in", async () => {
    const link = await emailedLink();
    const before = await db.select().from(authVerification);

    for (let i = 0; i < 2; i++) {
      const shown = await handleKabinetConfirm(new Request(link), deps());
      expect(shown.status).toBe(200);
      const html = await shown.text();
      expect(html.match(/<button/g)).toHaveLength(1);
      expect(html).toContain(`name="token" value="${tokenOf(link)}"`);
      expect(html).toContain('method="post"');
    }
    expect(await db.select().from(authVerification)).toEqual(before);
    expect(await sessionCount()).toBe(0);

    const confirmed = await confirmPost(tokenOf(link));
    expect(confirmed.status).toBe(303);
    expect(sessionCookieOf(confirmed)).toBeDefined();
  });

  it("Better Auth's own verify URL is 404 through the auth route, and consumes nothing", async () => {
    const link = await emailedLink();
    const scanned = await handleKabinetAuth(
      new Request(`${BASE}/api/auth/magic-link/verify?token=${tokenOf(link)}`),
      {
        availability: available,
        auth: () => auth,
        limiters: {
          perAddress: inMemoryRateLimiter({ windowMs: 1, maxRequests: 1 }),
          perIp: inMemoryRateLimiter({ windowMs: 1, maxRequests: 1 }),
        },
        now: new Date(),
      },
    );
    expect(scanned.status).toBe(404);
    expect((await confirmPost(tokenOf(link))).status).toBe(303);
  });
});

describe("POST consumes it, once", () => {
  it("signs in: 303 to /kabinet with the session cookie, and get-session knows the user", async () => {
    const link = await emailedLink();
    const confirmed = await confirmPost(tokenOf(link));
    expect(confirmed.status).toBe(303);
    expect(confirmed.headers.get("location")).toBe("/kabinet");
    const cookie = sessionCookieOf(confirmed);
    expect(cookie).toMatch(/HttpOnly/);
    expect(await confirmed.text()).toBe("");

    const session = await auth.handler(
      new Request(`${BASE}/api/auth/get-session`, {
        headers: { cookie: cookie?.split(";")[0] ?? "", origin: BASE },
      }),
    );
    expect(((await session.json()) as { user: { email: string } }).user.email).toBe(
      "olena@example.org",
    );
    expect(await db.select().from(authVerification)).toEqual([]);
  });

  it("a second POST fails as already used: 400, no cookie, no second session", async () => {
    const link = await emailedLink();
    expect((await confirmPost(tokenOf(link))).status).toBe(303);
    const again = await confirmPost(tokenOf(link));
    expect(again.status).toBe(400);
    expect(sessionCookieOf(again)).toBeUndefined();
    expect(await again.text()).toContain(`<p role="alert">`);
    expect(await sessionCount()).toBe(1);
  });

  it("refuses a token it never issued", async () => {
    await emailedLink();
    const forged = await confirmPost("A".repeat(32));
    expect(forged.status).toBe(400);
    expect(sessionCookieOf(forged)).toBeUndefined();
  });
});

describe("login CSRF (IN-T7)", () => {
  it.each([
    ["another origin", "https://evil.example"],
    ["no Origin", null],
    // What a browser sends under `Referrer-Policy: no-referrer` (IN-T8).
    ["Origin: null", "null"],
  ])("refuses a POST from %s with 403, and the token still works", async (_, origin) => {
    const link = await emailedLink();
    const refused = await confirmPost(tokenOf(link), origin);
    expect(refused.status).toBe(403);
    expect(sessionCookieOf(refused)).toBeUndefined();
    expect((await confirmPost(tokenOf(link))).status).toBe(303);
  });
});

describe("headers on every response", () => {
  it("no-store, noindex and strict-origin on the GET, the 303, the 400, the 403, the 404 and the 405", async () => {
    const link = await emailedLink();
    const responses = [
      await handleKabinetConfirm(new Request(link), deps()),
      await handleKabinetConfirm(new Request(`${CONFIRM}?token=<script>`), deps()),
      await confirmPost(tokenOf(link), "https://evil.example"),
      await confirmPost(tokenOf(link)),
      await confirmPost(tokenOf(link)),
      await handleKabinetConfirm(new Request(link, { method: "PUT" }), deps()),
      await handleKabinetConfirm(new Request(link), {
        availability: { kind: "unavailable", reason: "no_sender_in_production" },
        auth: () => auth,
        acceptInvitation: realAccept(),
      }),
    ];
    expect(responses.map((r) => r.status)).toEqual([200, 400, 403, 303, 400, 405, 404]);
    for (const response of responses) expectConfirmHeaders(response);
  });
});

describe("the page itself", () => {
  it("renders no form for a malformed token, and never echoes it", async () => {
    const shown = await handleKabinetConfirm(
      new Request(`${CONFIRM}?token=${encodeURIComponent('"><script>x</script>')}`),
      deps(),
    );
    const html = await shown.text();
    expect(shown.status).toBe(400);
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<script>");
  });

  it("answers 404 to both methods while kabinet sign-in is unavailable, consuming nothing", async () => {
    const link = await emailedLink();
    const off = {
      availability: { kind: "unavailable", reason: "no_sender_in_production" } as const,
      auth: () => auth,
      acceptInvitation: realAccept(),
    };
    expect((await handleKabinetConfirm(new Request(link), off)).status).toBe(404);
    const posted = await handleKabinetConfirm(
      new Request(CONFIRM, {
        method: "POST",
        headers: { origin: BASE },
        body: new URLSearchParams({ token: tokenOf(link) }),
      }),
      off,
    );
    expect(posted.status).toBe(404);
    expect((await confirmPost(tokenOf(link))).status).toBe(303);
  });
});

/**
 * IN-Q12: the accept runs after Better Auth's sign-in, as its own step. What
 * it answers decides the page, never whether the person is signed in. The
 * accept itself is driven against real rows in `invitation-accept.test.ts`;
 * here its outcome is fixed, to pin what the route does with each.
 */
/** Copy as it appears in the page's HTML (the five characters it escapes). */
const html_ = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

describe("after sign-in, the invitation accept (IN-Q12)", () => {
  it("is given Better Auth's own user for the consumed token", async () => {
    const link = await emailedLink();
    const seen: string[] = [];
    const response = await confirmPost(tokenOf(link), BASE, async (userId) => {
      seen.push(userId);
      return { kind: "nothing_to_accept" };
    });
    expect(response.status).toBe(303);
    const ctx = await auth.$context;
    const user = await ctx.internalAdapter.findUserByEmail("olena@example.org");
    expect(user).not.toBeNull();
    expect(seen).toEqual([user?.user.id]);
  });

  it("a failed accept: still signed in, told so with a retry to /kabinet, never a 500", async () => {
    const link = await emailedLink();
    const response = await confirmPost(tokenOf(link), BASE, async () => ({ kind: "failed" }));
    expect(response.status).toBe(200);
    expectConfirmHeaders(response);
    const cookie = sessionCookieOf(response);
    expect(cookie).toBeDefined();
    const html = await response.text();
    expect(html).toContain(`<p role="alert">${html_(uk.kabinet.confirm.joinFailed)}</p>`);
    expect(html).toContain(`<a href="/kabinet">${html_(uk.kabinet.confirm.joinRetry)}</a>`);
    expect(html).not.toContain("<form");
    const session = await handleKabinetAuth(
      new Request(`${BASE}/api/auth/get-session`, {
        headers: { cookie: cookie?.split(";")[0] ?? "", origin: BASE },
      }),
      {
        availability: available,
        auth: () => auth,
        limiters: {
          perAddress: inMemoryRateLimiter({ windowMs: 3_600_000, maxRequests: 1000 }),
          perIp: inMemoryRateLimiter({ windowMs: 3_600_000, maxRequests: 1000 }),
        },
        now: new Date(),
      },
    );
    expect(((await session.json()) as { user: { email: string } }).user.email).toBe(
      "olena@example.org",
    );
  });

  it("an accept that throws is a failed accept, not a 500", async () => {
    const link = await emailedLink();
    const response = await confirmPost(tokenOf(link), BASE, async () => {
      throw new Error("connection reset");
    });
    expect(response.status).toBe(200);
    expect(sessionCookieOf(response)).toBeDefined();
    expect(await response.text()).toContain(html_(uk.kabinet.confirm.joinFailed));
  });

  it("a conflict (the address holds a role) doesn't block sign-in: 303 to /kabinet with the cookie", async () => {
    const link = await emailedLink();
    const response = await confirmPost(tokenOf(link), BASE, async () => ({
      kind: "address_has_a_role",
      reason: "shelter_admin",
    }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/kabinet");
    expect(sessionCookieOf(response)).toBeDefined();
  });

  it("a refused sign-in never reaches the accept", async () => {
    const link = await emailedLink();
    await confirmPost(tokenOf(link));
    let called = false;
    const again = await confirmPost(tokenOf(link), BASE, async () => {
      called = true;
      return { kind: "nothing_to_accept" };
    });
    expect([again.status, called]).toEqual([400, false]);
  });
});
