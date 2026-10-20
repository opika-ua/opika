import { createHash, createHmac } from "node:crypto";
import {
  cityRepo,
  INVITATION_TTL_MS,
  kabinetInvitationRepo,
  kabinetInviteTokenRepo,
  shelterRepo,
} from "@opika/db/repos";
import {
  authAccount,
  authInvitation,
  authMember,
  authSession,
  authUser,
  authVerification,
  superAdmins,
} from "@opika/db/schema";
import { makeCity, makeShelter, setupTestDatabase, truncateAll } from "@opika/db/test";
import type { ShelterId } from "@opika/domain";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { inMemoryRateLimiter, type RateLimiter } from "../api/rate-limit";
import { fromRpcBody, toRpcBody } from "../api/test-harness";
import { SHELTER_WRITE_POLICY } from "./access";
import { createKabinetAuth, type KabinetAuth } from "./auth";
import { handleKabinetAuth, type KabinetAuthAvailability } from "./auth-route";
import { capturingInvitationSender } from "./email-senders";
import { inviteCredentialsOf, invitePasswordLandingOf, newInviteToken } from "./invite-password";
import { capturingSender } from "./magic-link-sender";
import { type DelayStore, inMemoryDelayStore, SIGN_IN_DELAY } from "./password-limits";
import { capturingPasswordMail } from "./password-mail";
import { kabinetIdentityOf } from "./principal";
import { handleKabinetRpc } from "./rpc-route";

/**
 * The invitation link's «Створіть пароль» end to end (PW-2, `docs/shelter-passwords.md` §4.2,
 * §6.1, §8): a real Better Auth instance, its Drizzle adapter, real Postgres, real `Request`s
 * through the served RPC route function (`handleKabinetRpc`, with the principal resolved from
 * the cookie exactly as the route does) and the auth route. Only the email senders (captured)
 * and `after()` (run at once) are stand-ins.
 *
 * His scope item 2, verbatim: "Invite flow: the invite link opens «Створіть пароль» (password +
 * repeat, show/hide). Single-use, 72h, bound to the invited address. Accepting sets the password
 * and signs in." His PW-2 Q1, verbatim excerpt: "Tests: opening twice changes nothing, and every
 * failure kind renders the same page." (The page itself: `app/kabinet/vkhid/invite-landing-get.test.ts`.)
 */

const BASE = "http://localhost:3000";
const SECRET = "test-only-secret-that-is-long-enough-0123456789";
const INVITEE = "olena@example.org";
const OPERATOR_EMAIL = "operator@example.org";
/** Each password is used once in this file, so a leak names its flow. */
const GOOD = "ялинка-під-вікном-у-грудні";

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;
let auth: KabinetAuth;
let clock: Date;
let delayStore: DelayStore;
let logged: string[];
let pending: Promise<void>[];
let invitePerIp: RateLimiter;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());

const generous = () => inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 100_000 });

function build() {
  delayStore = inMemoryDelayStore();
  auth = createKabinetAuth({
    db,
    sender: capturingSender(),
    schedule: (work) => {
      pending.push(work());
    },
    baseURL: BASE,
    secret: SECRET,
    secureCookies: false,
    now: () => clock,
    limiters: { perUser: generous(), perIp: generous() },
    passwordLimiters: {
      forgotPerIp: generous(),
      forgotPerAddress: generous(),
      resetPerIp: generous(),
      signInDelay: delayStore,
    },
    passwordMail: capturingPasswordMail(),
    log: (line) => logged.push(line),
    logError: (line) => logged.push(line),
  });
}

let operatorId: string;

beforeEach(async () => {
  await truncateAll(db);
  clock = new Date();
  logged = [];
  pending = [];
  invitePerIp = generous();
  build();
  operatorId = crypto.randomUUID();
  await db.insert(authUser).values({
    id: operatorId,
    name: "Оператор",
    email: OPERATOR_EMAIL,
    emailVerified: true,
    createdAt: clock,
    updatedAt: clock,
  });
  await db.insert(superAdmins).values({
    id: crypto.randomUUID(),
    userId: operatorId,
    grantedAt: clock,
  });
});

