import { createHash, createHmac } from "node:crypto";
import { cityRepo, kabinetInvitationRepo, shelterRepo } from "@opika/db/repos";
import {
  authAccount,
  authMember,
  authSession,
  authVerification,
  superAdmins,
} from "@opika/db/schema";
import {
  holdPasswordWriteUncommitted,
  makeCity,
  makeShelter,
  type SteppedStatement,
  setupTestDatabase,
  statementName,
  steppedDatabase,
  truncateAll,
} from "@opika/db/test";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inMemoryRateLimiter } from "../api/rate-limit";
import { createKabinetAuth, type KabinetAuth } from "./auth";
import { handleKabinetAuth, type KabinetAuthAvailability } from "./auth-route";
import { handleKabinetConfirm } from "./confirm-route";
import { capturingInvitationSender } from "./email-senders";
import { invitationAccepter } from "./invitation-accept";
import { capturingSender } from "./magic-link-sender";
import { type DelayStore, inMemoryDelayStore, type PasswordLimiters } from "./password-limits";
import { capturingPasswordMail } from "./password-mail";
import type { KabinetLimiters } from "./rate-limits";

/**
 * The password flows end to end (`docs/shelter-passwords.md` §8): a real Better Auth instance,
 * its real Drizzle adapter, real Postgres, real `Request`s through the route function. Only the
 * email provider (captured) and `after()` (run at once, awaited) are stand-ins.
 *
 * Oleksii's scope item 11, verbatim: "Tests: flows by role/label (set password at invite, sign
 * in, wrong password, forgot → reset → old sessions gone, change password); operator can't set
 * or use a password; the enumeration test; the rate-limit tests." (Setting a password at the
 * invitation is PW-2's.)
 */

const BASE = "http://localhost:3000";
const SECRET = "test-only-secret-that-is-long-enough-0123456789";
const DAY = 24 * 60 * 60 * 1000;

/** Fictional people. Each password is used once, so a leak names its flow. */
const ADMIN = "olena@example.org";
const OPERATOR = "operator@example.org";
const NO_PASSWORD_ADMIN = "petro@example.org";
const GOOD = "ялинка-під-вікном-1987";
const NEWER = "сонячний-ранок-над-Дніпром";

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;
let auth: KabinetAuth;
let mail: ReturnType<typeof capturingPasswordMail>;
let links: ReturnType<typeof capturingSender>;
let pending: Promise<void>[];
let clock: Date;
let delayStore: DelayStore;
let logged: string[];
let loggedErrors: string[];

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());

const generous = () => inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 100_000 });
const kabinet = (): KabinetLimiters => ({ perUser: generous(), perIp: generous() });

type BuildOverrides = {
  password?: Partial<PasswordLimiters>;
  kabinet?: KabinetLimiters;
  db?: typeof db;
  /** In place of running scheduled work at once (and awaiting it in `route`). */
  schedule?: (work: () => Promise<void>) => void;
  /** Leave out `log` and `logError`, so the production defaults (the console) are used. */
  productionLogs?: boolean;
};

function build(overrides: BuildOverrides = {}) {
  auth = authWith(overrides);
}

/** A kabinet auth as `build` makes it, without replacing `auth`: a second instance, for a race. */
function authWith(overrides: BuildOverrides = {}): KabinetAuth {
  delayStore = overrides.password?.signInDelay ?? inMemoryDelayStore();
  return createKabinetAuth({
    db: overrides.db ?? db,
    sender: links,
    schedule:
      overrides.schedule ??
      ((work) => {
        pending.push(work());
      }),
    baseURL: BASE,
    secret: SECRET,
    secureCookies: false,
    now: () => clock,
    limiters: overrides.kabinet ?? kabinet(),
    passwordLimiters: {
      forgotPerIp: generous(),
      forgotPerAddress: generous(),
      resetPerIp: generous(),
      ...overrides.password,
      signInDelay: delayStore,
    },
    passwordMail: mail,
    ...(overrides.productionLogs === true
      ? {}
      : {
          log: (line: string) => logged.push(line),
          logError: (line: string) => loggedErrors.push(line),
        }),
  });
}

beforeEach(async () => {
  await truncateAll(db);
  mail = capturingPasswordMail();
  links = capturingSender();
  pending = [];
  logged = [];
  loggedErrors = [];
  clock = new Date();
  build();
});

const available = (): KabinetAuthAvailability => ({
  kind: "available",
  sender: links,
  invites: capturingInvitationSender(),
  passwordMail: mail,
  secret: "unused-here",
  baseURL: BASE,
});

/** Every response body read in a test, so the no-password-in-any-body check can see them all. */
const bodies: string[] = [];

/** Every session token a response's `kabinet.session_token` cookie carried (signed: `<token>.<signature>`). */
const issuedSessionTokens: string[] = [];

function noteSessionTokens(response: Response) {
  for (const cookie of response.headers.getSetCookie()) {
    if (!cookie.startsWith("kabinet.session_token=")) continue;
    const value = decodeURIComponent(cookie.split(";")[0]?.split("=")[1] ?? "");
    const token = value.split(".")[0] ?? "";
    if (token !== "") issuedSessionTokens.push(token);
  }
}

async function route(
  request: Request,
  via?: KabinetAuth,
): Promise<{ status: number; text: string; response: Response }> {
  const response = await handleKabinetAuth(request, {
    availability: available(),
    auth: () => via ?? auth,
    limiters: {
      perAddress: inMemoryRateLimiter({ windowMs: 3_600_000, maxRequests: 1000 }),
      perIp: inMemoryRateLimiter({ windowMs: 3_600_000, maxRequests: 1000 }),
    },
    now: clock,
  });
  await Promise.all(pending);
  const text = await response.clone().text();
  bodies.push(text);
  noteSessionTokens(response);
  return { status: response.status, text, response };
}

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE, ...headers },
    body: JSON.stringify(body),
  });

const signInWithPassword = (
  email: string,
  password: string,
  headers: Record<string, string> = {},
) => route(post("/api/auth/sign-in/email", { email, password }, headers));

/**
 * The session cookie a browser would hold after this response: the last `kabinet.session_token`
 * it sets, since each Set-Cookie replaces an earlier one of the same name and path (RFC 6265,
 * §5.3). Not the first: since sessions refresh on every request (PW1-Q2), a change's response
 * re-sets the old session's cookie (Better Auth's session check refreshing it) before the new
 * session's, and by then the old session is deleted.
 */
const sessionCookieOf = (response: Response): string => {
  const cookie = response.headers
    .getSetCookie()
    .findLast((c) => c.startsWith("kabinet.session_token="));
  return cookie?.split(";")[0] ?? "";
};

async function signedInUser(cookie: string): Promise<string | null> {
  const { text } = await route(
    new Request(`${BASE}/api/auth/get-session`, { headers: { cookie, origin: BASE } }),
  );
  const body = JSON.parse(text) as { user?: { email?: string } } | null;
  return body?.user?.email ?? null;
}

async function createUser(email: string) {
  const ctx = await auth.$context;
  const user = await ctx.internalAdapter.createUser({ email, name: "Олена", emailVerified: true });
  if (!user) throw new Error("createUser returned nothing");
  return user;
}

/** A shelter admin of a fresh fictional shelter, named `shelterName`. */
async function shelterAdmin(email: string, shelterName = "Притулок «Ліс»") {
  const city = makeCity();
  await cityRepo(db).insert(city);
  const shelter = makeShelter({
    displayName: shelterName,
    publicLocation: { ...makeShelter().publicLocation, cityId: city.id },
  });
  await shelterRepo(db).insert(shelter);
  const user = await createUser(email);
  const organizationId = await kabinetInvitationRepo(db).ensureOrganization(
    shelter.id,
    { organizationId: crypto.randomUUID() },
    new Date(),
  );
  await db.insert(authMember).values({
    id: crypto.randomUUID(),
    organizationId,
    userId: user.id,
    role: "admin",
    createdAt: new Date(),
  });
  return user;
}

async function operator(email = OPERATOR) {
  const user = await createUser(email);
  await db
    .insert(superAdmins)
    .values({ id: crypto.randomUUID(), userId: user.id, grantedAt: new Date() });
  return user;
}

/** «Увійти» by link for `email`: Better Auth writes the link's row; the confirm page's URL. */
async function requestLink(email: string): Promise<string> {
  const before = links.sent.length;
  await route(post("/api/auth/sign-in/magic-link", { email }));
  const link = links.sent[before]?.url;
  if (link === undefined) throw new Error(`no link sent to ${email}`);
  return link;
}

/** A magic-link sign-in, through the confirm page's POST (IN-Q11): a session without a password. */
async function signInByLink(email: string): Promise<string> {
  return confirmLink(await requestLink(email));
}

/** The confirm page's POST for a link `requestLink` returned; the session cookie it sets. */
async function confirmLink(link: string): Promise<string> {
  const token = new URL(link).searchParams.get("token") ?? "";
  const verified = await handleKabinetConfirm(
    new Request(link, {
      method: "POST",
      headers: { origin: BASE },
      body: new URLSearchParams({ token }),
    }),
    {
      availability: available(),
      auth: () => auth,
      acceptInvitation: invitationAccepter(db, () => new Date()),
    },
  );
  noteSessionTokens(verified);
  return sessionCookieOf(verified);
}

/** «Забули пароль?» for `email`; the reset link's token, when one was sent. */
async function forgot(email: string) {
  const before = mail.sent.length;
  const answer = await route(post("/api/auth/request-password-reset", { email }));
  const sent = mail.sent.slice(before).find((m) => m.kind === "reset");
  const token = sent?.kind === "reset" ? (new URL(sent.url).searchParams.get("token") ?? "") : null;
  return { answer, token, url: sent?.kind === "reset" ? sent.url : null };
}

const reset = (token: string, newPassword: string) =>
  route(post("/api/auth/reset-password", { token, newPassword }));

/** A shelter admin with a password, set the way an existing admin sets one (scope item 9). */
async function adminWithPassword(email = ADMIN, password = GOOD) {
  const user = await shelterAdmin(email);
  const { token } = await forgot(email);
  if (token === null) throw new Error("no reset link");
  const done = await reset(token, password);
  if (done.status !== 200) throw new Error(`reset answered ${done.status}: ${done.text}`);
  mail.sent.length = 0;
  return user;
}

const codeOf = (text: string): unknown => (JSON.parse(text) as { code?: unknown }).code;

const credentialRows = async () =>
  (await db.select().from(authAccount)).filter((row) => row.providerId === "credential");

/** §4.6's invariant: no credential row belongs to a user with an active super_admins grant. */
async function expectNoOperatorCredential() {
  const operators = new Set(
    (await db.select().from(superAdmins)).filter((g) => g.revokedAt === null).map((g) => g.userId),
  );
  expect((await credentialRows()).filter((row) => operators.has(row.userId))).toEqual([]);
}

afterEach(async () => {
  await expectNoOperatorCredential();
});

