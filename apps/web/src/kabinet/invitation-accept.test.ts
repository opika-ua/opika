import {
  cityRepo,
  kabinetActorRepo,
  kabinetInvitationRepo,
  kabinetShelterRepo,
  shelterRepo,
} from "@opika/db/repos";
import {
  authInvitation,
  authMember,
  authSession,
  authUser,
  shelterHistory,
} from "@opika/db/schema";
import { makeCity, makeShelter, setupTestDatabase, truncateAll } from "@opika/db/test";
import type { ModeratorId, ShelterId } from "@opika/domain";
import type { InvitationStatus } from "better-auth/plugins/organization";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inMemoryRateLimiter } from "../api/rate-limit";
import { createKabinetAuth, type KabinetAuth } from "./auth";
import { handleKabinetAuth, type KabinetAuthAvailability } from "./auth-route";
import { handleKabinetConfirm } from "./confirm-route";
import { capturingInvitationSender } from "./email-senders";
import {
  type AcceptInvitation,
  invitationAccepter,
  selfHealingIdentity,
} from "./invitation-accept";
import { capturingSender } from "./magic-link-sender";
import { kabinetIdentityOf } from "./principal";

/**
 * The automatic invitation accept (IN-Q12/IN-Q13/IN-Q14), end to end: real
 * Better Auth, its real Drizzle adapter, real Postgres, real `Request`s
 * through the confirm route. Nothing mocked but the email provider.
 */

const BASE = "http://localhost:3000";

// Fixed, so the contract test below can build the same fixture twice.
const NOW = new Date(Date.now() - 60_000);
const OPERATOR = "0ec0ec0e-0000-4000-8000-000000000001";
const INVITEE = "0ec0ec0e-0000-4000-8000-000000000002";
const INVITATION = "0ec0ec0e-0000-4000-8000-000000000003";
const ORGANIZATION = "0ec0ec0e-0000-4000-8000-000000000004";
const EMAIL = "olena@example.org";
const city = makeCity();
const shelter = makeShelter({
  publicLocation: { ...makeShelter().publicLocation, cityId: city.id },
});

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
    // #95's kabinet limiters on verify/get-session/sign-out; out of the way here.
    limiters: {
      perUser: inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 100_000 }),
      perIp: inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 100_000 }),
    },
  });
  await fixture();
});

/** A shelter, the operator, and a pending invitation for EMAIL, made the way the registry makes them. */
async function fixture() {
  await cityRepo(db).insert(city);
  await shelterRepo(db).insert(shelter);
  await db.insert(authUser).values({
    id: OPERATOR,
    name: "Оператор",
    email: "op@example.org",
    emailVerified: true,
    createdAt: NOW,
    updatedAt: NOW,
  });
  const invited = await kabinetInvitationRepo(db).invite({
    shelterId: shelter.id,
    email: EMAIL,
    name: "Олена",
    inviterUserId: OPERATOR,
    ids: { invitationId: INVITATION, userId: INVITEE, organizationId: ORGANIZATION },
    now: NOW,
    history: {
      id: "0ec0ec0e-0000-4000-8000-000000000005",
      entry: { kind: "admin_invited", at: NOW, moderatorId: OPERATOR as ModeratorId, email: EMAIL },
    },
  });
  if (invited.kind !== "invited") throw new Error(`fixture: ${invited.kind}`);
}

const available: KabinetAuthAvailability = {
  kind: "available",
  sender: capturingSender(),
  invites: capturingInvitationSender(),
  secret: "unused-here",
  baseURL: BASE,
};

const realAccept = (newId?: () => string): AcceptInvitation =>
  invitationAccepter(db, () => new Date(), newId);
const noAccept: AcceptInvitation = async () => ({ kind: "nothing_to_accept" });

async function authRoute(request: Request): Promise<Response> {
  const response = await handleKabinetAuth(request, {
    availability: available,
    auth: () => auth,
    limiters: {
      perAddress: inMemoryRateLimiter({ windowMs: 3_600_000, maxRequests: 1000 }),
      perIp: inMemoryRateLimiter({ windowMs: 3_600_000, maxRequests: 1000 }),
    },
    now: new Date(),
  });
  await Promise.all(pending);
  return response;
}