const available = (): Extract<KabinetAuthAvailability, { kind: "available" }> => ({
  kind: "available",
  sender: capturingSender(),
  invites: capturingInvitationSender(),
  passwordMail: capturingPasswordMail(),
  secret: "unused-here",
  baseURL: BASE,
});

/** A fresh fictional shelter, its organization, and `email` invited to it, with a link. */
async function invited(email = INVITEE, shelterName = "Притулок «Ліс»") {
  const city = makeCity();
  await cityRepo(db).insert(city);
  const shelter = makeShelter({
    displayName: shelterName,
    publicLocation: { ...makeShelter().publicLocation, cityId: city.id },
  });
  await shelterRepo(db).insert(shelter);
  const invitationId = crypto.randomUUID();
  const result = await kabinetInvitationRepo(db).invite({
    shelterId: shelter.id as ShelterId,
    email,
    name: "Олена",
    inviterUserId: operatorId,
    ids: {
      invitationId,
      userId: crypto.randomUUID(),
      organizationId: crypto.randomUUID(),
    },
    now: clock,
    history: {
      id: crypto.randomUUID(),
      entry: { kind: "admin_invited", at: clock, moderatorId: operatorId as never, email },
    },
  });
  if (result.kind !== "invited") throw new Error(`invite refused: ${result.reason}`);
  const token = newInviteToken();
  await kabinetInviteTokenRepo(db).issue({
    id: crypto.randomUUID(),
    invitationId,
    token,
    expiresAt: result.expiresAt,
    now: clock,
  });
  return { token, invitationId, userId: result.userId, shelter };
}

/** Every response body and log line of a test, for the no-password check. */
const seen: string[] = [];

async function accept(
  token: string,
  password: string,
  opts: { cookie?: string; ip?: string } = {},
): Promise<{ status: number; body: unknown; setCookies: string[] }> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    origin: BASE,
    "x-vercel-forwarded-for": opts.ip ?? "198.51.100.7",
  };
  if (opts.cookie !== undefined) headers.cookie = opts.cookie;
  const request = new Request(`${BASE}/api/kabinet/invitation/acceptWithPassword`, {
    method: "POST",
    headers,
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
    ip: opts.ip ?? "198.51.100.7",
    now: clock,
    newId: () => crypto.randomUUID(),
    operatorDisplayName: "Олексій",
    locationPolicy: null,
    production: false,
    shelterWrites: SHELTER_WRITE_POLICY,
    invitePasswords: () => ({
      kind: "on",
      perIp: invitePerIp,
      ip: opts.ip ?? "198.51.100.7",
      credentials: inviteCredentialsOf(auth, BASE, request.headers),
    }),
  });
  await Promise.all(pending);
  const text = await response.text();
  seen.push(text, ...response.headers.getSetCookie());
  let body: unknown = text;
  try {
    body = fromRpcBody(JSON.parse(text));
  } catch {
    // a plain-text refusal
  }
  return { status: response.status, body, setCookies: response.headers.getSetCookie() };
}

const sessionCookieOf = (setCookies: string[]): string =>
  setCookies.findLast((c) => c.startsWith("kabinet.session_token="))?.split(";")[0] ?? "";

/** Through the auth route, as a browser would. */
async function authRoute(request: Request) {
  const response = await handleKabinetAuth(request, {
    availability: available(),
    auth: () => auth,
    limiters: { perAddress: generous(), perIp: generous() },
    now: clock,
  });
  await Promise.all(pending);
  const text = await response.clone().text();
  seen.push(text);
  return { status: response.status, text, response };
}

async function signedInAs(cookie: string): Promise<string | null> {
  const { text } = await authRoute(
    new Request(`${BASE}/api/auth/get-session`, { headers: { cookie, origin: BASE } }),
  );
  return (JSON.parse(text) as { user?: { email?: string } } | null)?.user?.email ?? null;
}