describe("forgot → reset → sign in (§6.3)", () => {
  it("a shelter admin is sent a link to the reset page, and nobody else is sent anything", async () => {
    await shelterAdmin(ADMIN);
    await operator();
    await createUser("roleless@example.org");
    const asked = await forgot(ADMIN);
    expect(asked.answer.status).toBe(200);
    expect(asked.url).toMatch(/^http:\/\/localhost:3000\/kabinet\/vkhid\/novyi-parol\?token=\w+$/);
    for (const other of ["nobody@example.org", OPERATOR, "roleless@example.org"]) {
      const answer = await forgot(other);
      expect(answer.answer.status, other).toBe(200);
      // One body for every address (§6.3), the operator's included.
      expect(answer.answer.text, other).toBe(asked.answer.text);
      expect(answer.token, other).toBeNull();
    }
    expect(asked.answer.text).toBe('{"status":true}');
    expect(mail.sent.map((m) => m.kind)).toEqual(["reset"]);
  });

  it("stores the token hashed: the row's identifier is neither the token nor holds it", async () => {
    await shelterAdmin(ADMIN);
    const { token } = await forgot(ADMIN);
    if (token === null) throw new Error("no link");
    const rows = await db.select().from(authVerification);
    expect(rows).toHaveLength(1);
    const identifier = rows[0]?.identifier ?? "";
    expect(identifier).not.toContain(token);
    expect(identifier).toBe(
      createHash("sha256").update(`reset-password:${token}`).digest("base64url"),
    );
    // One hour (scope item 6), written out.
    expect((rows[0]?.expiresAt.getTime() ?? 0) - Date.now()).toBeGreaterThan(59 * 60_000);
    expect((rows[0]?.expiresAt.getTime() ?? 0) - Date.now()).toBeLessThanOrEqual(60 * 60_000);
  });

  it("refuses a weak password and keeps the link usable; a good one ends every session and sends the notice", async () => {
    const admin = await shelterAdmin(ADMIN, "Притулок «Сіріус»");
    const phone = await signInByLink(ADMIN);
    const laptop = await signInByLink(ADMIN);
    expect(await signedInUser(phone)).toBe(ADMIN);
    const { token } = await forgot(ADMIN);
    if (token === null) throw new Error("no link");

    for (const [password, code] of [
      ["коротко", "PASSWORD_TOO_SHORT"],
      ["ж".repeat(129), "PASSWORD_TOO_LONG"],
      ["qwertyuiop", "PASSWORD_COMMON"],
      ["olena-назавжди-2026", "PASSWORD_CONTAINS_PERSONAL"],
      ["мій-сіріус-найкращий", "PASSWORD_CONTAINS_PERSONAL"],
      ["пароль-до-opika-ось", "PASSWORD_CONTAINS_PERSONAL"],
    ] as const) {
      const refused = await reset(token, password);
      expect(refused.status, password).toBe(400);
      expect(codeOf(refused.text), password).toBe(code);
    }
    expect(await credentialRows()).toEqual([]);

    const done = await reset(token, GOOD);
    expect(done.status).toBe(200);
    // Every session of that user is gone (scope item 6), both devices.
    expect(await signedInUser(phone)).toBeNull();
    expect(await signedInUser(laptop)).toBeNull();
    expect(await db.select().from(authSession)).toEqual([]);
    // A credential holding a hash, never the password.
    const [credential] = await credentialRows();
    expect(credential?.userId).toBe(admin.id);
    expect(credential?.password).toBeTruthy();
    expect(credential?.password).not.toContain(GOOD);
    // The notice (§9 answer 4), after the link itself.
    expect(mail.sent.map((m) => m.kind)).toEqual(["reset", "changed"]);
    expect(mail.sent[1]).toEqual({ kind: "changed", email: ADMIN });
    // Single use.
    const again = await reset(token, NEWER);
    expect(again.status).toBe(400);
    expect(codeOf(again.text)).toBe("INVALID_TOKEN");
  });

  it("an expired link is refused before anything else, and sets nothing", async () => {
    await shelterAdmin(ADMIN);
    const { token } = await forgot(ADMIN);
    if (token === null) throw new Error("no link");
    await db.update(authVerification).set({ expiresAt: new Date(Date.now() - 1000) });
    const refused = await reset(token, GOOD);
    expect(refused.status).toBe(400);
    expect(codeOf(refused.text)).toBe("INVALID_TOKEN");
    expect(await credentialRows()).toEqual([]);
  });

  it("signs in with the new password: 200, a session cookie, and no token in the body", async () => {
    await adminWithPassword();
    const signedIn = await signInWithPassword(" Olena@Example.org ", GOOD);
    expect(signedIn.status).toBe(200);
    expect(signedIn.text).toBe('{"status":true}');
    const cookie = sessionCookieOf(signedIn.response);
    expect(cookie).not.toBe("");
    expect(await signedInUser(cookie)).toBe(ADMIN);
  });
});

describe("«Забули пароль?» takes the same time for every address (§4.4)", () => {
  /** Every database statement started, and every call into a dependency, in order. */
  let trace: string[];
  /** The work scheduled for after the response, held until the response is in hand. */
  let queued: (() => Promise<void>)[];

  /** Records each call of a function on `target` as `name.method`, then makes it. */
  function traced<T extends object>(name: string, target: T): T {
    return new Proxy(target, {
      get(object, property) {
        const value = Reflect.get(object, property, object);
        if (typeof value !== "function") return value;
        return (...args: unknown[]) => {
          trace.push(`${name}.${String(property)}`);
          return value.apply(object, args);
        };
      },
    });
  }

  /**
   * `db` with each statement recorded as it starts: the query builders, and the relational
   * `db.query.<table>.findFirst/findMany` Better Auth's adapter uses for its joins.
   */
  function countingDb(target: typeof db): typeof db {
    const STARTS = new Set(["select", "selectDistinct", "insert", "update", "delete", "with"]);
    const OTHER = new Set(["execute", "transaction", "batch", "$count"]);
    const queries = new Proxy(target.query, {
      get(models, model) {
        const builder = Reflect.get(models, model, models);
        return typeof builder === "object" && builder !== null
          ? traced(`db.query.${String(model)}`, builder)
          : builder;
      },
    });
    return new Proxy(target, {
      get(object, property) {
        if (property === "query") return queries;
        const value = Reflect.get(object, property, object);
        if (typeof value !== "function") return value;
        return (...args: unknown[]) => {
          if (typeof property === "string" && (STARTS.has(property) || OTHER.has(property))) {
            trace.push(`db.${property}`);
          }
          return value.apply(object, args);
        };
      },
    });
  }

  function tracedAuth() {
    const counted = (name: string) => traced(name, generous());
    return createKabinetAuth({
      db: countingDb(db),
      sender: traced("magicLink", links),
      schedule: (work) => {
        trace.push("schedule");
        queued.push(work);
      },
      baseURL: BASE,
      secret: SECRET,
      secureCookies: false,
      now: () => clock,
      limiters: { perUser: counted("kabinet.perUser"), perIp: counted("kabinet.perIp") },
      passwordLimiters: {
        forgotPerIp: counted("forgotPerIp"),
        forgotPerAddress: counted("forgotPerAddress"),
        resetPerIp: counted("resetPerIp"),
        signInDelay: traced("signInDelay", inMemoryDelayStore()),
      },
      passwordMail: traced("mail", mail),
      log: (line) => logged.push(line),
    });
  }

  it("the same work before the answer for nobody, the operator, a roleless user and a shelter admin; the lookup, the token and the email only after it", async () => {
    await shelterAdmin(ADMIN);
    await operator();
    await createUser("roleless@example.org");
    const traceAuth = tracedAuth();
    const addresses = ["nobody@example.org", OPERATOR, "roleless@example.org", ADMIN];
    const before = new Map<string, string[]>();
    const after = new Map<string, string[]>();
    const answers = new Map<string, { status: number; text: string }>();
    for (const email of addresses) {
      trace = [];
      queued = [];
      const response = await handleKabinetAuth(
        post("/api/auth/request-password-reset", { email }),
        {
          availability: available(),
          auth: () => traceAuth,
          limiters: { perAddress: generous(), perIp: generous() },
          now: clock,
        },
      );
      answers.set(email, { status: response.status, text: await response.text() });
      before.set(email, trace);
      trace = [];
      while (queued.length > 0) await queued.shift()?.();
      after.set(email, trace);
    }

    const nobody = before.get("nobody@example.org");
    for (const email of addresses) {
      // The same calls, in the same order, until the answer exists (§4.4).
      expect(before.get(email), email).toEqual(nobody);
      expect(answers.get(email), email).toEqual({ status: 200, text: '{"status":true}' });
    }
    // And what they are: the kabinet's per-IP charge, both «Забули пароль?» limits, and the
    // scheduling. Nothing from the database, the mail or Better Auth's token before the answer.
    expect(nobody).toEqual([
      "kabinet.perIp.check",
      "forgotPerIp.check",
      "forgotPerAddress.check",
      "schedule",
    ]);

    // After it: the address-dependent work, a token and an email for the shelter admin only.
    for (const email of ["nobody@example.org", OPERATOR, "roleless@example.org"]) {
      const work = after.get(email) ?? [];
      expect(
        work.some((call) => call.startsWith("db.")),
        email,
      ).toBe(true);
      expect(work, email).not.toContain("db.insert");
      expect(
        work.filter((call) => call.startsWith("mail.")),
        email,
      ).toEqual([]);
    }
    const admin = after.get(ADMIN) ?? [];
    expect(admin).toContain("db.insert");
    expect(admin.filter((call) => call.startsWith("mail."))).toEqual(["mail.sendReset"]);
    const tokens = await db.select().from(authVerification);
    expect(tokens.map((row) => row.value)).toEqual([(await userIdOf(ADMIN)) ?? "none"]);
    expect(mail.sent.map((m) => [m.kind, m.email])).toEqual([["reset", ADMIN]]);
    expect(logged).toEqual([]);
  });

  it("a failure after the answer is one log line naming no address, token or link", async () => {
    await shelterAdmin(ADMIN);
    const failing = capturingPasswordMail();
    failing.sendReset = async () => {
      throw new Error(`provider down for ${ADMIN}`);
    };
    mail = failing;
    build();
    const consoleLines: string[] = [];
    const spies = (["log", "info", "warn", "error"] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        consoleLines.push(args.map(String).join(" "));
      }),
    );
    try {
      const asked = await forgot(ADMIN);
      expect(asked.answer.text).toBe('{"status":true}');
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
    expect(logged).toEqual(["[kabinet] the reset email failed after the response"]);
    const [row] = await db.select().from(authVerification);
    expect(row).toBeDefined();
    const everything = [...logged, ...consoleLines].join("\n");
    expect(everything).not.toContain(ADMIN);
    expect(everything).not.toContain("olena");
    expect(everything).not.toContain("novyi-parol");
  });
});