/** Asks for a link and returns its token. */
async function requestLink(email = EMAIL): Promise<string> {
  const before = sender.sent.length;
  await authRoute(
    new Request(`${BASE}/api/auth/sign-in/magic-link`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE },
      body: JSON.stringify({ email }),
    }),
  );
  const link = sender.sent[before]?.url;
  if (link === undefined) throw new Error(`no link sent to ${email}`);
  return new URL(link).searchParams.get("token") ?? "";
}

/** Presses «Увійти» on the confirm page for this token. */
const press = (token: string, acceptInvitation: AcceptInvitation) =>
  handleKabinetConfirm(
    new Request(`${BASE}/kabinet/vkhid/pidtverdzhennia`, {
      method: "POST",
      headers: { origin: BASE },
      body: new URLSearchParams({ token }),
    }),
    { availability: available, auth: () => auth, acceptInvitation },
  );

/** Signs in through the confirm route; returns the response and the session cookie. */
async function signIn(acceptInvitation: AcceptInvitation = realAccept()) {
  const response = await press(await requestLink(), acceptInvitation);
  const cookie = response.headers
    .getSetCookie()
    .find((c) => c.startsWith("kabinet.session_token="))
    ?.split(";")[0];
  if (cookie === undefined) throw new Error(`no session cookie (${response.status})`);
  return { response, cookie };
}

async function state() {
  const invitation = (await db.select().from(authInvitation)).find((i) => i.id === INVITATION);
  const members = await db.select().from(authMember);
  const joined = (await kabinetShelterRepo(db).historyOf(shelter.id as ShelterId)).filter(
    (entry) => entry.kind === "admin_joined",
  );
  return { invitation: invitation?.status, members, joined };
}

/** Every id collides with a history row that already exists: the statement fails at its last write. */
async function collidingIds(): Promise<() => string> {
  const [existing] = await db.select({ id: shelterHistory.id }).from(shelterHistory).limit(1);
  if (existing === undefined) throw new Error("fixture wrote no history");
  return () => existing.id;
}

describe("«Увійти» accepts the pending invitation (IN-Q12)", () => {
  it("signs in and, in one statement, accepts it, adds the membership and records admin_joined", async () => {
    const { response } = await signIn();
    expect([response.status, response.headers.get("location")]).toEqual([303, "/kabinet"]);
    const after = await state();
    expect(after.invitation).toBe("accepted");
    expect(after.members).toHaveLength(1);
    expect(after.members[0]).toMatchObject({
      organizationId: ORGANIZATION,
      userId: INVITEE,
      role: "admin",
    });
    expect(after.joined).toHaveLength(1);
    expect(after.joined[0]).toEqual({
      kind: "admin_joined",
      at: expect.any(Date),
      shelterAdminId: INVITEE,
      invitationId: INVITATION,
      email: EMAIL,
    });
    expect(await kabinetActorRepo(db).roleOf(INVITEE)).toEqual({
      kind: "shelter_admin",
      shelterAdminId: INVITEE,
      shelterId: shelter.id,
    });
  });

  it("an accept failure leaves no membership and no history, the invitation still pending, and the person signed in", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const { response } = await signIn(realAccept(await collidingIds()));
    quiet.mockRestore();
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<a href="/kabinet">');
    expect(await state()).toEqual({ invitation: "pending", members: [], joined: [] });
    expect((await db.select().from(authSession)).map((s) => s.userId)).toEqual([INVITEE]);
  });

  it("logs the failure without the address or the query", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    await signIn(realAccept(await collidingIds()));
    const lines = logged.mock.calls.map((call) => call.join(" "));
    logged.mockRestore();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("invitation accept failed (23505)");
    expect(lines[0]).not.toContain(EMAIL);
    expect(lines[0]).not.toMatch(/insert|select/i);
  });

  it("the next sign-in completes the accept", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    await signIn(realAccept(await collidingIds()));
    quiet.mockRestore();
    const { response } = await signIn();
    expect(response.status).toBe(303);
    const after = await state();
    expect([after.invitation, after.members.length, after.joined.length]).toEqual([
      "accepted",
      1,
      1,
    ]);
  });

  it("running the accept twice creates one membership and one history entry", async () => {
    await signIn(noAccept);
    const accept = realAccept();
    expect((await accept(INVITEE)).kind).toBe("accepted");
    expect(await accept(INVITEE)).toEqual({ kind: "nothing_to_accept" });
    const after = await state();
    expect([after.invitation, after.members.length, after.joined.length]).toEqual([
      "accepted",
      1,
      1,
    ]);
  });

  it("a sign-in failure after a successful accept leaves the membership consistent", async () => {
    const token = await requestLink();
    expect((await press(token, realAccept())).status).toBe(303);
    // The same link again: Better Auth refuses it, and nothing about the membership moves.
    expect((await press(token, realAccept())).status).toBe(400);
    // A fresh sign-in finds nothing left to accept.
    await signIn();
    const after = await state();
    expect([after.invitation, after.members.length, after.joined.length]).toEqual([
      "accepted",
      1,
      1,
    ]);
    expect((await kabinetActorRepo(db).roleOf(INVITEE)).kind).toBe("shelter_admin");
  });

  it("never accepts an expired invitation", async () => {
    // The fixture holds one invitation; the test database is this file's own.
    await db.update(authInvitation).set({ expiresAt: new Date(Date.now() - 1000) });
    const { response } = await signIn();
    expect(response.status).toBe(303);
    expect(await state()).toEqual({ invitation: "pending", members: [], joined: [] });
  });

  it("never accepts an invitation addressed to someone else", async () => {
    await db.insert(authUser).values({
      id: "0ec0ec0e-0000-4000-8000-000000000009",
      name: "Інша",
      email: "someone-else@example.org",
      emailVerified: true,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const response = await press(await requestLink("someone-else@example.org"), realAccept());
    expect(response.status).toBe(303);
    expect(await state()).toEqual({ invitation: "pending", members: [], joined: [] });
  });
});

