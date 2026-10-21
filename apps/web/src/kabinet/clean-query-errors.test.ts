import { createHmac, randomUUID } from "node:crypto";
import { inspect } from "node:util";
import type { Database } from "@opika/db";
import {
  adopterRepo,
  animalRepo,
  cityRepo,
  isCheckViolation,
  kabinetAnimalRepo,
  kabinetInvitationAcceptRepo,
  kabinetInvitationRepo,
  type ListingMoveHistory,
  shelterRepo,
  superAdminRepo,
  swipeRepo,
} from "@opika/db/repos";
import {
  authAccount,
  authInvitation,
  authSession,
  authUser,
  authVerification,
  superAdmins,
} from "@opika/db/schema";
import {
  downDatabase,
  failingDriverDatabase,
  makeAdopter,
  makeAnimal,
  makeCity,
  makeDraftAnimal,
  makeShelter,
  makeSwipe,
  neonHttpDatabaseAnswering,
  postgresError,
  setupTestDatabase,
  truncateAll,
} from "@opika/db/test";
import { type AnimalListingState, type ShelterId, transitionListing } from "@opika/domain";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inMemoryRateLimiter } from "../api/rate-limit";
import { createKabinetAuth, type KabinetAuth } from "./auth";
import { CleanedQueryError, cleanedQueryError, withQueryErrorsCleaned } from "./clean-query-errors";
import { capturingSender } from "./magic-link-sender";
import { kabinetPageLoadAllowed } from "./page-limit";
import { generousPasswordLimiters } from "./password-limits";
import { capturingPasswordMail } from "./password-mail";
import { kabinetIdentityOf, kabinetSessionUserIdOf } from "./principal";
import { sqlStateOf } from "./sql-state";

/**
 * PW1-F8, after its review's STOP: a failed query's error is cleaned at the database handle
 * Better Auth is given, and on the kabinet's principal path. Oleksii, 2026-10-20, verbatim:
 * "Q1, F8: (i), clean query errors at the database handle Better Auth is given, plus the review’s
 * three notes. … What the cleaned error keeps: name, SQLSTATE, and the constraint and table names
 * (schema, never user data). It drops the message and the params. Callers keep working: tests show
 * isCheckViolation (23514), the 23503 catch and Better Auth’s unique-violation handling behave
 * exactly as before. Our own callers: principal.ts’s getSession path also goes through the cleaned
 * handle, or gets a masked catch. Add a test with a forced database outage on a /kabinet page load
 * where the logged output contains no token, no address and no params:."
 *
 * Every failure here is forced at the driver (`failingDriverDatabase`, `downDatabase`,
 * `neonHttpDatabaseAnswering`), so the error is drizzle-orm 0.45.2's own, built by Drizzle from
 * the driver's own error class: its message and `params` hold the statement's parameters. By the
 * statement's text, never by timing.
 */

const BASE = "http://localhost:3000";
const SECRET = "test-only-secret-that-is-long-enough-0123456789";
/** Fictional, each distinctive, so a leak names itself. */
const ADDRESS = "olena@example.org";
const TOKEN = "Zq3vN8kLwP2xR7tYb4mC9hJ6sD1fG5aE";
const PASSWORD = "ялинка-під-вікном-1987";

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;
let lines: string[];

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());

beforeEach(async () => {
  await truncateAll(db);
  lines = [];
  const spies = (["error", "warn", "log", "info", "debug", "trace"] as const).map((method) =>
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      lines.push(
        `${method}: ${args.map((arg) => (typeof arg === "string" ? arg : inspect(arg, { depth: 8 }))).join(" ")}`,
      );
    }),
  );
  return () => {
    for (const spy of spies) spy.mockRestore();
  };
});

/** What a promise rejects with (or throws), or a marker when it resolves. */
async function failureOf(work: Promise<unknown> | (() => Promise<unknown>)): Promise<unknown> {
  try {
    await (typeof work === "function" ? work() : work);
    return "resolved";
  } catch (error) {
    return error;
  }
}

/** Everything a log could show of `value`: its whole inspection, the cause chain included. */
const shown = (value: unknown) => inspect(value, { depth: 8, showHidden: true });

/**
 * How many times each forbidden thing appears in `texts`: the address, the token, the password,
 * the address's local part, a Drizzle parameter list (`params:`, any case), Drizzle's message
 * head and each of `more`. A count per item, so a failure prints none of the values.
 */