/** The id of the user with this address. */
async function userIdOf(email: string): Promise<string | null> {
  const ctx = await auth.$context;
  return (await ctx.internalAdapter.findUserByEmail(email))?.user.id ?? null;
}

describe("sign-in: one answer for every failure (§5)", () => {
  /**
   * One password sign-in on a fresh instance, and its work in the order it ran (PW1-F4): each
   * statement as it starts (`steppedDatabase`), each call into the kabinet's per-IP limiter and
   * the delay store (in production a round trip each), and each scrypt: `password.hash` or
   * `.verify` on this instance's own context, the object Better Auth's endpoint and the operator
   * guard both call through. A scrypt nothing started during reads `scrypt`; one that something
   * started during is split into `scrypt…` and `…scrypt` around it, which is how a hash nobody
   * awaited shows. Order only: nothing here reads a clock.
   */
  async function workOf(email: string, password: string) {
    const stepped = steppedDatabase(db);
    const events: { at: number; what: string }[] = [];
    const mark = (what: string) => events.push({ at: stepped.trace.length, what });
    function observed<T extends object>(name: string, target: T): T {
      return new Proxy(target, {
        get(object, property) {
          const value = Reflect.get(object, property, object);
          if (typeof value !== "function") return value;
          return (...args: unknown[]) => {
            mark(`${name}.${String(property)}`);
            return value.apply(object, args);
          };
        },
      });
    }
    const instance = authWith({
      db: stepped.db,
      kabinet: { perUser: generous(), perIp: observed("perIp", generous()) },
      password: { signInDelay: observed("delay", inMemoryDelayStore()) },
    });
    const scrypt = (await instance.$context).password;
    const { hash, verify } = scrypt;
    const around = async <T>(work: Promise<T>): Promise<T> => {
      mark("scrypt…");
      try {
        return await work;
      } finally {
        mark("…scrypt");
      }
    };
    scrypt.hash = (value) => around(hash(value));
    scrypt.verify = (data) => around(verify(data));

    const answer = await route(post("/api/auth/sign-in/email", { email, password }), instance);
    const names = stepped.trace.map(statementName);
    const work: string[] = [];
    for (let at = 0; at <= names.length; at++) {
      for (const event of events.filter((e) => e.at === at)) {
        if (event.what === "…scrypt" && work.at(-1) === "scrypt…") work[work.length - 1] = "scrypt";
        else work.push(event.what);
      }
      const name = names[at];
      if (name !== undefined) work.push(name);
    }
    return { work, answer };
  }

  /** The four causes §5 lists, each set up for real. */
  async function causes() {
    await adminWithPassword();
    await shelterAdmin(NO_PASSWORD_ADMIN);
    const op = await operator();
    // A credential that must never exist (§4.6), planted to prove the guard refuses it anyway.
    const ctx = await auth.$context;
    await db.insert(authAccount).values({
      id: crypto.randomUUID(),
      accountId: op.id,
      providerId: "credential",
      userId: op.id,
      password: await ctx.password.hash(GOOD),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return [
      { name: "an unknown address", email: "nobody@example.org", password: GOOD },
      { name: "a wrong password", email: ADMIN, password: "зовсім-не-той-пароль" },
      { name: "an admin with no password yet", email: NO_PASSWORD_ADMIN, password: GOOD },
      { name: "the operator, even holding a credential", email: OPERATOR, password: GOOD },
    ];
  }

  it("the same status and the same body, whatever the cause", async () => {
    const answers = [];
    for (const cause of await causes()) {
      const answer = await signInWithPassword(cause.email, cause.password);
      expect(answer.status, cause.name).toBe(401);
      expect(sessionCookieOf(answer.response), cause.name).toBe("");
      answers.push(answer.text);
    }
    expect(new Set(answers).size).toBe(1);
    expect(codeOf(answers[0] ?? "{}")).toBe("INVALID_EMAIL_OR_PASSWORD");
    // The planted operator credential is gone again for the afterEach invariant.
    await removePlantedCredential();
  });

  /**
   * Similar timing (§5), asserted as the work that makes it and never by the clock (PW1-F4: a
   * comparison of wall-clock medians went red on a busy machine and green in CI). A sign-in's time
   * is its one scrypt (tens of milliseconds) plus its round trips, so each attempt's work is
   * compared whole, in order (`workOf`). Every cause and a success run exactly one scrypt, awaited
   * before anything else starts: Better Auth hashes a dummy for an address nobody has and for an
   * admin with no password, the operator guard hashes one too (the PW-1 review's mutation M8,
   * "operator guard skips its dummy hash", was caught then only by the clock), and a credential
   * is verified. Around it, each cause makes exactly a wrong password's calls and statements, the
   * operator too: its guard refuses before Better Auth runs, so it makes Better Auth's user and
   * credential reads itself (PW1-F7). One cause makes one read fewer, pinned here rather than
   * hidden: Better Auth reads no credential for an address nobody has (its user read found no
   * one), a recorded residual (inbox PW1-F4-Q1, his (b)). PW1-F6's two reads are in every trace;
   * where they fall is the PW1-F6 test's to pin ("every sign-in makes the same two reads …").
   */
  it("similar timing, as the work behind it: one awaited scrypt for every cause and a success, among a wrong password's statements, the operator's included, less only the credential read an unknown address skips", async () => {
    const attempts = [
      ...(await causes()).map((cause) => ({ ...cause, status: 401 })),
      { name: "the right password", email: ADMIN, password: GOOD, status: 200 },
    ];
    const work = new Map<string, string[]>();
    try {
      for (const attempt of attempts) {
        const done = await workOf(attempt.email, attempt.password);
        expect(done.answer.status, attempt.name).toBe(attempt.status);
        work.set(attempt.name, done.work);
      }
    } finally {
      // The planted operator credential goes before anything is asserted, so a red names its own
      // cause rather than the afterEach invariant too.
      await removePlantedCredential();
    }
    const of = (name: string) => work.get(name) ?? [];

    for (const [name, done] of work) {
      expect(
        done.filter((step) => step.includes("scrypt")),
        `${name}: ${done.join(", ")}`,
      ).toEqual(["scrypt"]);
    }
    // A wrong password: the per-IP charge, the delay, PW1-F6's first read, the operator guard's
    // read, Better Auth's user and credential reads, the scrypt, PW1-F6's second read.
    const wrong = of("a wrong password");
    expect(wrong, wrong.join(", ")).toEqual([
      "perIp.check",
      "delay.remainingMs",
      "delay.increment",
      "select:auth_account+auth_user",
      "select:auth_user+super_admins",
      "select:auth_user",
      "select:auth_account",
      "scrypt",
      "select:auth_account+auth_user",
    ]);
    const named = (name: string) => expect(of(name), `${name}: ${of(name).join(", ")}`);
    named("an admin with no password yet").toEqual(wrong);
    named("an unknown address").toEqual(wrong.filter((step) => step !== "select:auth_account"));
    named("the operator, even holding a credential").toEqual(wrong);
    // A success: the same up to its scrypt; then its session, the second read, the delay
    // cleared, and Better Auth's first-session stamp, which it queues to the end.
    named("the right password").toEqual([
      ...wrong.slice(0, wrong.indexOf("scrypt") + 1),
      "insert:auth_session",
      "select:auth_account+auth_user",
      "delay.remove",
      "update:invitation_created_users",
    ]);
  });
});

describe("«Змінити пароль» (scope item 7)", () => {
  it("requires the current password, applies the policy, ends the other sessions, keeps this one and sends the notice", async () => {
    await adminWithPassword();
    const here = sessionCookieOf((await signInWithPassword(ADMIN, GOOD)).response);
    const elsewhere = sessionCookieOf((await signInWithPassword(ADMIN, GOOD)).response);
    const change = (body: Record<string, unknown>) =>
      route(post("/api/auth/change-password", body, { cookie: here }));

    const wrong = await change({ currentPassword: "не-той-пароль-зовсім", newPassword: NEWER });
    expect(wrong.status).toBe(400);
    expect(codeOf(wrong.text)).toBe("INVALID_PASSWORD");
    const weak = await change({ currentPassword: GOOD, newPassword: "1234567890" });
    expect(codeOf(weak.text)).toBe("PASSWORD_COMMON");
    expect(mail.sent).toEqual([]);

    // Asks to keep the other sessions: they end anyway (scope item 7). Also PW1-F5's tripwire: the
    // password write itself ends every session, this one's too, so this device stays signed in
    // only through the new session Better Auth creates after it (`revokeOtherSessions`, forced on
    // in `beforeChange`). A Better Auth that kept the caller's row instead fails here.
    const done = await change({
      currentPassword: GOOD,
      newPassword: NEWER,
      revokeOtherSessions: false,
    });
    expect(done.status).toBe(200);
    expect(done.text).toBe('{"status":true}');
    const renewed = sessionCookieOf(done.response);
    expect(await signedInUser(renewed)).toBe(ADMIN);
    expect(await signedInUser(elsewhere)).toBeNull();
    expect(mail.sent).toEqual([{ kind: "changed", email: ADMIN }]);
    expect((await signInWithPassword(ADMIN, GOOD)).status).toBe(401);
    expect((await signInWithPassword(ADMIN, NEWER)).status).toBe(200);
  });

  it("an admin who has never set a password is told so", async () => {
    await shelterAdmin(NO_PASSWORD_ADMIN);
    const cookie = await signInByLink(NO_PASSWORD_ADMIN);
    const answer = await route(
      post("/api/auth/change-password", { currentPassword: GOOD, newPassword: NEWER }, { cookie }),
    );
    expect(answer.status).toBe(400);
    expect(codeOf(answer.text)).toBe("CREDENTIAL_ACCOUNT_NOT_FOUND");
  });
});

/**
 * PW1-F1: a new password voids the user's other reset links. Oleksii, PW1-Q6, verbatim: "PW1-Q6:
 * (a). Delete the user's other unused reset links on any successful reset or change, in the same
 * transaction. Do it in PW-1 if it's a few lines; otherwise as the first follow-up." Not in the
 * same transaction: his PW1-F1 answer chose option (ii) instead, a second statement right after
 * Better Auth's write. PW1-F1, verbatim excerpt: "… (ii), a delete in our hook. A failure is
 * logged at error level, masked. The links die within the hour anyway. … Either way: a test
 * against real Better Auth pins the storage format it matches, so a Better Auth upgrade that
 * changes it fails loudly."
 */
describe("PW1-F1: a new password voids the user's other reset links", () => {
  const OTHER_ADMIN = "marta@example.org";
  const THIRD = "кава-з-корицею-о-сьомій";
  const NEVER_ISSUED = "never-issued-token-0123456";

  /** Better Auth's own answer to a token it never issued: what a voided link must get, exactly. */
  const unknownTokenAnswer = async () => {
    const answer = await reset(NEVER_ISSUED, THIRD);
    expect(answer.status).toBe(400);
    return answer.text;
  };

  /** How many verification rows hold this user's id: a count, so no failure prints a row. */
  const rowsOf = async (userId: string) =>
    (await db.select().from(authVerification)).filter((row) => row.value === userId).length;

  it("pins the storage format the delete matches, against Better Auth itself", async () => {
    const admin = await shelterAdmin(ADMIN);
    const { token } = await forgot(ADMIN);
    if (token === null) throw new Error("no link");
    await requestLink(ADMIN);
    const rows = await db.select().from(authVerification);
    expect(rows).toHaveLength(2);
    // The reset link: its identifier SHA-256 (base64url, 43 characters) of
    // `reset-password:<token>`, its value the user's id. A Better Auth that stores either
    // differently fails here, before the delete quietly stops matching. Booleans, so a failure
    // never prints an identifier (stored plain, it would be the link itself).
    const hashedShape = /^[A-Za-z0-9_-]{43}$/;
    const resetRow = rows.find((row) => row.value === admin.id);
    expect(resetRow !== undefined, "a reset row whose value is the user's id").toBe(true);
    expect(
      resetRow?.identifier ===
        createHash("sha256").update(`reset-password:${token}`).digest("base64url"),
      "the reset row's identifier is SHA-256 (base64url) of reset-password:<token>",
    ).toBe(true);
    expect(hashedShape.test(resetRow?.identifier ?? ""), "43 characters of base64url").toBe(true);
    // The magic link: hashed the same way, but its value is JSON naming the address.
    const linkRow = rows.find((row) => row !== resetRow);
    expect(hashedShape.test(linkRow?.identifier ?? ""), "the magic link's identifier").toBe(true);
    expect(JSON.parse(linkRow?.value ?? "null")).toEqual({ email: ADMIN });
  });

  it("a reset: her other link is refused as an unknown token is; her sign-in link and another admin's reset link still work", async () => {
    const admin = await shelterAdmin(ADMIN);
    await shelterAdmin(OTHER_ADMIN, "Притулок «Берег»");
    const first = await forgot(ADMIN);
    const second = await forgot(ADMIN);
    const others = await forgot(OTHER_ADMIN);
    const signInLink = await requestLink(ADMIN);
    if (first.token === null || second.token === null || others.token === null) {
      throw new Error("no link");
    }
    expect(await rowsOf(admin.id)).toBe(2);
    const unknown = await unknownTokenAnswer();

    expect((await reset(first.token, GOOD)).status).toBe(200);
    expect(await rowsOf(admin.id)).toBe(0);
    const refused = await reset(second.token, NEWER);
    expect(refused.status).toBe(400);
    expect(refused.text).toBe(unknown);
    expect(codeOf(refused.text)).toBe("INVALID_TOKEN");
    // The password the first link set stands.
    expect((await signInWithPassword(ADMIN, GOOD)).status).toBe(200);
    expect((await signInWithPassword(ADMIN, NEWER)).status).toBe(401);

    // Untouched: her magic link, and another user's reset link.
    expect(await signedInUser(await confirmLink(signInLink))).toBe(ADMIN);
    expect((await reset(others.token, THIRD)).status).toBe(200);
    expect(loggedErrors).toEqual([]);
  });

  it("a change: a link asked for before it is refused after it; her sign-in link and another admin's reset link still work", async () => {
    const admin = await adminWithPassword();
    await shelterAdmin(OTHER_ADMIN, "Притулок «Берег»");
    const others = await forgot(OTHER_ADMIN);
    const cookie = sessionCookieOf((await signInWithPassword(ADMIN, GOOD)).response);
    const earlier = await forgot(ADMIN);
    const signInLink = await requestLink(ADMIN);
    if (earlier.token === null || others.token === null) throw new Error("no link");
    expect(await rowsOf(admin.id)).toBe(1);
    const unknown = await unknownTokenAnswer();

    const changed = await route(
      post("/api/auth/change-password", { currentPassword: GOOD, newPassword: NEWER }, { cookie }),
    );
    expect(changed.status).toBe(200);
    expect(await rowsOf(admin.id)).toBe(0);
    const refused = await reset(earlier.token, THIRD);
    expect(refused.status).toBe(400);
    expect(refused.text).toBe(unknown);
    expect((await signInWithPassword(ADMIN, NEWER)).status).toBe(200);

    expect(await signedInUser(await confirmLink(signInLink))).toBe(ADMIN);
    expect((await reset(others.token, THIRD)).status).toBe(200);
    expect(loggedErrors).toEqual([]);
  });

  /**
   * `db`, except that once a password is written (a credential inserted or updated), a delete
   * from `auth_verification` is `deleteAfterWrite()` instead. Better Auth's own deletes (the
   * token's consume, its expiry sweep) all come before the write, so the delete replaced is ours.
   */
  function afterPasswordWrite(deleteAfterWrite: () => unknown): typeof db {
    let written = false;
    return new Proxy(db, {
      get(object, property) {
        const value = Reflect.get(object, property, object);
        if (typeof value !== "function") return value;
        return (...args: unknown[]) => {
          if ((property === "insert" || property === "update") && args[0] === authAccount) {
            written = true;
          }
          if (property === "delete" && args[0] === authVerification && written) {
            return deleteAfterWrite();
          }
          return value.apply(object, args);
        };
      },
    });
  }

  /**
   * Our delete fails, as a dropped connection would. The error carries the address, the user id
   * and a token, as a query error's message carries its parameters, so a log line that printed
   * it would be caught.
   */
  const failingAfterPasswordWrite = (secrets: string[], code?: string) =>
    afterPasswordWrite(() => {
      throw Object.assign(new Error(`delete failed: params ${secrets.join(", ")}`), {
        cause: { code, message: `connection lost (${secrets.join(", ")})` },
      });
    });

  /** Our delete is sent and never answers, as a stalled fetch wouldn't; `onStall` once it is sent. */
  const stallingAfterPasswordWrite = (onStall: () => void) =>
    afterPasswordWrite(() => ({
      where: () => {
        onStall();
        return new Promise<never>(() => {});
      },
    }));

  const RESET_FAILED_LINE =
    "[kabinet] voiding the other reset links after a reset failed; they lapse within the hour";

  /** Every console line while `work` runs, so Better Auth's own logger is checked too. */
  async function consoleDuring(work: () => Promise<void>): Promise<string[]> {
    const lines: string[] = [];
    const spies = (["log", "info", "warn", "error"] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        lines.push(args.map(String).join(" "));
      }),
    );
    try {
      await work();
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
    return lines;
  }

  it("a delete that fails never fails the reset: the sessions still end, the notice goes, and one masked line is logged at error level", async () => {
    const admin = await shelterAdmin(ADMIN);
    const phone = await signInByLink(ADMIN);
    const first = await forgot(ADMIN);
    const second = await forgot(ADMIN);
    if (first.token === null || second.token === null) throw new Error("no link");
    build({ db: failingAfterPasswordWrite([ADMIN, admin.id, second.token]) });

    const consoleLines = await consoleDuring(async () => {
      const done = await reset(first.token ?? "", GOOD);
      expect(done.status).toBe(200);
      expect(done.text).toBe('{"status":true}');
    });
    // Better Auth went on past `onPasswordReset`: every session ended (scope item 6).
    expect(await signedInUser(phone)).toBeNull();
    expect(await db.select().from(authSession)).toEqual([]);
    expect(mail.sent.map((m) => m.kind)).toEqual(["reset", "reset", "changed"]);
    expect(loggedErrors).toEqual([RESET_FAILED_LINE]);
    expect(logged).toEqual([]);
    // The failure is honest: the other link is still there, for its hour.
    expect(await rowsOf(admin.id)).toBe(1);
    const everything = [...loggedErrors, ...logged, ...consoleLines].join("\n");
    for (const secret of [ADMIN, "olena", admin.id, first.token, second.token]) {
      // A boolean, so a failure never prints the token it found.
      expect(everything.includes(secret), "a log line names the user or a link").toBe(false);
    }
  });

  it("a delete that fails never fails the change: the new session works, and the line carries only the SQLSTATE", async () => {
    const admin = await adminWithPassword();
    const cookie = sessionCookieOf((await signInWithPassword(ADMIN, GOOD)).response);
    const earlier = await forgot(ADMIN);
    if (earlier.token === null) throw new Error("no link");
    build({ db: failingAfterPasswordWrite([ADMIN, admin.id, earlier.token], "57P01") });

    let renewed = "";
    const consoleLines = await consoleDuring(async () => {
      const changed = await route(
        post(
          "/api/auth/change-password",
          { currentPassword: GOOD, newPassword: NEWER },
          { cookie },
        ),
      );
      expect(changed.status).toBe(200);
      renewed = sessionCookieOf(changed.response);
    });
    expect(await signedInUser(renewed)).toBe(ADMIN);
    // Kinds only: a failure message must never print a reset link (a credential).
    expect(mail.sent.map((m) => m.kind)).toEqual(["reset", "changed"]);
    expect(loggedErrors).toEqual([
      "[kabinet] voiding the other reset links after a change failed (57P01); they lapse within the hour",
    ]);
    expect(logged).toEqual([]);
    expect(await rowsOf(admin.id)).toBe(1);
    const everything = [...loggedErrors, ...logged, ...consoleLines].join("\n");
    for (const secret of [ADMIN, "olena", admin.id, earlier.token]) {
      // A boolean, so a failure never prints the token it found.
      expect(everything.includes(secret), "a log line names the user or a link").toBe(false);
    }
  });

  /**
   * D2: the delete is done before the answer, not after it. A `schedule` that holds work back
   * (as `after()` does in production) leaves the notices waiting; the links must be gone anyway.
   */
  it("the delete is done by the time the change or the reset answers: none of it waits for after the response", async () => {
    const admin = await adminWithPassword();
    const cookie = sessionCookieOf((await signInWithPassword(ADMIN, GOOD)).response);
    const earlier = await forgot(ADMIN);
    if (earlier.token === null) throw new Error("no link");
    expect(await rowsOf(admin.id)).toBe(1);
    const held: (() => Promise<void>)[] = [];
    const hold = (work: () => Promise<void>) => {
      held.push(work);
    };

    build({ schedule: hold });
    const changed = await route(
      post("/api/auth/change-password", { currentPassword: GOOD, newPassword: NEWER }, { cookie }),
    );
    expect(changed.status).toBe(200);
    expect(await rowsOf(admin.id), "links left when the change answered").toBe(0);
    expect(held.length, "the change's notice is held back").toBe(1);
    for (const work of held.splice(0)) await work();

    // Links are asked for with scheduled work run at once: «Забули пароль?» makes its token there.
    build();
    const first = await forgot(ADMIN);
    await forgot(ADMIN);
    if (first.token === null) throw new Error("no link");
    expect(await rowsOf(admin.id)).toBe(2);
    build({ schedule: hold });
    expect((await reset(first.token, THIRD)).status).toBe(200);
    expect(await rowsOf(admin.id), "links left when the reset answered").toBe(0);
    expect(held.length, "the reset's notice is held back").toBe(1);
    for (const work of held.splice(0)) await work();
    expect(loggedErrors).toEqual([]);
  });

  /**
   * On a reset the delete sits between Better Auth's password write and its session revoke, so a
   * delete that never answers must not hold the revoke for long. Only `setTimeout` is faked: the
   * database and the clock stay real, and nothing waits on the wall clock.
   */
  it("a delete that never answers holds the reset 1 000 ms at most: then the sessions end, one masked line is logged, and it answers 200", async () => {
    const admin = await shelterAdmin(ADMIN);
    const phone = await signInByLink(ADMIN);
    const first = await forgot(ADMIN);
    await forgot(ADMIN);
    if (first.token === null) throw new Error("no link");
    let stalled = (): void => {};
    const deleteSent = new Promise<void>((resolve) => {
      stalled = resolve;
    });
    build({ db: stallingAfterPasswordWrite(() => stalled()) });

    let answered = false;
    let done: { status: number; text: string } | undefined;
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const answer = reset(first.token, GOOD).then((response) => {
        answered = true;
        return response;
      });
      await deleteSent;
      await vi.advanceTimersByTimeAsync(999);
      expect(answered, "still held at 999 ms: the stalled delete is what holds it").toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      vi.useRealTimers();
      done = await answer;
    } finally {
      vi.useRealTimers();
    }
    expect(done?.status).toBe(200);
    expect(done?.text).toBe('{"status":true}');
    expect(await signedInUser(phone)).toBeNull();
    expect(await db.select().from(authSession)).toEqual([]);
    expect(loggedErrors).toEqual([RESET_FAILED_LINE]);
    expect(await rowsOf(admin.id)).toBe(1);
  });

  it("with the production loggers, the line goes to console.error and never to console.warn", async () => {
    const admin = await shelterAdmin(ADMIN);
    const first = await forgot(ADMIN);
    await forgot(ADMIN);
    if (first.token === null) throw new Error("no link");
    build({ db: failingAfterPasswordWrite([ADMIN, admin.id]), productionLogs: true });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
    const ours = (spy: typeof errors) =>
      spy.mock.calls
        .map((args) => args.map(String).join(" "))
        .filter((line) => line.startsWith("[kabinet]"));
    try {
      expect((await reset(first.token, GOOD)).status).toBe(200);
      expect(ours(errors)).toEqual([RESET_FAILED_LINE]);
      expect(ours(warnings)).toEqual([]);
    } finally {
      errors.mockRestore();
      warnings.mockRestore();
    }
    expect(loggedErrors).toEqual([]);
  });
});