describe("/kabinet retries the accept for a signed-in user with no role (IN-Q12 self-heal)", () => {
  const identityFor = (cookie: string) => () =>
    kabinetIdentityOf(auth, db, new Headers({ cookie }), new Date(), false);

  it("accepts and resolves them as the shelter's admin", async () => {
    const { cookie } = await signIn(noAccept);
    const resolve = identityFor(cookie);
    expect((await resolve()).principal.kind).toBe("no_role");
    const healed = await selfHealingIdentity(await resolve(), { accept: realAccept(), resolve });
    expect(healed).toEqual({
      kind: "resolved",
      identity: {
        principal: { kind: "shelter_admin", shelterAdminId: INVITEE, shelterId: shelter.id },
        userId: INVITEE,
      },
    });
  });

  it("a failed accept is join_failed, with nothing written", async () => {
    const { cookie } = await signIn(noAccept);
    const resolve = identityFor(cookie);
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const healed = await selfHealingIdentity(await resolve(), {
      accept: realAccept(await collidingIds()),
      resolve,
    });
    quiet.mockRestore();
    expect(healed).toEqual({ kind: "join_failed" });
    expect(await state()).toEqual({ invitation: "pending", members: [], joined: [] });
  });

  it("leaves everyone else alone, without calling the accept", async () => {
    let called = false;
    const accept: AcceptInvitation = async () => {
      called = true;
      return { kind: "nothing_to_accept" };
    };
    const anonymous = { principal: { kind: "anonymous" as const }, userId: null };
    const resolve = async () => anonymous;
    expect(await selfHealingIdentity(anonymous, { accept, resolve })).toEqual({
      kind: "resolved",
      identity: anonymous,
    });
    const { cookie } = await signIn();
    const admin = await identityFor(cookie)();
    expect(admin.principal.kind).toBe("shelter_admin");
    expect(await selfHealingIdentity(admin, { accept, resolve })).toEqual({
      kind: "resolved",
      identity: admin,
    });
    expect(called).toBe(false);
  });
});

/**
 * IN-Q13 (Oleksii): "run Better Auth's accept and ours on the same fixture
 * and compare the resulting invitation and member rows. A Better Auth
 * upgrade that changes them must fail this test." Better Auth's accept runs
 * through `auth.handler`, test only (the route forwards no organization
 * path, and source calls no Better Auth server API but `getSession`).
 */