function leaks(texts: readonly string[], more: readonly string[] = []): number[] {
  const needles = [ADDRESS, TOKEN, PASSWORD, "olena", ...more];
  const counts = needles.map((needle) => texts.filter((text) => text.includes(needle)).length);
  const params = texts.filter((text) => /params:/i.test(text)).length;
  const failedQuery = texts.filter((text) => text.includes("Failed query")).length;
  return [...counts, params, failedQuery];
}
const none = (more = 0) => Array.from({ length: 6 + more }, () => 0);

/** A server error report whose text holds the three values, as a Postgres message can. */
const reportHolding = (code: string) =>
  postgresError({
    message: `invalid input syntax for type uuid: "${ADDRESS} ${TOKEN} ${PASSWORD}"`,
    code,
    severity: "ERROR",
    detail: `Key (email)=(${ADDRESS}) and ${TOKEN}`,
    where: `PL/pgSQL function with ${PASSWORD}`,
  });

describe("the cleaned error: what it keeps, what it drops", () => {
  it("postgres-js: a real unique violation keeps name, SQLSTATE and the schema names, on it and its cause; nothing else", async () => {
    await db.insert(authUser).values(userRow(randomUUID(), ADDRESS));
    const duplicate = () => userRow(randomUUID(), ADDRESS);
    const raw = await failureOf(db.insert(authUser).values(duplicate()));
    // The control: the raw error carries the address (its params and its detail).
    expect(leaks([shown(raw)])[0], "the raw error names the address").toBeGreaterThan(0);

    const error = await failureOf(withQueryErrorsCleaned(db).insert(authUser).values(duplicate()));
    expect(error).toBeInstanceOf(CleanedQueryError);
    expect(leaks([shown(error), String(error)])).toEqual(none());
    expect(factsOf(error)).toEqual({
      name: "Error",
      message: "",
      code: "23505",
      constraint: "auth_user_email_unique",
      constraint_name: "auth_user_email_unique",
      table: "auth_user",
      table_name: "auth_user",
      schema: "public",
      schema_name: "public",
      cause: {
        name: "PostgresError",
        message: "",
        code: "23505",
        constraint: "auth_user_email_unique",
        constraint_name: "auth_user_email_unique",
        table: "auth_user",
        table_name: "auth_user",
        schema: "public",
        schema_name: "public",
      },
    });
    for (const dropped of ["query", "params", "detail", "where", "severity", "routine"]) {
      expect([dropped, Object.hasOwn(error as object, dropped)]).toEqual([dropped, false]);
      expect([dropped, Object.hasOwn((error as Error).cause as object, dropped)]).toEqual([
        dropped,
        false,
      ]);
    }
  });

  it("neon-http: Neon's error report, through its own client, cleaned the same way", async () => {
    const neonDb = neonHttpDatabaseAnswering({
      message: `duplicate key value violates unique constraint "auth_user_email_unique"`,
      code: "23505",
      severity: "ERROR",
      detail: `Key (email)=(${ADDRESS}) already exists.`,
      schema: "public",
      table: "auth_user",
      constraint: "auth_user_email_unique",
    });
    try {
      const raw = await failureOf(neonDb.db.insert(authUser).values(userRow(TOKEN, ADDRESS)));
      expect(leaks([shown(raw)])[0], "the raw error names the address").toBeGreaterThan(0);
      expect((raw as Error).cause?.constructor.name).toBe("NeonDbError");

      const error = await failureOf(
        withQueryErrorsCleaned(neonDb.db).insert(authUser).values(userRow(TOKEN, ADDRESS)),
      );
      expect(neonDb.requests()).toBe(2);
      expect(leaks([shown(error), String(error)])).toEqual(none());
      expect(factsOf(error)).toEqual({
        name: "Error",
        message: "",
        code: "23505",
        constraint: "auth_user_email_unique",
        constraint_name: "auth_user_email_unique",
        table: "auth_user",
        table_name: "auth_user",
        schema: "public",
        schema_name: "public",
        cause: {
          name: "NeonDbError",
          message: "",
          code: "23505",
          constraint: "auth_user_email_unique",
          constraint_name: "auth_user_email_unique",
          table: "auth_user",
          table_name: "auth_user",
          schema: "public",
          schema_name: "public",
        },
      });
    } finally {
      neonDb.restore();
    }
  });

  it("an outage: the connection error is cleaned too (no SQLSTATE to keep), with no parameter", async () => {
    const down = await downDatabase();
    try {
      const raw = await failureOf(down.db.insert(authSession).values(sessionRow()));
      expect(leaks([shown(raw)])[1], "the raw error names the token").toBeGreaterThan(0);
      const error = await failureOf(
        withQueryErrorsCleaned(down.db).insert(authSession).values(sessionRow()),
      );
      expect(leaks([shown(error)])).toEqual(none());
      expect(factsOf(error)).toEqual({
        name: "Error",
        message: "",
        cause: { name: "Error", message: "" },
      });
    } finally {
      await down.end();
    }
  });

  it("every way in is cleaned: the query builder, a relational query, `_.session`; a cleaned handle is itself, one per database", async () => {
    const failing = failingDriverDatabase(db, () => reportHolding("XX000"));
    const clean = withQueryErrorsCleaned(failing);
    expect(withQueryErrorsCleaned(clean)).toBe(clean);
    expect(withQueryErrorsCleaned(failing)).toBe(clean);
    const errors = [
      await failureOf(clean.select().from(authUser)),
      await failureOf(clean.query.authUser.findFirst()),
      await failureOf(clean.update(authUser).set({ name: PASSWORD })),
      await failureOf(clean.delete(authSession)),
      await failureOf(clean.$count(authUser)),
    ];
    expect(errors.map((error) => error instanceof CleanedQueryError)).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
    expect(leaks(errors.map(shown))).toEqual(none());
    expect(errors.map(sqlStateOf)).toEqual(["XX000", "XX000", "XX000", "XX000", "XX000"]);
  });

  it("a value that isn't an error, or a name that isn't a class name, is shown as a plain `Error`", () => {
    expect(factsOf(cleanedQueryError(`${ADDRESS}`))).toEqual({ name: "Error", message: "" });
    const odd = Object.assign(new Error(TOKEN), { name: ADDRESS, code: "olena" });
    expect(factsOf(cleanedQueryError(odd))).toEqual({ name: "Error", message: "" });
  });

  it("F8-F1 (note 4): a name is kept only when it is on the explicit list (his (c))", () => {
    const named = (name: string) => cleanedQueryError(Object.assign(new Error(""), { name })).name;
    // A person's name, in any case or shaped like a class, is not on the list.
    expect(
      ["mykola", "Mykola", "OlenaPetrenkoError", "SomeDriverError", "olena"].map(named),
    ).toEqual(["Error", "Error", "Error", "Error", "Error"]);
    expect(["Error", "PostgresError", "NeonDbError", "TypeError", "APIError"].map(named)).toEqual([
      "Error",
      "PostgresError",
      "NeonDbError",
      "TypeError",
      "APIError",
    ]);
  });
});