/**
 * PW1-F5: writing the password ends the user's sessions in the write's own statement (migration
 * 0013's triggers), so Better Auth's revoke after it is a second line, not the only one. His
 * PW1-F1 answer, verbatim excerpt: "If it's revoking sessions on reset: (i), the trigger, Tier 1,
 * as an additive migration with a real-Neon check. A failed revoke would leave a session alive for
 * up to 90 days, which is worth atomicity." Here Better Auth's own revoke is made to fail or to do
 * nothing, and the sessions must end anyway.
 */
describe("PW1-F5: the password write itself ends the sessions", () => {
  /**
   * `db`, except that once a password is written (a credential inserted or updated), a delete from
   * `auth_session` is `instead()`. Every such delete after the write is Better Auth's revoke: the
   * lapsed-session delete in `hooks.before` runs before the handler, so before any write.
   */
  function sessionDeleteAfterPasswordWrite(instead: "throws" | "does nothing") {
    const seen = { replaced: 0 };
    let written = false;
    const proxied = new Proxy(db, {
      get(object, property) {
        const value = Reflect.get(object, property, object);
        if (typeof value !== "function") return value;
        return (...args: unknown[]) => {
          if ((property === "insert" || property === "update") && args[0] === authAccount) {
            written = true;
          }
          if (property === "delete" && args[0] === authSession && written) {
            seen.replaced += 1;
            if (instead === "throws") throw new Error("connection lost");
            // A delete that matched nothing, as a Better Auth that stopped revoking would send.
            return { where: async () => [] };
          }
          return value.apply(object, args);
        };
      },
    });
    return { db: proxied, seen };
  }

  /** How many sessions this user has: a count, so no failure prints a token. */
  const sessionsOf = async (userId: string) =>
    (await db.select().from(authSession)).filter((row) => row.userId === userId).length;

  /** `work`, with Better Auth's own error log for the failure it is handed kept off the console. */
  async function quietly<T>(work: () => Promise<T>): Promise<T> {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      return await work();
    } finally {
      spy.mockRestore();
    }
  }

  it("a reset over an existing password: Better Auth's delete fails, and both devices are signed out anyway", async () => {
    const admin = await adminWithPassword();
    const phone = sessionCookieOf((await signInWithPassword(ADMIN, GOOD)).response);
    const laptop = sessionCookieOf((await signInWithPassword(ADMIN, GOOD)).response);
    const { token } = await forgot(ADMIN);
    if (token === null) throw new Error("no link");
    const failing = sessionDeleteAfterPasswordWrite("throws");
    build({ db: failing.db });

    const done = await quietly(() => reset(token, NEWER));
    expect(failing.seen.replaced, "Better Auth's own revoke ran, and failed").toBe(1);
    expect(done.status).toBe(500);
    build();
    expect(await signedInUser(phone), "the phone is still signed in").toBeNull();
    expect(await signedInUser(laptop), "the laptop is still signed in").toBeNull();
    expect(await sessionsOf(admin.id)).toBe(0);
    // The write the revoke rode on stands: the new password signs in, the old one doesn't.
    expect((await signInWithPassword(ADMIN, GOOD)).status).toBe(401);
    expect((await signInWithPassword(ADMIN, NEWER)).status).toBe(200);
  });

  it("a first password (Better Auth creates the credential): Better Auth's delete fails, and both devices are signed out anyway", async () => {
    const admin = await shelterAdmin(ADMIN);
    const phone = await signInByLink(ADMIN);
    const laptop = await signInByLink(ADMIN);
    const { token } = await forgot(ADMIN);
    if (token === null) throw new Error("no link");
    expect(await credentialRows(), "no credential yet: the reset creates one").toEqual([]);
    const failing = sessionDeleteAfterPasswordWrite("throws");
    build({ db: failing.db });

    const done = await quietly(() => reset(token, GOOD));
    expect(failing.seen.replaced, "Better Auth's own revoke ran, and failed").toBe(1);
    expect(done.status).toBe(500);
    build();
    expect(await signedInUser(phone), "the phone is still signed in").toBeNull();
    expect(await signedInUser(laptop), "the laptop is still signed in").toBeNull();
    expect(await sessionsOf(admin.id)).toBe(0);
    expect((await credentialRows()).map((row) => row.userId)).toEqual([admin.id]);
    expect((await signInWithPassword(ADMIN, GOOD)).status).toBe(200);
  });

  it("a change with Better Auth's delete doing nothing: the other device is signed out, this one keeps its new session", async () => {
    const admin = await adminWithPassword();
    const here = sessionCookieOf((await signInWithPassword(ADMIN, GOOD)).response);
    const elsewhere = sessionCookieOf((await signInWithPassword(ADMIN, GOOD)).response);
    const idle = sessionDeleteAfterPasswordWrite("does nothing");
    build({ db: idle.db });

    const done = await route(
      post(
        "/api/auth/change-password",
        { currentPassword: GOOD, newPassword: NEWER },
        { cookie: here },
      ),
    );
    expect(idle.seen.replaced, "Better Auth's own revoke ran, and deleted nothing").toBe(1);
    expect(done.status).toBe(200);
    const renewed = sessionCookieOf(done.response);
    build();
    expect(await signedInUser(elsewhere), "the other device is still signed in").toBeNull();
    expect(await signedInUser(renewed)).toBe(ADMIN);
    // This device's old session went with the rest; the one Better Auth created after the
    // write is the only one left.
    expect(await signedInUser(here)).toBeNull();
    expect(await sessionsOf(admin.id)).toBe(1);
  });

  it("a change with Better Auth's delete failing fails closed: every session ends, this one too, and the new password stands", async () => {
    const admin = await adminWithPassword();
    const here = sessionCookieOf((await signInWithPassword(ADMIN, GOOD)).response);
    const elsewhere = sessionCookieOf((await signInWithPassword(ADMIN, GOOD)).response);
    const failing = sessionDeleteAfterPasswordWrite("throws");
    build({ db: failing.db });

    const done = await quietly(() =>
      route(
        post(
          "/api/auth/change-password",
          { currentPassword: GOOD, newPassword: NEWER },
          { cookie: here },
        ),
      ),
    );
    expect(failing.seen.replaced, "Better Auth's own revoke ran, and failed").toBe(1);
    expect(done.status).toBe(500);
    build();
    expect(await signedInUser(elsewhere), "the other device is still signed in").toBeNull();
    // Better Auth never got as far as this device's new session: it signs in again.
    expect(await signedInUser(here)).toBeNull();
    expect(await sessionsOf(admin.id)).toBe(0);
    expect((await signInWithPassword(ADMIN, GOOD)).status).toBe(401);
    expect((await signInWithPassword(ADMIN, NEWER)).status).toBe(200);
  });

  /**
   * The revoke and the write are one transaction: a trigger of the test's own, firing after ours
   * on the same UPDATE, raises only once our DELETE has already run (no session of the user left),
   * and the whole statement rolls back. The sessions are back and the password is the old one:
   * neither of which could be true together if our DELETE were not inside the write's statement,
   * or ran after this trigger (it would see the sessions, not raise, and the write would stand).
   */
  it("a write that fails after the revoke takes the revoke with it: the sessions stay, and so does the old password", async () => {
    const admin = await adminWithPassword();
    const here = sessionCookieOf((await signInWithPassword(ADMIN, GOOD)).response);
    const elsewhere = sessionCookieOf((await signInWithPassword(ADMIN, GOOD)).response);
    await db.execute(`
      CREATE OR REPLACE FUNCTION pw1f5_test_raise_once_revoked() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM public.auth_session WHERE user_id = NEW.user_id) THEN
          RAISE EXCEPTION 'raised after the revoke';
        END IF;
        RETURN NULL;
      END
      $$`);
    // Same event, same table: Postgres fires triggers in name order, so «zz_» comes after ours.
    await db.execute(`
      CREATE TRIGGER zz_pw1f5_test_raise_once_revoked
      AFTER UPDATE OF password ON public.auth_account
      FOR EACH ROW EXECUTE FUNCTION pw1f5_test_raise_once_revoked()`);
    let done: { status: number };
    try {
      done = await quietly(() =>
        route(
          post(
            "/api/auth/change-password",
            { currentPassword: GOOD, newPassword: NEWER },
            { cookie: here },
          ),
        ),
      );
    } finally {
      await db.execute("DROP TRIGGER IF EXISTS zz_pw1f5_test_raise_once_revoked ON auth_account");
      await db.execute("DROP FUNCTION IF EXISTS pw1f5_test_raise_once_revoked()");
    }
    expect(done.status).toBe(500);
    expect(await sessionsOf(admin.id), "both sessions, back with the rolled-back write").toBe(2);
    expect(await signedInUser(here)).toBe(ADMIN);
    expect(await signedInUser(elsewhere)).toBe(ADMIN);
    expect((await signInWithPassword(ADMIN, NEWER)).status, "the new password").toBe(401);
    expect((await signInWithPassword(ADMIN, GOOD)).status, "the old password").toBe(200);
  });

  it("signing in again writes no password: the first password session and a link session stay", async () => {
    await adminWithPassword();
    const first = sessionCookieOf((await signInWithPassword(ADMIN, GOOD)).response);
    const second = sessionCookieOf((await signInWithPassword(ADMIN, GOOD)).response);
    const byLink = await signInByLink(ADMIN);
    expect(await signedInUser(first), "the first password session").toBe(ADMIN);
    expect(await signedInUser(second), "the second password session").toBe(ADMIN);
    expect(await signedInUser(byLink), "the link session").toBe(ADMIN);
  });
});

