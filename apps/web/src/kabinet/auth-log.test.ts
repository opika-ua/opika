import { inspect } from "node:util";
import { setupTestDatabase, statementName, steppedDatabase, truncateAll } from "@opika/db/test";
import { APIError } from "better-auth/api";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inMemoryRateLimiter } from "../api/rate-limit";
import { createKabinetAuth } from "./auth";
import { type AuthLogLevel, maskedAuthLogging } from "./auth-log";
import { capturingSender } from "./magic-link-sender";
import { generousPasswordLimiters } from "./password-limits";
import { capturingPasswordMail } from "./password-mail";

/**
 * PW1-F8 (the F6 review's finding 4): nothing Better Auth logs carries an address, a token or a
 * password. Oleksii, 2026-10-20, verbatim: "PW1-F8: (a) as I sent before: onAPIError plus Better
 * Auth’s logger through the masking helper, with tests that log lines carry no address, token or
 * password."
 *
 * The failure is forced as it happens: a Drizzle query inside Better Auth's sign-in fails, and its
 * error's message carries what Postgres and Drizzle put there, the query's parameters among them.
 * Every console method is captured whole (`inspect`, so an error's message, stack and cause count
 * too), and each test first checks that a line was written at all, so a silent logger can't pass.
 */

const BASE = "http://localhost:3000";
/** Fictional, each distinctive, so a leak names itself. */
const ADDRESS = "olena@example.org";
const TOKEN = "Zq3vN8kLwP2xR7tYb4mC9hJ6sD1fG5aE";
const PASSWORD = "ялинка-під-вікном-1987";

/**
 * A failed query as Drizzle reports it: the SQL, then its parameters, the driver's error as the
 * cause. The password sits in the message's head, where a value lands in a real Postgres message
 * (`invalid input syntax for type …: "…"`), so cutting the parameters alone isn't enough; and the
 * head says "does not exist", which sends Better Auth's own handler down its branch that logs the
 * message as text.
 */
const failedQuery = () =>
  Object.assign(
    new Error(
      `Failed query: select "id" from "auth_user" where "email" = $1: column "x" does not exist near "${PASSWORD}"\nparams: ${ADDRESS},${TOKEN},${PASSWORD}`,
    ),
    {
      name: "DrizzleQueryError",
      cause: Object.assign(new Error(`relation for ${ADDRESS} with ${TOKEN} and ${PASSWORD}`), {
        code: "42703",
        detail: `Key (email)=(${ADDRESS})`,
      }),
    },
  );

const SECRETS = [ADDRESS, TOKEN, PASSWORD, "olena"];

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;
let lines: string[];
let restore: (() => void)[];

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());

beforeEach(async () => {
  await truncateAll(db);
  lines = [];
  restore = (["error", "warn", "log", "info", "debug", "trace"] as const).map((method) => {
    const spy = vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      lines.push(
        `${method}: ${args.map((arg) => (typeof arg === "string" ? arg : inspect(arg, { depth: 6 }))).join(" ")}`,
      );
    });
    return () => spy.mockRestore();
  });
  return () => {
    for (const undo of restore) undo();
  };
});

/** No captured line holds any of the secrets: a count per secret, so a failure prints none of them. */
function expectNothingLeaked() {
  const leaks = SECRETS.map((secret) => lines.filter((line) => line.includes(secret)).length);
  expect(leaks, "lines carrying the address, the token, the password, the local part").toEqual([
    0, 0, 0, 0,
  ]);
}

const unlimited = () => inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 100_000 });

function authFailing(statement: string) {
  const stepped = steppedDatabase(db, {
    failWhen: (s) => (statementName(s) === statement ? failedQuery() : undefined),
  });
  return createKabinetAuth({
    db: stepped.db,
    sender: capturingSender(),
    schedule: () => {},
    baseURL: BASE,
    secret: "test-only-secret-that-is-long-enough-0123456789",
    secureCookies: false,
    passwordLimiters: generousPasswordLimiters(),
    passwordMail: capturingPasswordMail(),
    limiters: { perUser: unlimited(), perIp: unlimited() },
    // The kabinet's own lines are not what this tests: only Better Auth's reach the console.
    log: () => {},
    logError: () => {},
  });
}