describe("contract: our accept writes what Better Auth's accept writes (IN-Q13)", () => {
  const post = (path: string, body: unknown, cookie: string) =>
    new Request(`${BASE}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE, cookie },
      body: JSON.stringify(body),
    });

  async function rows() {
    const [invitation] = await db.select().from(authInvitation);
    const [member] = await db.select().from(authMember);
    const [session] = await db.select().from(authSession);
    if (member === undefined) throw new Error("no member row");
    // Generated per run: the id, and the time it was written.
    const { id, createdAt, ...rest } = member;
    expect(typeof id).toBe("string");
    expect(createdAt).toBeInstanceOf(Date);
    return {
      invitation,
      member: rest,
      activeOrganizationId: session?.activeOrganizationId ?? null,
    };
  }

  it("the same invitation and member rows; only the session's active organization differs, on purpose", async () => {
    const theirs = await signIn(noAccept);
    const accepted = await auth.handler(
      post("/api/auth/organization/accept-invitation", { invitationId: INVITATION }, theirs.cookie),
    );
    expect(accepted.status).toBe(200);
    const betterAuth = await rows();

    await truncateAll(db);
    await fixture();
    await signIn();
    const ours = await rows();

    expect(ours.invitation).toEqual(betterAuth.invitation);
    expect(ours.member).toEqual(betterAuth.member);
    // Better Auth's accept also sets the session's active organization. Ours
    // never writes Better Auth's session row (IN-Q12), and actor resolution
    // never reads that column (one membership per user).
    expect([betterAuth.activeOrganizationId, ours.activeOrganizationId]).toEqual([
      ORGANIZATION,
      null,
    ]);
  });

  /**
   * IN-T12's cancel (Oleksii, 2026-10-14: "accept the newest and mark the
   * older ones status=canceled"). Better Auth's accept cancels nothing, so
   * there is no row of its to compare against; what must match is the
   * literal, which has to be Better Auth's own for a canceled invitation
   * (its exported `InvitationStatus` type; the runtime schema isn't
   * exported), or its reads would see a status it doesn't know. `satisfies`
   * makes a Better Auth upgrade that renames it a typecheck failure.
   */
  it("the older duplicate is canceled with Better Auth's own literal for it", async () => {
    const older = "0ec0ec0e-0000-4000-8000-000000000006";
    await db.insert(authInvitation).values({
      id: older,
      organizationId: ORGANIZATION,
      email: EMAIL,
      role: "admin",
      status: "pending",
      expiresAt: new Date(NOW.getTime() + 3_600_000),
      createdAt: new Date(NOW.getTime() - 1000),
      inviterId: OPERATOR,
    });
    await signIn();
    const statuses = Object.fromEntries(
      (await db.select().from(authInvitation)).map((row) => [row.id, row.status]),
    );
    const accepted = "accepted" satisfies InvitationStatus;
    const canceled = "canceled" satisfies InvitationStatus;
    expect(statuses).toEqual({ [INVITATION]: accepted, [older]: canceled });
  });

  it("Better Auth's own reads see our membership: the full organization and the members list", async () => {
    const { cookie } = await signIn();
    const get = (path: string) =>
      auth.handler(new Request(`${BASE}${path}`, { headers: { cookie, origin: BASE } }));
    const full = await get(
      `/api/auth/organization/get-full-organization?organizationId=${ORGANIZATION}`,
    );
    expect(full.status).toBe(200);
    const organization = (await full.json()) as {
      id: string;
      members: { userId: string; role: string }[];
    };
    expect(organization.id).toBe(ORGANIZATION);
    expect(organization.members.map((m) => [m.userId, m.role])).toEqual([[INVITEE, "admin"]]);
    const list = await get(`/api/auth/organization/list-members?organizationId=${ORGANIZATION}`);
    expect(list.status).toBe(200);
    const members = (await list.json()) as { members: { userId: string; role: string }[] };
    expect(members.members.map((m) => [m.userId, m.role])).toEqual([[INVITEE, "admin"]]);
  });
});