/**
 * PW1-F6: a password sign-in that read the old hash before a reset or a change wrote the new one
 * keeps no session (`sign-in-race.ts`). Oleksii, 2026-10-20, verbatim excerpt: "Tests: a
 * deterministic interleaving (sign-in reads the old hash → reset writes and revokes → sign-in
 * inserts its session), where no session survives and the answer is the generic failure; the
 * same with a change; a normal sign-in is unaffected; a mutation that removes the check makes the
 * interleaving test fail."
 *
 * The interleaving is forced by order, never by timing: the sign-in runs on a second Better Auth
 * instance over the same database, stepped (`steppedDatabase`), which holds its session insert
 * unsent until the reset or the change, on the first instance, has written the password and
 * revoked. By the insert Better Auth has read the hash and checked the password, with no
 * statement in between (`dist/api/routes/sign-in.mjs`), and each trace below shows it.
 */
describe("PW1-F6: a sign-in racing a password write keeps no session", () => {
  const THIRD = "кава-з-корицею-о-сьомій";
  const WRONG = "зовсім-не-той-пароль";
  const MARTA = "marta@example.org";
  /** PW1-F6's read, before and after the sign-in (`authPasswordWriteRepo`): the only such join. */
  const OUR_READ = "select:auth_account+auth_user";
  const SESSION_INSERT = "insert:auth_session";
  /** What a password sign-in runs up to its insert: our first read, the operator guard, Better Auth's two reads. */
  const UP_TO_THE_INSERT = [
    OUR_READ,
    "select:auth_user+super_admins",
    "select:auth_user",
    "select:auth_account",
    SESSION_INSERT,
  ];
  const RACE_LINE = "[kabinet] password sign-in refused: the password was written while it ran";

  const isSessionInsert = (statement: SteppedStatement) =>
    statementName(statement) === SESSION_INSERT;

  /** A second auth over the same database, its statements stepped, sharing the delay store. */
  function racing(options: Parameters<typeof steppedDatabase>[1] = {}) {
    const stepped = steppedDatabase(db, options);
    const instance = authWith({ db: stepped.db, password: { signInDelay: delayStore } });
    /** The tokens of the sessions it inserted: in no response, if the check works. */
    const tokens = () =>
      stepped.trace
        .filter(isSessionInsert)
        .map((statement) => (statement.values as { token?: unknown }).token)
        .filter((token): token is string => typeof token === "string");
    return { auth: instance, trace: stepped.trace, hold: stepped.hold, tokens };
  }

  /** The signed cookie a browser would hold for `token` (better-call: HMAC-SHA256, base64). */
  const cookieFor = (token: string) =>
    `kabinet.session_token=${encodeURIComponent(
      `${token}.${createHmac("sha256", SECRET).update(token).digest("base64")}`,
    )}`;

  /** How many sessions this user has: a count, so no failure prints a token. */
  const sessionsOf = async (userId: string) =>
    (await db.select().from(authSession)).filter((row) => row.userId === userId).length;

  /** An answer whole: status, body and every header, to compare two of them. */
  const whole = (answer: { status: number; text: string; response: Response }) => ({
    status: answer.status,
    text: answer.text,
    headers: [...answer.response.headers],
  });

  const signInVia = (via: KabinetAuth, password: string, email = ADMIN) =>
    route(post("/api/auth/sign-in/email", { email, password }), via);

  /**
   * His words, verbatim excerpt: "First, verify whether Better Auth stamps the credential's
   * updatedAt on every password write (reset, change, set). … Don't depend on Better Auth's
   * behaviour without a test that pins it." Only `Date` is faked, so each write's stamp can be
   * held to that write's own moment; the hash must be new every time too, the same password
   * written again included (a fresh salt), since the check compares both.
   */
  it("pins Better Auth: every password write (a first reset, a reset over it, the same password again, a change, a set) stamps updated_at with its own moment and writes a new hash", async () => {
    const admin = await shelterAdmin(ADMIN);
    const other = await shelterAdmin(MARTA, "Притулок «Берег»");
    const start = Date.now() + 60 * 60_000;
    const moment = (step: number) => new Date(start + step * 60_000);
    const credentialOf = async (userId: string) => {
      const rows = (await credentialRows()).filter((row) => row.userId === userId);
      expect(rows, "one credential").toHaveLength(1);
      return { updatedAt: rows[0]?.updatedAt.getTime(), hash: rows[0]?.password ?? "" };
    };
    const resetAt = async (step: number, password: string) => {
      vi.setSystemTime(moment(step));
      const { token } = await forgot(ADMIN);
      if (token === null) throw new Error("no link");
      expect((await reset(token, password)).status).toBe(200);
      return credentialOf(admin.id);
    };

    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const first = await resetAt(1, GOOD); // Better Auth's `createAccount`
      const over = await resetAt(2, NEWER); // `updatePassword`
      const same = await resetAt(3, NEWER); // `updatePassword`, the same password
      vi.setSystemTime(moment(4));
      const cookie = sessionCookieOf((await signInWithPassword(ADMIN, NEWER)).response);
      const changed = await route(
        post(
          "/api/auth/change-password",
          { currentPassword: NEWER, newPassword: THIRD },
          { cookie },
        ),
      ); // `updateAccount`
      expect(changed.status).toBe(200);
      const change = await credentialOf(admin.id);
      // The server-only `setPassword` (never called by the kabinet, never forwarded): it creates a
      // credential only for someone who has none (`linkAccount`).
      vi.setSystemTime(moment(5));
      const linkCookie = await signInByLink(MARTA);
      await auth.api.setPassword({
        body: { newPassword: THIRD },
        headers: new Headers({ cookie: linkCookie }),
      });
      const set = await credentialOf(other.id);

      expect(first.updatedAt, "a first reset").toBe(moment(1).getTime());
      expect(over.updatedAt, "a reset over it").toBe(moment(2).getTime());
      expect(same.updatedAt, "the same password again").toBe(moment(3).getTime());
      expect(change.updatedAt, "a change").toBe(moment(4).getTime());
      expect(set.updatedAt, "a set").toBe(moment(5).getTime());
      const hashes = [first.hash, over.hash, same.hash, change.hash];
      expect(new Set(hashes).size, "a new hash on every write").toBe(hashes.length);
      expect(set.hash).not.toBe("");
    } finally {
      vi.useRealTimers();
    }
  });

  it("a reset: the sign-in read the old hash, the reset wrote and revoked, then the sign-in inserted: no session survives, and the answer is a wrong password's", async () => {
    const admin = await adminWithPassword();
    const wrong = whole(await signInWithPassword(ADMIN, WRONG));
    const { token } = await forgot(ADMIN);
    if (token === null) throw new Error("no link");
    const race = racing({ holdWhen: isSessionInsert });

    const signingIn = signInVia(race.auth, GOOD);
    await race.hold.reached;
    expect(race.trace.map(statementName), "held at its insert, the old hash read").toEqual(
      UP_TO_THE_INSERT,
    );
    expect((await reset(token, NEWER)).status).toBe(200);
    expect(await sessionsOf(admin.id), "the reset revoked every session there was").toBe(0);
    race.hold.release();
    const raced = await signingIn;

    // The generic failure, byte for byte: status, body and headers, so no cookie.
    expect(whole(raced)).toEqual(wrong);
    expect(raced.response.headers.getSetCookie()).toEqual([]);
    // It did insert a session, after the revoke; that session, and every other, is gone.
    const [sessionToken = ""] = race.tokens();
    expect(race.tokens()).toHaveLength(1);
    expect(await sessionsOf(admin.id)).toBe(0);
    expect(await signedInUser(cookieFor(sessionToken)), "the raced session works").toBeNull();
    expect(logged).toContain(RACE_LINE);
    // The reset stands.
    expect((await signInWithPassword(ADMIN, GOOD)).status).toBe(401);
    expect((await signInWithPassword(ADMIN, NEWER)).status).toBe(200);
  });

  it("a change: the same, and the device that changed it keeps its renewed session", async () => {
    const admin = await adminWithPassword();
    const here = sessionCookieOf((await signInWithPassword(ADMIN, GOOD)).response);
    const elsewhere = sessionCookieOf((await signInWithPassword(ADMIN, GOOD)).response);
    const wrong = whole(await signInWithPassword(ADMIN, WRONG));
    const race = racing({ holdWhen: isSessionInsert });

    const signingIn = signInVia(race.auth, GOOD);
    await race.hold.reached;
    expect(race.trace.map(statementName), "held at its insert, the old hash read").toEqual(
      UP_TO_THE_INSERT,
    );
    const changed = await route(
      post(
        "/api/auth/change-password",
        { currentPassword: GOOD, newPassword: NEWER },
        { cookie: here },
      ),
    );
    expect(changed.status).toBe(200);
    const renewed = sessionCookieOf(changed.response);
    race.hold.release();
    const raced = await signingIn;

    expect(whole(raced)).toEqual(wrong);
    expect(
      await signedInUser(cookieFor(race.tokens()[0] ?? "")),
      "the raced session works",
    ).toBeNull();
    expect(await signedInUser(elsewhere), "the other device is still signed in").toBeNull();
    expect(await signedInUser(renewed), "the device that changed it").toBe(ADMIN);
    expect(await sessionsOf(admin.id), "the renewed session, and no other").toBe(1);
    expect(logged).toContain(RACE_LINE);
  });

  /**
   * The review's forced case (its blocker): the write's statement has run, PW1-F5's trigger with
   * it, but it has not committed. The sign-in inserts its session after that trigger's delete and
   * commits it, so the trigger never saw it; a plain second read would still see the old row, and
   * answer 200 with that session alive after the commit. The second read must wait for the write
   * and see it. The write is held open on a connection of its own (`holdPasswordWriteUncommitted`);
   * whether the sign-in waits is asked of Postgres (`pg_blocking_pids`), never timed.
   */
  it("forced: a write whose statement ran (its trigger too) but hasn't committed; the sign-in inserts after that delete; its second read waits for the commit, sees the write and refuses: no session survives", async () => {
    const admin = await adminWithPassword();
    const wrong = whole(await signInWithPassword(ADMIN, WRONG));
    const hash = await (await auth.$context).password.hash(NEWER);
    const race = racing();
    const held = await holdPasswordWriteUncommitted(admin.id, hash, new Date(Date.now() + 60_000));
    let signingIn: ReturnType<typeof signInVia> | undefined;
    let waited = false;
    let traceWhileWaiting: string[] = [];
    let sessionsWhileUncommitted = -1;
    try {
      signingIn = signInVia(race.auth, GOOD);
      waited = await held.waitsOnIt(signingIn);
      traceWhileWaiting = race.trace.map(statementName);
      sessionsWhileUncommitted = await held.sessionsOf(admin.id);
    } finally {
      await held.commit();
    }
    if (signingIn === undefined) throw new Error("the sign-in never started");
    const raced = await signingIn;

    // No session survives the write's commit, and the answer is a wrong password's.
    expect(whole(raced)).toEqual(wrong);
    expect(await sessionsOf(admin.id)).toBe(0);
    expect(
      await signedInUser(cookieFor(race.tokens()[0] ?? "")),
      "the raced session works",
    ).toBeNull();
    expect(logged).toContain(RACE_LINE);
    // It waited, and where: at its second read, after its insert (the first read is plain and
    // went straight through), with its session committed and the write's not yet.
    expect(waited, "the sign-in waited on the uncommitted write").toBe(true);
    expect(traceWhileWaiting).toEqual([...UP_TO_THE_INSERT, OUR_READ]);
    expect(
      sessionsWhileUncommitted,
      "the sign-in's session, inserted after the trigger's delete",
    ).toBe(1);
    // The write stands.
    expect((await signInWithPassword(ADMIN, NEWER)).status).toBe(200);
  });

  it("a normal sign-in is unaffected: held the same way, with another user's password written meanwhile, it signs in", async () => {
    const admin = await adminWithPassword();
    await adminWithPassword(MARTA, THIRD);
    const { token } = await forgot(MARTA);
    if (token === null) throw new Error("no link");
    const race = racing({ holdWhen: isSessionInsert });

    const signingIn = signInVia(race.auth, GOOD);
    await race.hold.reached;
    expect((await reset(token, NEWER)).status, "Marta's reset").toBe(200);
    race.hold.release();
    const signedIn = await signingIn;

    expect(signedIn.status).toBe(200);
    expect(signedIn.text).toBe('{"status":true}');
    const cookie = sessionCookieOf(signedIn.response);
    expect(await signedInUser(cookie)).toBe(ADMIN);
    expect(await sessionsOf(admin.id)).toBe(1);
    // The cookie the tests above build for a token is the one Better Auth sets, so a null they
    // read through it means the session is gone, not that the cookie was malformed.
    expect(cookieFor(race.tokens()[0] ?? "")).toBe(cookie);
    expect([...logged, ...loggedErrors].filter((line) => line.includes("refused"))).toEqual([]);
  });

  it("every sign-in makes the same two reads, a success and each failure alike: the first before anything else, the second last of all", async () => {
    await adminWithPassword();
    await shelterAdmin(NO_PASSWORD_ADMIN);
    await operator();
    const attempts = [
      { name: "the right password", email: ADMIN, password: GOOD, status: 200 },
      { name: "a wrong password", email: ADMIN, password: WRONG, status: 401 },
      { name: "an unknown address", email: "nobody@example.org", password: GOOD, status: 401 },
      {
        name: "an admin with no password yet",
        email: NO_PASSWORD_ADMIN,
        password: GOOD,
        status: 401,
      },
      { name: "the operator", email: OPERATOR, password: GOOD, status: 401 },
    ];
    /** What the sign-in itself runs: the operator guard, Better Auth's reads and its insert. */
    const SIGN_IN_STATEMENTS = UP_TO_THE_INSERT.filter((name) => name !== OUR_READ);
    for (const attempt of attempts) {
      const race = racing();
      const answer = await signInVia(race.auth, attempt.password, attempt.email);
      expect(answer.status, attempt.name).toBe(attempt.status);
      const names = race.trace.map(statementName);
      const ours = names.flatMap((name, i) => (name === OUR_READ ? [i] : []));
      const lastOfTheSignIn = Math.max(
        ...SIGN_IN_STATEMENTS.map((name) => names.lastIndexOf(name)),
      );
      const trace = `${attempt.name}: ${names.join(", ")}`;
      expect(ours.length, trace).toBe(2);
      expect(ours[0], trace).toBe(0);
      expect(ours[1] ?? -1, trace).toBeGreaterThan(lastOfTheSignIn);
    }
    // The success's second read comes after its insert: the window the check closes. (Better
    // Auth's own `session.create.after` work, the first-session stamp, is queued to the end.)
    const success = racing();
    await signInVia(success.auth, GOOD);
    expect(success.trace.map(statementName)).toEqual([
      ...UP_TO_THE_INSERT,
      OUR_READ,
      "update:invitation_created_users",
    ]);
  });

  it("a refused sign-in counts as the failure it answers: it never clears the delay", async () => {
    await adminWithPassword();
    for (let i = 0; i < 4; i++) expect((await signInWithPassword(ADMIN, WRONG)).status).toBe(401);
    const { token } = await forgot(ADMIN);
    if (token === null) throw new Error("no link");
    const race = racing({ holdWhen: isSessionInsert });

    const signingIn = signInVia(race.auth, GOOD);
    await race.hold.reached;
    expect((await reset(token, NEWER)).status).toBe(200);
    race.hold.release();
    expect((await signingIn).status).toBe(401);
    // The fifth attempt in the window, as a fifth wrong password would be: the gate is closed,
    // and even the new password waits. A cleared delay would have let it in.
    const next = await signInWithPassword(ADMIN, NEWER);
    expect(next.status).toBe(429);
    expect(JSON.parse(next.text)).toMatchObject({ retryAfterMinutes: 1 });
  });

  it("a write between the first read and Better Auth's: even the new password is refused this once, then signs in", async () => {
    const admin = await adminWithPassword();
    const { token } = await forgot(ADMIN);
    if (token === null) throw new Error("no link");
    const race = racing({
      holdWhen: (statement) => statementName(statement) === "select:auth_user",
    });

    const signingIn = signInVia(race.auth, NEWER);
    await race.hold.reached;
    expect(race.trace.map(statementName), "held before Better Auth reads the user").toEqual([
      OUR_READ,
      "select:auth_user+super_admins",
      "select:auth_user",
    ]);
    expect((await reset(token, NEWER)).status).toBe(200);
    race.hold.release();
    const refused = await signingIn;

    expect(refused.status).toBe(401);
    expect(codeOf(refused.text)).toBe("INVALID_EMAIL_OR_PASSWORD");
    expect(await sessionsOf(admin.id)).toBe(0);
    expect((await signInWithPassword(ADMIN, NEWER)).status).toBe(200);
  });

  it("a session delete that fails still refuses: nothing that left the server carries the token, and one masked line is logged at error level", async () => {
    const admin = await adminWithPassword();
    const wrong = whole(await signInWithPassword(ADMIN, WRONG));
    const { token } = await forgot(ADMIN);
    if (token === null) throw new Error("no link");
    const race = racing({
      holdWhen: isSessionInsert,
      // The only session delete a sign-in runs is the refusal's own.
      failWhen: (statement) =>
        statementName(statement) === "delete:auth_session"
          ? Object.assign(new Error(`delete failed: params ${ADMIN} ${admin.id}`), {
              cause: { code: "57P01" },
            })
          : undefined,
    });

    const signingIn = signInVia(race.auth, GOOD);
    await race.hold.reached;
    expect((await reset(token, NEWER)).status).toBe(200);
    race.hold.release();
    const raced = await signingIn;

    expect(whole(raced)).toEqual(wrong);
    const [sessionToken = ""] = race.tokens();
    expect(sessionToken).not.toBe("");
    // A boolean, so a failure never prints the token.
    expect(
      JSON.stringify(whole(raced)).includes(sessionToken),
      "the answer carries the token",
    ).toBe(false);
    expect(await sessionsOf(admin.id), "the row is left, its token held by nobody").toBe(1);
    expect(loggedErrors).toEqual([
      "[kabinet] a refused password sign-in's session could not be deleted (57P01); its token never left the server",
    ]);
    expect(logged).toContain(RACE_LINE);
    const everything = [...logged, ...loggedErrors].join("\n");
    for (const secret of [ADMIN, "olena", admin.id, sessionToken]) {
      expect(everything.includes(secret), "a log line names the user or the session").toBe(false);
    }
  });

  it("a second read that fails refuses the sign-in: the generic failure, no session, one masked line at error level", async () => {
    const admin = await adminWithPassword();
    const wrong = whole(await signInWithPassword(ADMIN, WRONG));
    let reads = 0;
    const race = racing({
      failWhen: (statement) =>
        statementName(statement) === OUR_READ && ++reads === 2
          ? Object.assign(new Error(`select failed: params ${ADMIN}`), { cause: { code: "08006" } })
          : undefined,
    });

    const answer = await signInVia(race.auth, GOOD);

    expect(whole(answer)).toEqual(wrong);
    expect(race.tokens(), "Better Auth inserted its session").toHaveLength(1);
    expect(await sessionsOf(admin.id)).toBe(0);
    expect(loggedErrors).toEqual([
      "[kabinet] password sign-in refused: the second password read failed (08006)",
    ]);
  });

  it("a first read that fails fails the sign-in before Better Auth reads the user: no session, no cookie", async () => {
    const admin = await adminWithPassword();
    const race = racing({
      failWhen: (statement) =>
        statementName(statement) === OUR_READ
          ? Object.assign(new Error(`select failed: params ${ADMIN}`), { cause: { code: "08006" } })
          : undefined,
    });

    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    let answer: Awaited<ReturnType<typeof signInVia>>;
    try {
      answer = await signInVia(race.auth, GOOD);
    } finally {
      spy.mockRestore();
    }

    expect(answer.status).toBe(500);
    expect(answer.response.headers.getSetCookie()).toEqual([]);
    expect(answer.text.includes(ADMIN), "the answer names the address").toBe(false);
    expect(race.trace.map(statementName)).toEqual([OUR_READ]);
    expect(await sessionsOf(admin.id)).toBe(0);
  });
});