describe("our callers read the cleaned error exactly as they read the raw one", () => {
  const AT = new Date("2026-10-20T09:00:00.000Z");
  const ACTOR = {
    kind: "shelter_admin",
    shelterAdminId: "33333333-3333-4333-8333-333333333333",
  } as const;

  /** `scenario`, once over the raw handle and once over the cleaned one, from an empty database. */
  async function bothWays<T>(scenario: (handle: Database) => Promise<T>): Promise<[T, T]> {
    await truncateAll(db);
    const raw = await scenario(db);
    await truncateAll(db);
    const cleaned = await scenario(withQueryErrorsCleaned(db));
    return [raw, cleaned];
  }

  async function place(handle: Database) {
    const city = makeCity();
    await cityRepo(handle).insert(city);
    const shelter = makeShelter({
      publicLocation: { ...makeShelter().publicLocation, cityId: city.id },
    });
    await shelterRepo(handle).insert(shelter);
    return { shelterId: shelter.id, cityId: city.id };
  }

  it("23514: isCheckViolation finds the CHECK's refusal of an incomplete draft's publish", async () => {
    const published = transitionListing({ kind: "draft" }, { type: "publish", at: AT });
    if (published.kind !== "ok") throw new Error("publish refused");
    const outcomes = await bothWays(async (handle) => {
      const { shelterId, cityId } = await place(handle);
      const draft = makeDraftAnimal({
        shelterId,
        photos: [{ storageKey: "animals/x/a", width: 800, height: 1000, blurhash: null } as never],
      });
      await animalRepo(handle).insert(draft, cityId);
      const line: ListingMoveHistory = {
        kind: "recorded",
        row: {
          id: randomUUID(),
          entry: {
            kind: "animal_listing_changed",
            at: AT,
            actor: ACTOR as never,
            animalId: draft.id,
            animalName: draft.name,
            event: { type: "publish" },
            from: "draft",
            to: "published",
          },
        },
      };
      const error = await failureOf(
        kabinetAnimalRepo(handle).writeListingIf(
          draft.id,
          published.next as AnimalListingState,
          draft.listing,
          line,
          { kind: "publish", expectedVersion: draft.version },
        ),
      );
      return {
        check: isCheckViolation(error),
        state: sqlStateOf(error),
        listing: (await animalRepo(handle).findById(draft.id))?.listing.kind,
      };
    });
    expect(outcomes[0]).toEqual({ check: true, state: "23514", listing: "draft" });
    expect(outcomes[1]).toEqual(outcomes[0]);
  });

  it("23503: a draft a swipe references comes back `referenced`, kept", async () => {
    const outcomes = await bothWays(async (handle) => {
      const { shelterId, cityId } = await place(handle);
      const draft = makeAnimal({ shelterId, listing: { kind: "draft" } });
      await animalRepo(handle).insert(draft, cityId);
      const adopter = makeAdopter();
      await adopterRepo(handle).insert(adopter);
      await swipeRepo(handle).record(
        makeSwipe({ adopterId: adopter.id, animalId: draft.id, at: AT }),
      );
      const answer = await kabinetAnimalRepo(handle).deleteDraftIf(draft.id, draft.version, {
        id: randomUUID(),
        entry: {
          kind: "animal_deleted",
          at: AT,
          actor: ACTOR as never,
          animalId: draft.id,
          animalName: draft.name,
        },
      });
      return { answer, kept: (await animalRepo(handle).findById(draft.id)) !== null };
    });
    expect(outcomes[0]).toEqual({ answer: { kind: "referenced" }, kept: true });
    expect(outcomes[1]).toEqual(outcomes[0]);
  });

  it("23505 on the one-membership index: the accept's write maps it to membership_conflict by its constraint's name", async () => {
    const outcomes = await bothWays(async (handle) => {
      const operator = randomUUID();
      const user = randomUUID();
      await handle
        .insert(authUser)
        .values([userRow(operator, "op@example.org"), userRow(user, ADDRESS)]);
      const invitationTo = async (shelterId: ShelterId) => {
        const organizationId = await kabinetInvitationRepo(handle).ensureOrganization(
          shelterId,
          { organizationId: randomUUID() },
          AT,
        );
        const id = randomUUID();
        await handle.insert(authInvitation).values({
          id,
          organizationId,
          email: ADDRESS,
          role: "admin",
          status: "pending",
          expiresAt: new Date(AT.getTime() + 3_600_000),
          createdAt: AT,
          inviterId: operator,
        });
        return { id, organizationId, shelterId };
      };
      const toA = await invitationTo((await place(handle)).shelterId);
      const toB = await invitationTo((await place(handle)).shelterId);
      const accepts = kabinetInvitationAcceptRepo(handle);
      const plan = await accepts.plan(user, AT);
      if (plan.kind !== "accept") throw new Error(`plan: ${plan.kind}`);
      const other = plan.invitation.id === toA.id ? toB : toA;
      const ids = () => ({ memberId: randomUUID(), historyId: randomUUID() });
      const first = await accepts.write({
        userId: user,
        invitation: plan.invitation,
        now: AT,
        ids: ids(),
      });
      const second = await accepts.write({
        userId: user,
        invitation: {
          ...plan.invitation,
          id: other.id as never,
          shelterId: other.shelterId,
          organizationId: other.organizationId,
        },
        now: AT,
        ids: ids(),
      });
      return [first, second];
    });
    expect(outcomes[0]).toEqual([{ kind: "written" }, { kind: "membership_conflict" }]);
    expect(outcomes[1]).toEqual(outcomes[0]);
  });

  it("23505 in super-admin's bootstrap: the fixed grant id's conflict is `already_bootstrapped`", async () => {
    const outcomes = await bothWays(async (handle) => {
      // A revoked bootstrap grant: no active operator, so the statement runs and meets the
      // primary key (the race the fixed id exists for, set up without one).
      const first = randomUUID();
      await handle.insert(authUser).values(userRow(first, "first@example.org"));
      await handle
        .insert(superAdmins)
        .values({ id: "bootstrap", userId: first, grantedAt: AT, revokedAt: AT });
      return superAdminRepo(handle).bootstrap({
        userId: randomUUID(),
        email: ADDRESS,
        name: "Олена",
        now: AT,
      });
    });
    expect(outcomes[0]).toEqual({ kind: "refused", reason: "already_bootstrapped" });
    expect(outcomes[1]).toEqual(outcomes[0]);
  });

  it("23505 in Better Auth: a duplicate user write rejects with the same SQLSTATE and constraint through its adapter over the raw handle as through the served instance (the cleaned one)", async () => {
    // Better Auth 1.6.33 inspects no SQLSTATE itself: a unique violation in its own write
    // propagates to its caller. The raw side is Better Auth's adapter built directly over the
    // raw handle (`rawAuthOver`); the cleaned side is the served instance, which wraps its handle.
    type UserWrite = { email: string; name: string; emailVerified: boolean };
    const duplicateThrough = async (
      context: Promise<{ internalAdapter: { createUser: (user: UserWrite) => Promise<unknown> } }>,
    ) => {
      await truncateAll(db);
      await db.insert(authUser).values(userRow(randomUUID(), ADDRESS));
      const error = await failureOf(
        (await context).internalAdapter.createUser({
          email: ADDRESS,
          name: "Олена",
          emailVerified: true,
        }),
      );
      const pg = (
        error as { cause?: { code?: string; constraint_name?: string; constraint?: string } }
      ).cause;
      return {
        cleaned: error instanceof CleanedQueryError,
        state: sqlStateOf(error),
        constraint: pg?.constraint_name ?? pg?.constraint,
      };
    };
    const raw = await duplicateThrough(rawAuthOver(db).$context);
    const served = await duplicateThrough(authOver(db).$context);
    expect(raw).toEqual({ cleaned: false, state: "23505", constraint: "auth_user_email_unique" });
    expect(served).toEqual({ ...raw, cleaned: true });
  });
});