const signIn = (auth: ReturnType<typeof createKabinetAuth>) =>
  auth.handler(
    new Request(`${BASE}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE },
      body: JSON.stringify({ email: ADDRESS, password: PASSWORD }),
    }),
  );

describe("Better Auth's error log through the masking (onAPIError)", () => {
  for (const [what, statement] of [
    ["Better Auth's own user read", "select:auth_user"],
    ["the operator-grant query in our hook", "select:auth_user+super_admins"],
  ] as const) {
    it(`a failed query in ${what}: an empty 500 and one error line, its SQLSTATE, with no address, token or password`, async () => {
      const answer = await signIn(authFailing(statement));
      const body = await answer.text();
      expect(answer.status).toBe(500);
      expect(body).toBe("");
      expect(SECRETS.filter((secret) => body.includes(secret)).length, "secrets in the body").toBe(
        0,
      );
      expectNothingLeaked();
      // One line, masked; and not better-call's "# SERVER_ERROR", which prints the error whole.
      expect(lines).toEqual([
        "error: [kabinet] Better Auth error: API error · DrizzleQueryError (42703)",
      ]);
    });
  }

  it("an APIError short of a 500 is an answer, not logged; a 500 is, as its status and code", () => {
    const out = { error: vi.fn(), warn: vi.fn(), log: vi.fn() };
    const { onAPIError } = maskedAuthLogging(out);
    onAPIError.onError(new APIError("UNAUTHORIZED", { message: ADDRESS, code: "X" }));
    expect(out.error).not.toHaveBeenCalled();
    onAPIError.onError(
      new APIError("INTERNAL_SERVER_ERROR", { message: `${ADDRESS} ${TOKEN}`, code: "BROKEN" }),
    );
    expect(out.error.mock.calls).toEqual([
      ["[kabinet] Better Auth error: API error · APIError INTERNAL_SERVER_ERROR BROKEN"],
    ]);
  });
});

describe("Better Auth's logger through the masking, every level", () => {
  const levels = ["error", "warn", "info", "success", "debug"] as const;

  /**
   * What Better Auth's own code hands its logger: text with a value interpolated (a URL with a
   * token in its query, an address), an error, an object of user data.
   */
  const message = `Invalid redirect URL: ${BASE}/kabinet?token=${TOKEN} for ${ADDRESS}`;
  const args = () => [failedQuery(), { email: ADDRESS, token: TOKEN, password: PASSWORD }];

  it("the instance's own logger: error and warn lines are written, masked; info, success and debug are dropped", async () => {
    const logger = (await authFailing("none").$context).logger;
    for (const level of levels) logger[level](message, ...args());
    expectNothingLeaked();
    expect(lines.map((line) => line.slice(0, line.indexOf(":")))).toEqual(["error", "warn"]);
    expect(lines[0]).toContain(
      "[kabinet] Better Auth error: Invalid redirect URL: http://localhost:3000/kabinet for o•••@example.org · DrizzleQueryError (42703) · [object]",
    );
  });

  it("the masking itself, at each level Better Auth can hand it (a lowered level included)", () => {
    const { logger } = maskedAuthLogging(console);
    const each: AuthLogLevel[] = ["error", "warn", "info", "debug"];
    for (const level of each) logger.log(level, message, ...args());
    expect(lines.map((line) => line.slice(0, line.indexOf(":")))).toEqual([
      "error",
      "warn",
      "log",
      "log",
    ]);
    expectNothingLeaked();
  });

  it("text alone: a Drizzle message's parameters are cut, an address masked, a token replaced", () => {
    const { logger } = maskedAuthLogging(console);
    logger.log("error", `Failed query: select 1 where token = '${TOKEN}'\nparams: ${ADDRESS}`);
    logger.log("warn", `sent to ${ADDRESS}`);
    expect(lines).toEqual([
      "error: [kabinet] Better Auth error: Failed query: select 1 where token = '•••'",
      "warn: [kabinet] Better Auth warn: sent to o•••@example.org",
    ]);
  });
});
