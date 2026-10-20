import { createHash } from "node:crypto";
import { cityRepo, kabinetInvitationRepo, shelterRepo } from "@opika/db/repos";
import {
  authAccount,
  authMember,
  authSession,
  authVerification,
  superAdmins,
} from "@opika/db/schema";
import { makeCity, makeShelter, setupTestDatabase, truncateAll } from "@opika/db/test";
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

function build(
  overrides: {
    password?: Partial<PasswordLimiters>;
    kabinet?: KabinetLimiters;
    db?: typeof db;
    /** In place of running scheduled work at once (and awaiting it in `route`). */
    schedule?: (work: () => Promise<void>) => void;
    /** Leave out `log` and `logError`, so the production defaults (the console) are used. */
    productionLogs?: boolean;
  } = {},
) {
  delayStore = overrides.password?.signInDelay ?? inMemoryDelayStore();
  auth = createKabinetAuth({
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
): Promise<{ status: number; text: string; response: Response }> {
  const response = await handleKabinetAuth(request, {
    availability: available(),
    auth: () => auth,
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
   * Similar timing (§5): every cause runs a password hash (Better Auth hashes a dummy on the
   * unknown and no-credential paths; the operator guard burns one too). Each cause is timed in
   * rounds, interleaved so drift hits all four alike, and its median compared with the wrong
   * password's: a cause that skipped the hash answers in a few milliseconds against a scrypt's
   * tens, far outside the tolerance. Sequential, a handful of hashes: no load is generated.
   */
  it("similar timing: each cause's median is within half of the wrong password's", async () => {
    const list = await causes();
    const rounds = 7;
    const timings = new Map(list.map((c) => [c.name, [] as number[]]));
    for (let round = 0; round < rounds; round++) {
      for (const cause of list) {
        // A fresh delay store per attempt, so the per-address delay never steps in.
        build();
        const started = performance.now();
        await signInWithPassword(cause.email, cause.password);
        timings.get(cause.name)?.push(performance.now() - started);
      }
    }
    const median = (values: number[]) => {
      const sorted = [...values].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)] ?? 0;
    };
    const reference = median(timings.get("a wrong password") ?? []);
    for (const [name, values] of timings) {
      expect(
        Math.abs(median(values) - reference),
        `${name}: median ${median(values).toFixed(1)} ms against ${reference.toFixed(1)} ms`,
      ).toBeLessThan(reference * 0.5);
    }
    await removePlantedCredential();
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