/**
 * Better Auth with its Drizzle adapter built directly over `handle`, nothing wrapped: the raw
 * side of a raw-vs-cleaned comparison (F8-F1, the PW1-F8 review's note 2). The served instance's
 * model names, so its adapter writes the same tables.
 */
function rawAuthOver(handle: Database) {
  return betterAuth({
    baseURL: BASE,
    secret: SECRET,
    logger: { disabled: true },
    database: drizzleAdapter(handle, {
      provider: "pg",
      transaction: false,
      schema: {
        auth_user: authUser,
        auth_session: authSession,
        auth_account: authAccount,
        auth_verification: authVerification,
      },
    }),
    user: { modelName: "auth_user" },
    session: { modelName: "auth_session" },
    account: { modelName: "auth_account" },
    verification: { modelName: "auth_verification" },
  });
}

/** An instance over `handle`, as the served one is built (its own handle cleaned inside). */
function authOver(handle: Database): KabinetAuth {
  const unlimited = () => inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 100_000 });
  return createKabinetAuth({
    db: handle,
    sender: capturingSender(),
    schedule: () => {},
    baseURL: BASE,
    secret: SECRET,
    secureCookies: false,
    passwordLimiters: generousPasswordLimiters(),
    passwordMail: capturingPasswordMail(),
    limiters: { perUser: unlimited(), perIp: unlimited() },
    // The kabinet's own lines are masked by their own tests: here only what else reaches a log.
    log: () => {},
    logError: () => {},
  });
}

