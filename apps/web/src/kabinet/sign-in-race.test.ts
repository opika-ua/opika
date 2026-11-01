import type { PasswordWrite } from "@opika/db/repos";
import { authAccount, authUser } from "@opika/db/schema";
import { setupTestDatabase, truncateAll, writeCredentialPassword } from "@opika/db/test";
import { APIError, isAPIError } from "better-auth/api";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type PasswordHookContext, passwordHooks } from "./password-hooks";
import { generousPasswordLimiters } from "./password-limits";
import { capturingPasswordMail } from "./password-mail";
import { sameWrites, signInRaceCheck } from "./sign-in-race";

/**
 * PW1-F6's check on its own: what `begin` and `settle` answer, and what the sign-in's after-hook
 * does with each answer, on a context built by hand. The races themselves, through real Better
 * Auth, are in `password-flows.test.ts`; here are the cases no real request reaches on demand
 * (a success with no first read).
 */

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());
beforeEach(async () => truncateAll(db));

const NOW = new Date("2026-10-20T10:00:00.000Z");
const OLENA = "aaaaaaaa-0000-4000-8000-00000000000a";
const EMAIL = "olena@example.org";

async function olenaWithPassword() {
  await db.insert(authUser).values({
    id: OLENA,
    name: "Олена",
    email: EMAIL,
    emailVerified: true,
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db.insert(authAccount).values({
    id: "acc-1",
    accountId: OLENA,
    providerId: "credential",
    userId: OLENA,
    password: "salt:old",
    createdAt: NOW,
    updatedAt: NOW,
  });
}

describe("sameWrites", () => {
  const write = (over: Partial<PasswordWrite> = {}): PasswordWrite => ({
    accountId: "acc-1",
    updatedAt: NOW,
    hash: "salt:key",
    ...over,
  });

  it("the same credentials as the same writes left them", () => {
    expect(sameWrites([], [])).toBe(true);
    expect(sameWrites([write()], [write({ updatedAt: new Date(NOW.getTime()) })])).toBe(true);
  });

  it("any difference is a write: the stamp, the hash, a credential more, fewer or another", () => {
    expect(sameWrites([write()], [write({ updatedAt: new Date(NOW.getTime() + 1) })])).toBe(false);
    // The same millisecond on two servers' clocks: the hash still tells them apart.
    expect(sameWrites([write()], [write({ hash: "salt2:key2" })])).toBe(false);
    expect(sameWrites([], [write()])).toBe(false);
    expect(sameWrites([write()], [])).toBe(false);
    expect(sameWrites([write()], [write({ accountId: "acc-2" })])).toBe(false);
  });
});

describe("signInRaceCheck", () => {
  it("unchanged when nothing was written between the two reads", async () => {
    await olenaWithPassword();
    const race = signInRaceCheck(db);
    const request = {};
    await race.begin(request, EMAIL);
    expect(await race.settle(request)).toEqual({ kind: "unchanged" });
  });

  it("written when the password was written in between, or a first credential appeared", async () => {
    await olenaWithPassword();
    const race = signInRaceCheck(db);
    const request = {};
    await race.begin(request, EMAIL);
    await writeCredentialPassword(db, OLENA, "salt:new", new Date(NOW.getTime() + 60_000));
    expect(await race.settle(request)).toEqual({ kind: "written" });

    await truncateAll(db);
    await db.insert(authUser).values({
      id: OLENA,
      name: "Олена",
      email: EMAIL,
      emailVerified: true,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const first = {};
    await race.begin(first, EMAIL);
    await db.insert(authAccount).values({
      id: "acc-1",
      accountId: OLENA,
      providerId: "credential",
      userId: OLENA,
      password: "salt:first",
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(await race.settle(first)).toEqual({ kind: "written" });
  });

  it("not_begun with no first read for that request; each settles once, and requests never mix", async () => {
    await olenaWithPassword();
    const race = signInRaceCheck(db);
    expect(await race.settle({})).toEqual({ kind: "not_begun" });
    const one = {};
    const two = {};
    await race.begin(one, EMAIL);
    expect(await race.settle(two)).toEqual({ kind: "not_begun" });
    expect(await race.settle(one)).toEqual({ kind: "unchanged" });
    expect(await race.settle(one), "settled once already").toEqual({ kind: "not_begun" });
  });
});

describe("the sign-in's after-hook, on each answer", () => {
  const hooks = (lines: { logged: string[]; errors: string[] }) =>
    passwordHooks({
      db,
      limiters: generousPasswordLimiters(),
      mail: capturingPasswordMail(),
      schedule: () => {},
      requestReset: async () => {},
      baseURL: "http://localhost:3000",
      log: (line) => lines.logged.push(line),
      logError: (line) => lines.errors.push(line),
    });

  /** A successful sign-in's context, as Better Auth hands it to `hooks.after`. */
  function succeeded() {
    const deleted: string[] = [];
    const newSessions: unknown[] = [];
    const responseHeaders = new Headers();
    responseHeaders.append("set-cookie", "kabinet.session_token=signed-token; Path=/; HttpOnly");
    responseHeaders.append("location", "/kabinet");
    const ctx: PasswordHookContext = {
      path: "/sign-in/email",
      body: { email: EMAIL, password: "ялинка-під-вікном-1987" },
      context: {
        password: { hash: async () => "hash" },
        internalAdapter: {
          findVerificationValue: async () => null,
          deleteVerificationByIdentifier: async () => {},
          findUserByEmail: async () => null,
          deleteSession: async (token) => {
            deleted.push(token);
          },
        },
        returned: { redirect: false, token: "the-token", user: { id: OLENA } },
        responseHeaders,
        newSession: { session: { token: "the-token" } },
        setNewSession: (session) => {
          newSessions.push(session);
        },
      },
    };
    return { ctx, deleted, newSessions, responseHeaders };
  }

  const refusalOf = async (work: Promise<void>) => {
    try {
      await work;
    } catch (error) {
      return error;
    }
    return undefined;
  };

  it("a success with no first read is refused: the wrong password's 401, every header dropped, its session deleted", async () => {
    await olenaWithPassword();
    const lines = { logged: [] as string[], errors: [] as string[] };
    const { ctx, deleted, newSessions, responseHeaders } = succeeded();

    const refused = await refusalOf(hooks(lines).after(ctx, NOW));

    expect(isAPIError(refused)).toBe(true);
    expect(refused).toMatchObject({
      statusCode: 401,
      body: { message: "Invalid email or password", code: "INVALID_EMAIL_OR_PASSWORD" },
    });
    expect([...responseHeaders]).toEqual([]);
    expect(deleted).toEqual(["the-token"]);
    expect(newSessions).toEqual([null]);
    expect(lines.errors).toEqual(["[kabinet] password sign-in refused: no first password read"]);
    expect(lines.logged).toEqual([]);
  });

  it("a success whose first read happened and nothing was written stands: nothing dropped, nothing deleted", async () => {
    await olenaWithPassword();
    const lines = { logged: [] as string[], errors: [] as string[] };
    const passwords = hooks(lines);
    const { ctx, deleted, responseHeaders } = succeeded();
    // The sign-in's before-hook makes the first read on the same context.
    expect(await passwords.beforeSession(ctx, NOW)).toBeUndefined();

    expect(await refusalOf(passwords.after(ctx, NOW))).toBeUndefined();
    expect(responseHeaders.getSetCookie()).toHaveLength(1);
    expect(deleted).toEqual([]);
    expect([...lines.logged, ...lines.errors]).toEqual([]);
  });

  it("a failure stands as Better Auth gave it, whatever the reads found", async () => {
    await olenaWithPassword();
    const lines = { logged: [] as string[], errors: [] as string[] };
    const passwords = hooks(lines);
    const { ctx, deleted } = succeeded();
    await passwords.beforeSession(ctx, NOW);
    await writeCredentialPassword(db, OLENA, "salt:new", new Date(NOW.getTime() + 60_000));
    ctx.context.returned = new APIError("UNAUTHORIZED", { message: "Invalid email or password" });

    expect(await refusalOf(passwords.after(ctx, NOW))).toBeUndefined();
    expect(deleted).toEqual([]);
    expect([...lines.logged, ...lines.errors]).toEqual([]);
  });
});
