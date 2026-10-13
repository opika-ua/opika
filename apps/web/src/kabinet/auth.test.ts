import { cityRepo, kabinetActorRepo, kabinetInvitationRepo, shelterRepo } from "@opika/db/repos";
import { superAdmins } from "@opika/db/schema";
import { makeCity, makeShelter, setupTestDatabase, truncateAll } from "@opika/db/test";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { inMemoryRateLimiter } from "../api/rate-limit";
import { createKabinetAuth, FORWARDED_AUTH_PATHS, type KabinetAuth } from "./auth";
import {
  handleKabinetAuth,
  type KabinetAuthAvailability,
  kabinetAuthAvailability,
} from "./auth-route";
import { capturingSender } from "./magic-link-sender";
import { principalOf } from "./principal";
import { SIGN_IN_LIMITS } from "./sign-in-limit";

/**
 * Better Auth for real: a real instance, its real Drizzle adapter, real
 * Postgres, real `Request`s through the route function. Nothing mocked but
 * the email provider (which doesn't exist yet, HS-Q2) and the clock-free
 * `after()` (run immediately and awaited).
 *
 * HS-Q7 (Oleksii): the invitation test below is the one a better-auth upgrade
 * must pass (see the catalog pin in pnpm-workspace.yaml).
 */

const BASE = "http://localhost:3000";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

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
  secret: "unused-here",
  baseURL: BASE,
};

function limiters(perAddress = 1000, perIp = 1000) {
  return {
    perAddress: inMemoryRateLimiter({ windowMs: 3_600_000, maxRequests: perAddress }),
    perIp: inMemoryRateLimiter({ windowMs: 3_600_000, maxRequests: perIp }),
  };
}

async function route(request: Request, lims = limiters()): Promise<Response> {
  const response = await handleKabinetAuth(request, {
    availability: available,
    auth: () => auth,
    limiters: lims,
    now: new Date(),
  });
  await Promise.all(pending);
  return response;
}

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE, ...headers },
    body: JSON.stringify(body),
  });

/** Through Better Auth's real adapter: this is the insert the review found broken. */
async function createUser(email: string) {
  const ctx = await auth.$context;
  const user = await ctx.internalAdapter.createUser({ email, name: "Олена", emailVerified: true });
  if (!user) throw new Error("createUser returned nothing");
  return user;
}

/** Ask for a link, follow it, return the session cookie. */
async function signIn(email: string): Promise<string> {
  const before = sender.sent.length;
  await route(post("/api/auth/sign-in/magic-link", { email }));
  const link = sender.sent[before]?.url;
  if (link === undefined) throw new Error(`no link sent to ${email}`);
  const verified = await route(new Request(link));
  const cookie = verified.headers
    .getSetCookie()
    .find((c) => c.startsWith("kabinet.session_token="));
  if (cookie === undefined) throw new Error(`verify set no session cookie (${verified.status})`);
  return cookie.split(";")[0] ?? "";
}

describe("ids (review of rows 1–2, finding 1)", () => {
  it("a user created through Better Auth's adapter gets an app-generated UUID", async () => {
    const user = await createUser("olena@example.org");
    expect(user.id).toMatch(UUID);
  });
});

describe("magic-link sign-in", () => {
  it("sends a link to a known address, and the link signs them in", async () => {
    const user = await createUser("olena@example.org");
    const cookie = await signIn("olena@example.org");
    const session = await route(
      new Request(`${BASE}/api/auth/get-session`, { headers: { cookie, origin: BASE } }),
    );
    expect(((await session.json()) as { user: { id: string } }).user.id).toBe(user.id);
  });

  /** N1: identical response for any address; and an unknown one is sent nothing (no sign-up). */
  it("answers an unknown address exactly as a known one, and sends it nothing", async () => {
    await createUser("known@example.org");
    const known = await route(post("/api/auth/sign-in/magic-link", { email: "known@example.org" }));
    const unknown = await route(
      post("/api/auth/sign-in/magic-link", { email: "nobody@example.org" }),
    );
    expect([unknown.status, await unknown.text()]).toEqual([known.status, await known.text()]);
    expect(sender.sent.map((m) => m.email)).toEqual(["known@example.org"]);
  });

  /**
   * `disableSignUp` is read only inside verify, so this follows a real link:
   * one issued while the address had a user, verified after it no longer
   * does. Verify must refuse rather than create a user (reviewer, row 3,
   * finding 4).
   */
  it("verify refuses a link whose address has no user, and creates none", async () => {
    const user = await createUser("olena@example.org");
    await route(post("/api/auth/sign-in/magic-link", { email: "olena@example.org" }));
    const link = sender.sent[0]?.url;
    if (link === undefined) throw new Error("no link sent");
    const ctx = await auth.$context;
    await ctx.internalAdapter.updateUser(user.id, { email: "renamed@example.org" });

    const verified = await route(new Request(link));
    expect(verified.headers.getSetCookie().some((c) => c.includes("session_token"))).toBe(false);
    expect(verified.headers.get("location")).toContain("new_user_signup_disabled");
    expect(await ctx.internalAdapter.findUserByEmail("olena@example.org")).toBeNull();
  });
});