describe("the operator can never have or use a password (§4.6)", () => {
  it("asking for a reset creates no token and sends nothing", async () => {
    await operator();
    const asked = await forgot(OPERATOR);
    expect(asked.answer.text).toBe('{"status":true}');
    expect(await db.select().from(authVerification)).toEqual([]);
    expect(mail.sent).toEqual([]);
  });

  it("a reset token naming the operator is refused, deleted, and creates no credential", async () => {
    const op = await operator();
    const ctx = await auth.$context;
    await ctx.internalAdapter.createVerificationValue({
      identifier: "reset-password:planted-token-0123456789",
      value: op.id,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const refused = await reset("planted-token-0123456789", GOOD);
    expect(refused.status).toBe(400);
    expect(codeOf(refused.text)).toBe("INVALID_TOKEN");
    expect(await credentialRows()).toEqual([]);
    expect(await db.select().from(authVerification)).toEqual([]);
  });

  it("change-password from the operator's session is forbidden", async () => {
    await operator();
    const cookie = await signInByLink(OPERATOR);
    const answer = await route(
      post("/api/auth/change-password", { currentPassword: GOOD, newPassword: NEWER }, { cookie }),
    );
    expect(answer.status).toBe(403);
    expect(await credentialRows()).toEqual([]);
  });

  it("sign-up is refused for everyone: not forwarded, and refused by the hook behind it", async () => {
    const forwarded = await route(
      post("/api/auth/sign-up/email", { email: "new@example.org", password: GOOD, name: "Новий" }),
    );
    expect(forwarded.status).toBe(404);
    const direct = await auth.handler(
      post("/api/auth/sign-up/email", { email: "new@example.org", password: GOOD, name: "Новий" }),
    );
    expect(direct.status).toBe(403);
    expect(await credentialRows()).toEqual([]);
  });

  it("the second lock: Better Auth's own sign-up is off too", () => {
    expect(auth.options.emailAndPassword?.disableSignUp).toBe(true);
  });
});

describe("the limits (§4.3, §9 answers 5 and 7)", () => {
  it("the sign-in delay: five free attempts, then 1, 2, 4, 8, 15, 15 minutes, a success resets it", async () => {
    await adminWithPassword();
    const attempt = () => signInWithPassword(ADMIN, "не-той-пароль-зовсім");
    for (let i = 0; i < 5; i++) expect((await attempt()).status).toBe(401);
    for (const minutes of [1, 2, 4, 8, 15, 15]) {
      const waiting = await attempt();
      expect(waiting.status, `wait of ${minutes}`).toBe(429);
      expect(JSON.parse(waiting.text)).toMatchObject({ retryAfterMinutes: minutes });
      // Not even checked while waiting: the right password waits too.
      expect((await signInWithPassword(ADMIN, GOOD)).status).toBe(429);
      clock = new Date(clock.getTime() + minutes * 60_000);
      expect((await attempt()).status, `after waiting ${minutes}`).toBe(401);
    }
    clock = new Date(clock.getTime() + 15 * 60_000);
    expect((await signInWithPassword(ADMIN, GOOD)).status).toBe(200);
    // Reset: five free attempts again.
    for (let i = 0; i < 5; i++) expect((await attempt()).status).toBe(401);
  });

  it("the delay is the same for an address nobody has: same status, same body", async () => {
    await adminWithPassword();
    const known = [];
    const unknown = [];
    for (let i = 0; i < 6; i++) known.push(await signInWithPassword(ADMIN, "не-той-пароль-зовсім"));
    for (let i = 0; i < 6; i++) unknown.push(await signInWithPassword("nobody@example.org", GOOD));
    expect(known.map((a) => a.status)).toEqual(unknown.map((a) => a.status));
    expect(known[5]?.text).toBe(unknown[5]?.text);
    expect(known[5]?.status).toBe(429);
  });

  it("five failures spread past 15 minutes start no delay", async () => {
    await adminWithPassword();
    for (let i = 0; i < 4; i++) await signInWithPassword(ADMIN, "не-той-пароль-зовсім");
    clock = new Date(clock.getTime() + 15 * 60_000 + 1);
    for (let i = 0; i < 4; i++) {
      expect((await signInWithPassword(ADMIN, "не-той-пароль-зовсім")).status).toBe(401);
    }
  });

  it("a burst of parallel attempts gets no more than the five free ones through", async () => {
    await adminWithPassword();
    const answers = await Promise.all(
      Array.from({ length: 12 }, () => signInWithPassword(ADMIN, "не-той-пароль-зовсім")),
    );
    const statuses = answers.map((a) => a.status);
    expect(statuses.filter((s) => s === 401).length).toBeLessThanOrEqual(5);
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThanOrEqual(7);
  });

  it("fails closed: a delay store that errors refuses the attempt for a minute, and says so in the log", async () => {
    await adminWithPassword();
    const broken: DelayStore = {
      remainingMs: async () => {
        throw new Error("store down");
      },
      increment: async () => 0,
      setIfAbsent: async () => false,
      remove: async () => {},
    };
    build({ password: { signInDelay: broken } });
    const answer = await signInWithPassword(ADMIN, GOOD);
    expect(answer.status).toBe(429);
    expect(JSON.parse(answer.text)).toMatchObject({ retryAfterMinutes: 1 });
    expect(logged.join("\n")).toContain("fail closed");
  });

  it("the kabinet's per-IP budget covers the password sign-in, with no minutes in the answer", async () => {
    build({
      kabinet: {
        perUser: generous(),
        perIp: inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 1 }),
      },
    });
    await signInWithPassword("nobody@example.org", GOOD);
    const refused = await signInWithPassword("nobody@example.org", GOOD);
    expect(refused.status).toBe(429);
    expect(refused.text).not.toContain("retryAfterMinutes");
  });

  it("«Забули пароль?»: 3 an hour per address, any address, and 20 an hour per IP", async () => {
    build({
      password: {
        forgotPerAddress: inMemoryRateLimiter({ windowMs: 3_600_000, maxRequests: 3 }),
        forgotPerIp: inMemoryRateLimiter({ windowMs: 3_600_000, maxRequests: 20 }),
      },
    });
    await shelterAdmin(ADMIN);
    for (const email of [ADMIN, "nobody@example.org"]) {
      const statuses = [];
      for (let i = 0; i < 4; i++) statuses.push((await forgot(email)).answer.status);
      expect(statuses, email).toEqual([200, 200, 200, 429]);
    }
    expect(mail.sent.filter((m) => m.kind === "reset")).toHaveLength(3);
    const statuses = [];
    for (let i = 0; i < 14; i++) statuses.push((await forgot(`n${i}@example.org`)).answer.status);
    // 8 of the IP's 20 were spent above.
    expect(statuses.filter((s) => s === 200)).toHaveLength(12);
    expect(statuses.slice(12)).toEqual([429, 429]);
  });

  it("a reset link's POST: 20 an hour per IP", async () => {
    build({
      password: { resetPerIp: inMemoryRateLimiter({ windowMs: 3_600_000, maxRequests: 1 }) },
    });
    await reset("whatever-token", GOOD);
    expect((await reset("whatever-token", GOOD)).status).toBe(429);
  });
});