/** The signed cookie a browser would hold for `token` (better-call: HMAC-SHA256, base64). */
const cookieFor = (token: string) =>
  `kabinet.session_token=${encodeURIComponent(
    `${token}.${createHmac("sha256", SECRET).update(token).digest("base64")}`,
  )}`;

/** A shelter admin's user, with a password and a live session whose token is `TOKEN`. */
async function signedInUser(): Promise<string> {
  const userId = randomUUID();
  const now = new Date();
  await db.insert(authUser).values(userRow(userId, ADDRESS));
  await db.insert(authAccount).values({
    id: randomUUID(),
    accountId: userId,
    providerId: "credential",
    userId,
    password: await (await authOver(db).$context).password.hash(PASSWORD),
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(authSession).values({
    id: randomUUID(),
    token: TOKEN,
    userId,
    expiresAt: new Date(now.getTime() + 86_400_000),
    createdAt: now,
    updatedAt: now,
  });
  return userId;
}

const signedInHeaders = () => new Headers({ cookie: cookieFor(TOKEN), origin: BASE });

describe("Better Auth's two leaks, closed (the review's findings 1 and 2)", () => {
  it("finding 1: a password sign-in whose fallback join (the account read) fails: Better Auth's console.error prints a cleaned error; the answer is an empty 500", async () => {
    const userId = await signedInUser();
    const auth = authOver(
      failingDriverDatabase(db, (query) =>
        // Better Auth's own account read, the fallback join `findUserByEmail` makes (our hooks'
        // credential reads join `auth_user`; this one reads by user id).
        /from "auth_account" where "auth_account"."user_id"/.test(query)
          ? reportHolding("XX000")
          : undefined,
      ),
    );
    const answer = await auth.handler(
      new Request(`${BASE}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: BASE },
        body: JSON.stringify({ email: ADDRESS, password: PASSWORD }),
      }),
    );
    expect([answer.status, await answer.text()]).toEqual([500, ""]);
    // The fallback join ran, and failed: Better Auth's own line about it, and its raw print.
    expect(lines.filter((line) => line.includes("Failed to query fallback join"))).toHaveLength(1);
    const printed = lines.filter((line) => line.startsWith("error: CleanedQueryError"));
    expect(printed).toHaveLength(1);
    expect(printed[0]).toContain("code: 'XX000'");
    expect(leaks(lines, [userId])).toEqual(none(1));
  });

  it("finding 1, a session read: get-session over HTTP whose session read fails answers an empty 500 and logs nothing raw", async () => {
    await signedInUser();
    const auth = authOver(
      failingDriverDatabase(db, (query) =>
        /from "auth_session"/.test(query) ? reportHolding("57P01") : undefined,
      ),
    );
    const answer = await auth.handler(
      new Request(`${BASE}/api/auth/get-session`, { headers: signedInHeaders() }),
    );
    expect([answer.status, await answer.text()]).toEqual([500, ""]);
    expect(lines).toContain("error: [kabinet] Better Auth error: API error · Error (57P01)");
    expect(leaks(lines)).toEqual(none());
  });

  it("finding 2: a direct `auth.api.getSession` whose session read fails throws a cleaned error to its caller", async () => {
    await signedInUser();
    const auth = authOver(
      failingDriverDatabase(db, (query) =>
        /from "auth_session"/.test(query) ? reportHolding("57P01") : undefined,
      ),
    );
    const thrown = await failureOf(auth.api.getSession({ headers: signedInHeaders() }));
    expect(thrown).toBeInstanceOf(CleanedQueryError);
    expect(sqlStateOf(thrown)).toBe("57P01");
    expect(leaks([shown(thrown), ...lines])).toEqual(none());
  });
});

describe("a /kabinet page load during a database outage (the principal path)", () => {
  /**
   * What `proxy.ts` runs for a charged `/kabinet` page load: the per-IP budget, then the user,
   * read by `kabinetSessionUserIdOf`. What reaches Next's error log is what it throws, and
   * whatever was printed on the way.
   */
  const pageLoad = (auth: KabinetAuth, handle: Database) => {
    const unlimited = () => inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 100_000 });
    const now = new Date();
    return kabinetPageLoadAllowed(
      { perIp: unlimited(), perUser: unlimited() },
      {
        ip: "198.51.100.7",
        userId: () => kabinetSessionUserIdOf(auth, handle, signedInHeaders(), now),
      },
      now,
    );
  };

  it("the server down: the page load throws a cleaned error; no token, address or params: anywhere", async () => {
    await signedInUser();
    const down = await downDatabase();
    try {
      const thrown = await failureOf(pageLoad(authOver(down.db), down.db));
      expect(thrown).toBeInstanceOf(CleanedQueryError);
      expect(leaks([shown(thrown), String(thrown), ...lines])).toEqual(none());
    } finally {
      await down.end();
    }
  });

  it("the server gone after the session read: the role read fails on the principal's own handle, cleaned", async () => {
    const userId = await signedInUser();
    // The one statement only the principal runs on a page load: the role's membership read.
    const failing = failingDriverDatabase(db, (query) =>
      /from "auth_member"/.test(query) ? reportHolding("57P01") : undefined,
    );
    const auth = authOver(failing);
    // The session read itself still works: the page load is charged to this user.
    expect(await pageLoad(auth, failing)).toBe(true);
    const thrown = await failureOf(
      kabinetIdentityOf(auth, failing, signedInHeaders(), new Date(), false),
    );
    expect(thrown).toBeInstanceOf(CleanedQueryError);
    expect(sqlStateOf(thrown)).toBe("57P01");
    expect(leaks([shown(thrown), String(thrown), ...lines], [userId])).toEqual(none(1));
  });

  it("the masked catch: anything else getSession throws reaches the caller cleaned; an APIError passes as it is", async () => {
    const raw = await failureOf(
      failingDriverDatabase(db, () => reportHolding("XX000"))
        .insert(authSession)
        .values(sessionRow()),
    );
    expect(leaks([shown(raw)])[1], "the raw error names the token").toBeGreaterThan(0);
    const throwing = (error: unknown) =>
      ({ api: { getSession: () => Promise.reject(error) } }) as unknown as KabinetAuth;
    const thrown = await failureOf(
      kabinetSessionUserIdOf(throwing(raw), db, signedInHeaders(), new Date()),
    );
    expect(thrown).toBeInstanceOf(CleanedQueryError);
    expect(leaks([shown(thrown)])).toEqual(none());
    const refusal = new APIError("TOO_MANY_REQUESTS");
    expect(
      await failureOf(kabinetSessionUserIdOf(throwing(refusal), db, signedInHeaders(), new Date())),
    ).toBe(refusal);
  });
});

describe("a transaction on the cleaned handle (F8-F1, the PW1-F8 review's note 1)", () => {
  /** A unique violation inside the transaction: a real driver error, its parameters the address. */
  const duplicateUser = () => userRow(randomUUID(), ADDRESS);
  const usersNamed = async (name: string) =>
    (await db.select({ name: authUser.name }).from(authUser)).filter((row) => row.name === name)
      .length;

  it("a statement that fails inside the callback is cleaned at the statement: the callback sees a CleanedQueryError, and the caller the same one", async () => {
    await db.insert(authUser).values(userRow(randomUUID(), ADDRESS));
    // The control: the same statement in a transaction on the raw handle fails raw in the callback.
    let rawSeen: unknown;
    await failureOf(
      db.transaction(async (tx) => {
        rawSeen = await failureOf(tx.insert(authUser).values(duplicateUser()));
        throw rawSeen;
      }),
    );
    expect(leaks([shown(rawSeen)])[0], "the raw error names the address").toBeGreaterThan(0);

    let seen: unknown;
    const escaped = await failureOf(
      withQueryErrorsCleaned(db).transaction(async (tx) => {
        await tx
          .insert(authUser)
          .values({ ...userRow(randomUUID(), "kept@example.org"), name: TOKEN });
        seen = await failureOf(tx.insert(authUser).values(duplicateUser()));
        throw seen;
      }),
    );
    expect(seen).toBeInstanceOf(CleanedQueryError);
    expect(escaped).toBe(seen);
    expect(leaks([shown(seen), String(seen)])).toEqual(none());
    expect(factsOf(seen)).toMatchObject({
      message: "",
      code: "23505",
      constraint: "auth_user_email_unique",
      cause: { name: "PostgresError", message: "", code: "23505" },
    });
    for (const dropped of ["query", "params", "detail"]) {
      expect([dropped, Object.hasOwn(seen as object, dropped)]).toEqual([dropped, false]);
    }
    // Rolled back: the first insert is gone.
    expect(await usersNamed(TOKEN)).toBe(0);
  });

  it("what the callback throws reaches the caller unchanged: an APIError, Drizzle's rollback, a plain error", async () => {
    const clean = withQueryErrorsCleaned(db);
    const refusal = new APIError("FORBIDDEN");
    const plain = new Error("the callback's own answer");
    const apiError = await failureOf(
      clean.transaction(async (tx) => {
        await tx
          .insert(authUser)
          .values({ ...userRow(randomUUID(), "a@example.org"), name: TOKEN });
        throw refusal;
      }),
    );
    let rollbackThrown: unknown;
    const rolledBack = await failureOf(
      clean.transaction(async (tx) => {
        await tx
          .insert(authUser)
          .values({ ...userRow(randomUUID(), "b@example.org"), name: TOKEN });
        try {
          tx.rollback();
        } catch (error) {
          rollbackThrown = error;
          throw error;
        }
      }),
    );
    const plainError = await failureOf(
      clean.transaction(async () => {
        throw plain;
      }),
    );
    expect(apiError).toBe(refusal);
    expect(rolledBack).toBe(rollbackThrown);
    // Drizzle's own class, its name and message intact (its name is `DrizzleError`, its base's).
    expect([(rolledBack as Error).constructor.name, (rolledBack as Error).message]).toEqual([
      "TransactionRollbackError",
      "Rollback",
    ]);
    expect(plainError).toBe(plain);
    expect(plain.message).toBe("the callback's own answer");
    expect(await usersNamed(TOKEN)).toBe(0);
  });

  it("a commit still commits, and a nested transaction (a savepoint) is cleaned the same way", async () => {
    await db.insert(authUser).values(userRow(randomUUID(), ADDRESS));
    const refusal = new APIError("CONFLICT");
    let innerSeen: unknown;
    const outcome = await withQueryErrorsCleaned(db).transaction(async (tx) => {
      await tx.insert(authUser).values({ ...userRow(randomUUID(), "c@example.org"), name: TOKEN });
      const innerFailure = await failureOf(
        tx.transaction(async (inner) => {
          innerSeen = await failureOf(inner.insert(authUser).values(duplicateUser()));
          throw innerSeen;
        }),
      );
      const innerRefusal = await failureOf(
        tx.transaction(async () => {
          throw refusal;
        }),
      );
      return { innerFailure, innerRefusal };
    });
    expect(innerSeen).toBeInstanceOf(CleanedQueryError);
    expect(outcome.innerFailure).toBe(innerSeen);
    expect(outcome.innerRefusal).toBe(refusal);
    expect(leaks([shown(innerSeen)])).toEqual(none());
    expect(await usersNamed(TOKEN), "the outer transaction committed").toBe(1);
  });

  it("a raw query error the callback lets through from another handle is cleaned on its way out", async () => {
    await db.insert(authUser).values(userRow(randomUUID(), ADDRESS));
    // Failed before the transaction: the test database's one connection is the transaction's.
    const raw = await failureOf(db.insert(authUser).values(duplicateUser()));
    expect(leaks([shown(raw)])[0], "the raw error names the address").toBeGreaterThan(0);
    const escaped = await failureOf(
      withQueryErrorsCleaned(db).transaction(async () => {
        throw raw;
      }),
    );
    expect(escaped).toBeInstanceOf(CleanedQueryError);
    expect(sqlStateOf(escaped)).toBe("23505");
    expect(leaks([shown(escaped)])).toEqual(none());
  });

  it("neon-http: the driver has no transactions, so the callback never runs; its refusal is cleaned as before, and no request is sent", async () => {
    const neonDb = neonHttpDatabaseAnswering({ message: "unused", code: "XX000" });
    try {
      let ran = false;
      const refused = await failureOf(
        withQueryErrorsCleaned(neonDb.db).transaction(async () => {
          ran = true;
        }),
      );
      expect(ran).toBe(false);
      expect(refused).toBeInstanceOf(CleanedQueryError);
      expect(factsOf(refused)).toEqual({ name: "Error", message: "" });
      expect(neonDb.requests()).toBe(0);
    } finally {
      neonDb.restore();
    }
  });
});

function userRow(id: string, email: string) {
  const now = new Date("2026-10-20T08:00:00.000Z");
  return { id, name: "Олена", email, emailVerified: true, createdAt: now, updatedAt: now };
}

/** A session row holding `TOKEN`: a statement whose parameters carry the token. */
function sessionRow() {
  const now = new Date("2026-10-20T08:00:00.000Z");
  return {
    id: randomUUID(),
    token: TOKEN,
    userId: randomUUID(),
    expiresAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

/** The cleaned error's own fields and its cause's, as one plain object. */
function factsOf(error: unknown): unknown {
  if (!(error instanceof Error)) return error;
  const own = Object.fromEntries(
    Object.entries(error).filter(([key]) => key !== "cause" && key !== "stack"),
  );
  return {
    name: error.name,
    message: error.message,
    ...own,
    ...(error.cause === undefined ? {} : { cause: factsOf(error.cause) }),
  };
}