describe("origin and callback checks (on in tests too)", () => {
  it("refuses a cross-origin POST that carries a session cookie", async () => {
    await createUser("olena@example.org");
    const cookie = await signIn("olena@example.org");
    const response = await route(
      post("/api/auth/sign-out", {}, { cookie, origin: "https://evil.example" }),
    );
    expect(response.status).toBe(403);
  });

  it("refuses a magic link asking to redirect to another origin", async () => {
    await createUser("olena@example.org");
    const response = await route(
      post("/api/auth/sign-in/magic-link", {
        email: "olena@example.org",
        callbackURL: "https://evil.example/steal",
      }),
    );
    expect(response.status).toBe(403);
    expect(sender.sent).toEqual([]);
  });
});

describe("principalOf", () => {
  it("is anonymous without a kabinet session, even with an adopter's cookie", async () => {
    const headers = new Headers({ cookie: "session=adopter-token" });
    expect(await principalOf(auth, db, headers)).toEqual({ kind: "anonymous" });
  });

  it("is no_role for a signed-in user who is neither super_admin nor member", async () => {
    await createUser("olena@example.org");
    const cookie = await signIn("olena@example.org");
    expect(await principalOf(auth, db, new Headers({ cookie }))).toEqual({ kind: "no_role" });
  });

  it("is a super_admin only through an active super_admins grant", async () => {
    const user = await createUser("operator@example.org");
    const cookie = await signIn("operator@example.org");
    await db
      .insert(superAdmins)
      .values({ id: crypto.randomUUID(), userId: user.id, grantedAt: new Date() });
    expect(await principalOf(auth, db, new Headers({ cookie }))).toEqual({
      kind: "super_admin",
      moderatorId: user.id,
    });
  });
});

describe("the sign-in limits (HS-Q5)", () => {
  it("pins the numbers Oleksii set", () => {
    expect(SIGN_IN_LIMITS).toEqual({
      perAddress: { windowMs: 3_600_000, maxRequests: 5 },
      perIp: { windowMs: 3_600_000, maxRequests: 20 },
    });
  });

  it("keys the address after trimming and lowercasing, and answers the same when over", async () => {
    await createUser("olena@example.org");
    const lims = limiters(5, 1000);
    const spellings = [
      "olena@example.org",
      " Olena@example.org",
      "OLENA@EXAMPLE.ORG ",
      "olena@Example.org",
      "  olena@example.org",
      "Olena@Example.Org",
    ];
    const answers: string[] = [];
    for (const email of spellings) {
      const response = await route(post("/api/auth/sign-in/magic-link", { email }), lims);
      answers.push(`${response.status} ${await response.text()}`);
    }
    // One budget across all six spellings: five links, the sixth not sent…
    expect(sender.sent).toHaveLength(5);
    // …and the sixth caller can't tell.
    expect(new Set(answers).size).toBe(1);
  });

  it("charges the IP budget across different addresses", async () => {
    await createUser("a@example.org");
    const lims = limiters(1000, 2);
    for (const email of ["a@example.org", "a@example.org", "a@example.org"]) {
      await route(post("/api/auth/sign-in/magic-link", { email }), lims);
    }
    expect(sender.sent).toHaveLength(2);
  });
});

describe("what the route lets through", () => {
  it("forwards exactly four Better Auth paths", () => {
    expect([...FORWARDED_AUTH_PATHS].sort()).toEqual([
      "/api/auth/get-session",
      "/api/auth/magic-link/verify",
      "/api/auth/sign-in/magic-link",
      "/api/auth/sign-out",
    ]);
  });

  it.each([
    "/api/auth/organization/create",
    "/api/auth/organization/invite-member",
    "/api/auth/organization/accept-invitation",
    "/api/auth/update-user",
    "/api/auth/sign-up/email",
  ])("answers 404 for %s, before Better Auth sees it", async (path) => {
    expect((await route(post(path, {}))).status).toBe(404);
  });

  /** HS-Q2: production has no sender in this slice, so sign-in says so rather than pretending. */
  it("answers 503 in production, whatever else is configured", async () => {
    const availability = kabinetAuthAvailability({
      NODE_ENV: "production",
      BETTER_AUTH_SECRET: "x".repeat(40),
      BETTER_AUTH_URL: "https://example.org",
    });
    expect(availability).toEqual({ kind: "unavailable", reason: "no_sender_in_production" });
    const response = await handleKabinetAuth(
      post("/api/auth/sign-in/magic-link", { email: "a@b.c" }),
      {
        availability,
        auth: () => {
          throw new Error("must not build auth when unavailable");
        },
        limiters: limiters(),
        now: new Date(),
      },
    );
    expect(response.status).toBe(503);
  });

  it("is unavailable in development without a secret and a URL, never a default secret", () => {
    expect(kabinetAuthAvailability({ NODE_ENV: "development" })).toEqual({
      kind: "unavailable",
      reason: "missing_config",
    });
  });
});