const signIn = (email: string, password: string) =>
  authRoute(
    new Request(`${BASE}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE },
      body: JSON.stringify({ email, password }),
    }),
  );

const errorCode = (body: unknown) => (body as { code?: unknown } | null)?.code;

/** Everything the flow could write, for "nothing changed". */
const snapshot = async () => ({
  verification: (await db.select().from(authVerification)).map((r) => [r.identifier, r.value]),
  invitations: (await db.select().from(authInvitation)).map((r) => [r.id, r.status]),
  accounts: (await db.select().from(authAccount)).map((r) => [r.userId, r.providerId]),
  sessions: (await db.select().from(authSession)).map((r) => r.id),
  members: (await db.select().from(authMember)).map((r) => r.userId),
});

afterEach(async () => {
  // §4.6's invariant: no credential row belongs to a user with an active super_admins grant.
  const operators = new Set(
    (await db.select().from(superAdmins)).filter((g) => g.revokedAt === null).map((g) => g.userId),
  );
  const credentials = (await db.select().from(authAccount)).filter(
    (row) => row.providerId === "credential",
  );
  expect(credentials.filter((row) => operators.has(row.userId))).toEqual([]);
  // No password in any body, cookie or log line this test saw.
  for (const text of [...seen, ...logged]) {
    expect(text.includes(GOOD), "a password reached a body or a log").toBe(false);
  }
  seen.length = 0;
});

describe("«Створіть пароль»: set a password at the invitation (§6.1)", () => {
  it("sets the password, signs in, accepts the invitation and uses the link up", async () => {
    const { token, invitationId, userId } = await invited();
    const answered = await accept(token, GOOD);
    expect(answered.status).toBe(200);
    expect(answered.body).toEqual({ kind: "signed_in" });

    // Signed in: Better Auth's own cookie, and its session is the invitee's.
    const cookie = sessionCookieOf(answered.setCookies);
    expect(cookie).not.toBe("");
    expect(await signedInAs(cookie)).toBe(INVITEE);
    // The membership is accepted and the invitation used.
    expect((await db.select().from(authMember)).map((m) => m.userId)).toEqual([userId]);
    expect(
      (await db.select().from(authInvitation)).find((i) => i.id === invitationId)?.status,
    ).toBe("accepted");
    // The link is gone, and nothing else of its kind is left.
    expect(
      (await db.select().from(authVerification)).filter((r) => r.value.startsWith("invitation:")),
    ).toEqual([]);
    // A credential holding a scrypt hash, never the password.
    const [credential] = (await db.select().from(authAccount)).filter(
      (r) => r.providerId === "credential",
    );
    expect(credential?.userId).toBe(userId);
    expect(credential?.accountId).toBe(userId);
    expect(credential?.password).not.toContain(GOOD);
    // PW1-F6 never fired on our own sequence (PW-2 carry-over 3): no refusal was logged.
    expect(logged.filter((line) => line.includes("password sign-in refused"))).toEqual([]);
  });

  /**
   * PW1-F5-N2: writing the credential ends every session of the user (migration 0013), so the
   * sign-in must come after it. The session the flow made exists after the whole flow; had it
   * been made first, the trigger would have deleted it.
   */
  it("the credential is written before the sign-in: the session it made is still there", async () => {
    const { token, userId } = await invited();
    const answered = await accept(token, GOOD);
    expect(answered.status).toBe(200);
    const sessions = (await db.select().from(authSession)).filter((s) => s.userId === userId);
    expect(sessions).toHaveLength(1);
    const credential = (await db.select().from(authAccount)).find(
      (r) => r.providerId === "credential",
    );
    // Strictly later: the session row was written after the credential row.
    expect(sessions[0]?.createdAt.getTime()).toBeGreaterThanOrEqual(
      credential?.createdAt.getTime() ?? Number.POSITIVE_INFINITY,
    );
  });

  it("the new password then signs in on its own; a second use of the link is the one unusable answer", async () => {
    const { token } = await invited();
    expect((await accept(token, GOOD)).status).toBe(200);
    const again = await accept(token, "інший-довгий-пароль-для-другого-разу");
    expect(again.status).toBe(410);
    expect(errorCode(again.body)).toBe("INVITE_UNUSABLE");
    expect(again.setCookies.filter((c) => c.startsWith("kabinet.session_token="))).toEqual([]);
    const signedIn = await signIn(INVITEE, GOOD);
    expect(signedIn.status).toBe(200);
  });

  it("two submissions at once: exactly one sets the password, the other is unusable", async () => {
    const { token } = await invited();
    const answers = await Promise.all([accept(token, GOOD), accept(token, GOOD)]);
    expect(answers.map((a) => a.status).sort()).toEqual([200, 410]);
    expect(
      (await db.select().from(authAccount)).filter((r) => r.providerId === "credential"),
    ).toHaveLength(1);
  });

  /**
   * A signed-in invitee with no role (the page shows them the form): the credential's write ends
   * the session they had (migration 0013), and they leave signed in on the new one (PW1-F5-N2).
   */
  it("an invitee already signed in with no role: the old session ends, the new one works", async () => {
    const { token, userId } = await invited();
    const context = await auth.$context;
    const old = await context.internalAdapter.createSession(userId);
    const oldCookie = `kabinet.session_token=${encodeURIComponent(
      `${old.token}.${createHmac("sha256", SECRET).update(old.token).digest("base64")}`,
    )}`;
    expect(await signedInAs(oldCookie)).toBe(INVITEE);
    const answered = await accept(token, GOOD, { cookie: oldCookie });
    expect(answered.body).toEqual({ kind: "signed_in" });
    expect(await signedInAs(oldCookie)).toBeNull();
    expect(await signedInAs(sessionCookieOf(answered.setCookies))).toBe(INVITEE);
  });

  /** PW1-F1-N1: a password written through a new path voids the user's other reset links. */
  it("voids the invitee's unused reset links, and only theirs", async () => {
    const { token, userId } = await invited();
    const hashed = (t: string) =>
      createHash("sha256").update(`reset-password:${t}`).digest("base64url");
    const otherUser = crypto.randomUUID();
    await db.insert(authVerification).values([
      {
        id: crypto.randomUUID(),
        identifier: hashed("theirs"),
        value: userId,
        expiresAt: new Date(clock.getTime() + 3_600_000),
        createdAt: clock,
        updatedAt: clock,
      },
      {
        id: crypto.randomUUID(),
        identifier: hashed("someone-else"),
        value: otherUser,
        expiresAt: new Date(clock.getTime() + 3_600_000),
        createdAt: clock,
        updatedAt: clock,
      },
    ]);
    expect((await accept(token, GOOD)).status).toBe(200);
    expect((await db.select().from(authVerification)).map((r) => r.value)).toEqual([otherUser]);
  });
});

describe("what the link refuses, and what a refusal leaves", () => {
  it("a password the policy refuses: the reason, nothing written, and the link still works", async () => {
    const { token } = await invited(INVITEE, "Притулок «Ліс»");
    const before = await snapshot();
    for (const [password, reason] of [
      ["коротко", "too_short"],
      ["olena-це-мій-пароль", "contains_personal"],
      ["мій-притулок-ліс-2026", "contains_personal"],
      ["1234567890", "common"],
      ["x".repeat(129), "too_long"],
    ] as const) {
      const refused = await accept(token, password);
      expect(refused.status, password).toBe(422);
      expect(errorCode(refused.body), password).toBe("PASSWORD_REJECTED");
      expect((refused.body as { data?: unknown }).data, password).toEqual({ reason });
    }
    expect(await snapshot()).toEqual(before);
    expect((await accept(token, GOOD)).status).toBe(200);
  });

  it("every kind of link that can't be used gets one identical answer, and writes nothing", async () => {
    // An invitation that lapsed: made 72 hours and a millisecond ago.
    const realNow = clock;
    clock = new Date(realNow.getTime() - INVITATION_TTL_MS - 1);
    const expired = await invited("expired@example.org", "Притулок «Старий»");
    clock = realNow;
    // A live invitation whose link lapsed (a link never outlives its invitation; planted).
    const live = await invited("live@example.org", "Притулок «Живий»");
    const lapsedLink = newInviteToken();
    await kabinetInviteTokenRepo(db).issue({
      id: crypto.randomUUID(),
      invitationId: live.invitationId,
      token: lapsedLink,
      expiresAt: new Date(clock.getTime() - 1),
      now: clock,
    });
    const withdrawn = await invited("withdrawn@example.org", "Притулок «Відкликаний»");
    await kabinetInvitationRepo(db).revoke(withdrawn.invitationId);
    const operatorLink = await (async () => {
      // An invitation can't be made for an operator's address (RG-T10); a link naming one is
      // planted, as a role granted after the invite would leave it.
      const made = await invited("later-operator@example.org", "Притулок «Опер»");
      await db
        .insert(superAdmins)
        .values({ id: crypto.randomUUID(), userId: made.userId, grantedAt: clock });
      return made;
    })();
    const hasPassword = await invited("has-password@example.org", "Притулок «Пароль»");
    await (await auth.$context).internalAdapter.createAccount({
      userId: hasPassword.userId,
      providerId: "credential",
      accountId: hasPassword.userId,
      password: await (await auth.$context).password.hash("вже-є-пароль-у-цієї-людини"),
    });

    const before = await snapshot();
    const cases = {
      unknown: newInviteToken(),
      malformed: "not-a-token",
      empty: "",
      "expired invitation": expired.token,
      "expired link": lapsedLink,
      "replaced link": live.token,
      withdrawn: withdrawn.token,
      operator: operatorLink.token,
      "has a password": hasPassword.token,
    };
    const answers: Record<string, unknown> = {};
    for (const [name, token] of Object.entries(cases)) {
      const answer = await accept(token, GOOD);
      answers[name] = { status: answer.status, body: answer.body, cookies: answer.setCookies };
    }
    const first = answers.unknown;
    expect(first).toMatchObject({ status: 410, body: { code: "INVITE_UNUSABLE" } });
    for (const [name, answer] of Object.entries(answers)) {
      // `empty` is refused by the input schema (min 1) before the handler: the contract's own 400.
      if (name === "empty") {
        expect((answer as { status: number }).status).toBe(400);
        continue;
      }
      expect(answer, name).toEqual(first);
    }
    expect(await snapshot()).toEqual(before);
  });

  it("an accepted invitation's link (a used one) is unusable too", async () => {
    const { token } = await invited();
    await accept(token, GOOD);
    expect(
      await invitePasswordLandingOf(token, {
        lookup: (t) => kabinetInviteTokenRepo(db).landingOf(t),
        now: clock,
      }),
    ).toEqual({ kind: "unusable" });
  });

  it("20 POSTs an hour per IP, whatever the token; the 21st is refused before anything is read", async () => {
    invitePerIp = inMemoryRateLimiter({ windowMs: 3_600_000, maxRequests: 20 });
    const { token } = await invited();
    for (let i = 0; i < 20; i++) {
      expect((await accept(newInviteToken(), GOOD)).status, `POST ${i + 1}`).toBe(410);
    }
    const refused = await accept(token, GOOD);
    expect(refused.status).toBe(429);
    expect(errorCode(refused.body)).toBe("RATE_LIMITED");
    // The real link was never reached: still usable from another address.
    expect((await accept(token, GOOD, { ip: "203.0.113.9" })).status).toBe(200);
  });

  it("a signed-in shelter admin can't use it: FORBIDDEN, and the link is untouched", async () => {
    const first = await invited("first@example.org", "Притулок «Перший»");
    const answered = await accept(first.token, GOOD);
    const cookie = sessionCookieOf(answered.setCookies);
    const second = await invited("second@example.org", "Притулок «Другий»");
    const before = await snapshot();
    const refused = await accept(second.token, "незвичний-пароль-для-перевірки", { cookie });
    expect(refused.status).toBe(403);
    expect(await snapshot()).toEqual(before);
  });

  it("the sign-in delay holds the sign-in: the password is set and the link used, the person signs in by hand", async () => {
    const { token } = await invited();
    for (let i = 0; i < SIGN_IN_DELAY.freeAttempts; i++) {
      await signIn(INVITEE, `неправильний-пароль-номер-${i}`);
    }
    const answered = await accept(token, GOOD);
    expect(answered.body).toEqual({ kind: "password_set" });
    expect(answered.setCookies.filter((c) => c.startsWith("kabinet.session_token="))).toEqual([]);
    expect(
      (await db.select().from(authAccount)).filter((r) => r.providerId === "credential"),
    ).toHaveLength(1);
    expect((await accept(token, GOOD)).status).toBe(410);
  });
});