describe("sessions by role (F-B9; §9 answers 3 and 6)", () => {
  it("a shelter admin's password session lasts 30 days idle; the operator's link session 7", async () => {
    await adminWithPassword();
    const admin = sessionCookieOf((await signInWithPassword(ADMIN, GOOD)).response);
    await operator();
    const op = await signInByLink(OPERATOR);
    // Both sessions idle for 8 days: past the operator's 7, inside the shelter admin's 30.
    await db.update(authSession).set({
      updatedAt: new Date(Date.now() - 8 * DAY),
      createdAt: new Date(Date.now() - 8 * DAY),
    });
    expect(await signedInUser(admin)).toBe(ADMIN);
    expect(await signedInUser(op)).toBeNull();
  });
});

describe("no password in any response body or log line (§3)", () => {
  it("none of the passwords used above appears in a body, a captured email or the console", async () => {
    const consoleLines: string[] = [];
    const spies = (["log", "info", "warn", "error"] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        consoleLines.push(args.map(String).join(" "));
      }),
    );
    try {
      await adminWithPassword();
      await signInWithPassword(ADMIN, "не-той-пароль-зовсім");
      const cookie = sessionCookieOf((await signInWithPassword(ADMIN, GOOD)).response);
      await route(
        post(
          "/api/auth/change-password",
          { currentPassword: GOOD, newPassword: NEWER },
          { cookie },
        ),
      );
      const { token } = await forgot(ADMIN);
      await reset(token ?? "", "qwertyuiop");
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
    const everything = [...bodies, ...consoleLines, ...logged, JSON.stringify(mail.sent)].join(
      "\n",
    );
    expect(bodies.length).toBeGreaterThan(5);
    for (const password of [GOOD, NEWER, "не-той-пароль-зовсім", "qwertyuiop"]) {
      expect(everything, "a password was echoed").not.toContain(password);
    }
  });
});