describe("plugins (HS-T2, HS-Q7)", () => {
  /**
   * HS-T2 (Oleksii): Better Auth's `admin` plugin keeps a `role` on the user;
   * the super_admin role lives in `super_admins` only. This fails if any
   * plugin beyond these two is added, the admin plugin included.
   */
  it("runs magic-link and organization only — never the admin plugin", () => {
    const ids = (auth.options.plugins ?? []).map((plugin) => plugin.id);
    expect(ids).not.toContain("admin");
    expect([...ids].sort()).toEqual(["magic-link", "organization"]);
  });

  it("lets no user create an organization", () => {
    const org = (auth.options.plugins ?? []).find((plugin) => plugin.id === "organization") as
      | { options?: { allowUserToCreateOrganization?: unknown } }
      | undefined;
    expect(org?.options?.allowUserToCreateOrganization).toBe(false);
  });
});

describe("an invitation, written server-side and accepted through Better Auth (HS-Q7)", () => {
  /**
   * End to end on the real adapter: the operator's user (a user, not a
   * member) invites; the invitee signs in by magic link; Better Auth's own
   * accept-invitation endpoint makes them a member; the actor resolver then
   * sees a shelter admin of exactly that shelter. Called on `auth.handler`
   * directly because the route doesn't forward the plugin's paths until the
   * registry PR.
   */
  it("makes the invitee a shelter admin of that shelter", async () => {
    const city = makeCity();
    await cityRepo(db).insert(city);
    const shelter = makeShelter({
      publicLocation: { ...makeShelter().publicLocation, cityId: city.id },
    });
    await shelterRepo(db).insert(shelter);
    const operator = await createUser("operator@example.org");
    const invitee = await createUser("olena@example.org");

    const invitations = kabinetInvitationRepo(db);
    const now = new Date();
    const organizationId = await invitations.ensureOrganization(
      shelter.id,
      { organizationId: crypto.randomUUID() },
      now,
    );
    const invitation = await invitations.createInvitation({
      id: crypto.randomUUID(),
      organizationId,
      email: " Olena@Example.org ",
      inviterUserId: operator.id,
      now,
    });

    const cookie = await signIn("olena@example.org");
    const accepted = await auth.handler(
      post("/api/auth/organization/accept-invitation", { invitationId: invitation.id }, { cookie }),
    );
    expect(accepted.status).toBe(200);

    expect(await kabinetActorRepo(db).roleOf(invitee.id)).toEqual({
      kind: "shelter_admin",
      shelterAdminId: invitee.id,
      shelterId: shelter.id,
    });
    // The operator stayed a non-member: inviting made them nothing.
    expect(await kabinetActorRepo(db).roleOf(operator.id)).toEqual({ kind: "no_role" });
  });

  it("refuses an invitation accepted by someone it wasn't addressed to", async () => {
    const city = makeCity();
    await cityRepo(db).insert(city);
    const shelter = makeShelter({
      publicLocation: { ...makeShelter().publicLocation, cityId: city.id },
    });
    await shelterRepo(db).insert(shelter);
    const operator = await createUser("operator@example.org");
    await createUser("someone-else@example.org");
    const invitations = kabinetInvitationRepo(db);
    const now = new Date();
    const organizationId = await invitations.ensureOrganization(
      shelter.id,
      { organizationId: crypto.randomUUID() },
      now,
    );
    const invitation = await invitations.createInvitation({
      id: crypto.randomUUID(),
      organizationId,
      email: "olena@example.org",
      inviterUserId: operator.id,
      now,
    });
    const cookie = await signIn("someone-else@example.org");
    const accepted = await auth.handler(
      post("/api/auth/organization/accept-invitation", { invitationId: invitation.id }, { cookie }),
    );
    expect(accepted.status).toBe(403);
  });
});