/**
 * The session token stays in the HttpOnly cookie (PW1-D11; Decision 1, Oleksii, 2026-10-20,
 * verbatim: "Strip the session token from /api/auth/get-session's response in PW-1"). Every path
 * the route forwards answers here at least once, and none of their bodies carries the token of
 * any session a response created or refreshed.
 */
describe("no session token in any response body (PW1-D11, Decision 1)", () => {
  it("across both sign-ins, get-session, the change, «Забули пароль?», the reset, the magic link and sign-out", async () => {
    const from = bodies.length;
    const tokensFrom = issuedSessionTokens.length;
    await adminWithPassword(); // «Забули пароль?» and the reset
    const byLink = await signInByLink(ADMIN); // the magic link's request and its confirm
    expect(await signedInUser(byLink)).toBe(ADMIN); // get-session
    const signedIn = await signInWithPassword(ADMIN, GOOD);
    const cookie = sessionCookieOf(signedIn.response);
    expect(await signedInUser(cookie)).toBe(ADMIN);
    const changed = await route(
      post("/api/auth/change-password", { currentPassword: GOOD, newPassword: NEWER }, { cookie }),
    );
    expect(changed.status).toBe(200);
    const renewed = sessionCookieOf(changed.response);
    expect(await signedInUser(renewed)).toBe(ADMIN);
    const signedOut = await route(post("/api/auth/sign-out", {}, { cookie: renewed }));
    expect(signedOut.status).toBe(200);

    const tokens = [...new Set(issuedSessionTokens.slice(tokensFrom))];
    // Three sessions: the link's, the password's, and the one the change renewed.
    expect(tokens.length).toBeGreaterThanOrEqual(3);
    const seen = bodies.slice(from);
    expect(seen.length).toBeGreaterThan(8);
    for (const token of tokens) {
      expect(
        seen.filter((body) => body.includes(token)),
        "a response body carries a session token",
      ).toEqual([]);
    }
  });
});

/** Removes the operator credential a test planted, so the afterEach invariant checks the rest. */
async function removePlantedCredential() {
  const ctx = await auth.$context;
  for (const row of await credentialRows()) {
    const grants = await db.select().from(superAdmins);
    if (grants.some((g) => g.userId === row.userId))
      await ctx.internalAdapter.deleteAccount(row.id);
  }
}
