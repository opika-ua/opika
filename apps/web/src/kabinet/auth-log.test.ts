import { inspect } from "node:util";
import { authUser } from "@opika/db/schema";
import {
  failingDriverDatabase,
  postgresError,
  setupTestDatabase,
  truncateAll,
} from "@opika/db/test";
import { APIError } from "better-auth/api";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inMemoryRateLimiter } from "../api/rate-limit";
import { createKabinetAuth } from "./auth";
import { type AuthLogLevel, maskedAuthLogging, maskedLogText, maskedLogValue } from "./auth-log";
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
 * The driver's error report for a failed query, holding the three values: the password sits in the
 * message's head, where a value lands in a real Postgres message (`invalid input syntax for type
 * …: "…"`), so cutting the parameters alone isn't enough; and the head says "does not exist", which
 * sends Better Auth's own handler down its branch that logs the message as text.
 */
const failedReport = () =>
  postgresError({
    message: `column "x" does not exist near "${PASSWORD}" for ${ADDRESS} with ${TOKEN}`,
    code: "42703",
    severity: "ERROR",
    detail: `Key (email)=(${ADDRESS})`,
  });

/**
 * A failed query exactly as drizzle-orm 0.45.2 raises it (the review's note 4): Drizzle's own
 * error, built by Drizzle over the driver's, with no `name` of its own, the SQL and the parameters
 * (the address, the token, the password) in its message and as its `query` and `params`, the
 * driver's `PostgresError` as its cause. Raw: never through the cleaned handle.
 */
async function realQueryError(): Promise<Error> {
  try {
    await failingDriverDatabase(db, failedReport).insert(authUser).values({
      id: TOKEN,
      name: PASSWORD,
      email: ADDRESS,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  } catch (error) {
    if (error instanceof Error) return error;
  }
  throw new Error("the forced query did not fail");
}

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

/** An instance whose driver fails each statement `failing` matches, with `failedReport`. */
function authFailing(failing: RegExp) {
  return createKabinetAuth({
    db: failingDriverDatabase(db, (query) => (failing.test(query) ? failedReport() : undefined)),
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
    ["Better Auth's own user read", /^select "id", "name", "email".* from "auth_user" where/],
    ["the operator-grant query in our hook", /inner join "super_admins"/],
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
      expect(lines).toEqual(["error: [kabinet] Better Auth error: API error · Error (42703)"]);
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
  const args = async () => [
    await realQueryError(),
    { email: ADDRESS, token: TOKEN, password: PASSWORD },
  ];

  it("the instance's own logger: error and warn lines are written, masked; info, success and debug are dropped", async () => {
    const logger = (await authFailing(/^$/).$context).logger;
    for (const level of levels) logger[level](message, ...(await args()));
    expectNothingLeaked();
    expect(lines.map((line) => line.slice(0, line.indexOf(":")))).toEqual(["error", "warn"]);
    expect(lines[0]).toContain(
      "[kabinet] Better Auth error: Invalid redirect URL: http://localhost:3000/kabinet for o•••@example.org · Error (42703) · [object]",
    );
  });

  it("the masking itself, at each level Better Auth can hand it (a lowered level included)", async () => {
    const { logger } = maskedAuthLogging(console);
    const each: AuthLogLevel[] = ["error", "warn", "info", "debug"];
    const values = await args();
    for (const level of each) logger.log(level, message, ...values);
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

describe("the review's notes on the masking (3, 4 and 5)", () => {
  it("onAPIError given Drizzle's raw error (not through the cleaned handle): one masked line, and a bare 500 thrown", async () => {
    const out = { error: vi.fn(), warn: vi.fn(), log: vi.fn() };
    const raw = await realQueryError();
    // The control: the error this test hands it does carry all three.
    expect(SECRETS.map((secret) => inspect(raw, { depth: 6 }).includes(secret))).toEqual([
      true,
      true,
      true,
      true,
    ]);
    let thrown: unknown;
    try {
      maskedAuthLogging(out).onAPIError.onError(raw);
    } catch (error) {
      thrown = error;
    }
    expect(out.error.mock.calls).toEqual([
      ["[kabinet] Better Auth error: API error · Error (42703)"],
    ]);
    expect(thrown).toBeInstanceOf(APIError);
    expect(inspect(thrown, { depth: 6 }).includes("params")).toBe(false);
  });

  it("note 3: only a real error is shown by its name; an object with a `name` is user data, `[object]`", async () => {
    expect(maskedLogValue({ name: "Olena", email: ADDRESS })).toBe("[object]");
    expect(maskedLogValue({ name: "Kovalenko", code: "23505" })).toBe("[object]");
    expect(maskedLogValue(Object.assign(new Error(ADDRESS), { code: "23505" }))).toBe(
      "Error (23505)",
    );
    expect(maskedLogValue(await realQueryError())).toBe("Error (42703)");
  });

  it("note 5: a URL-encoded address, a capitalised Params: and a short token are masked", () => {
    expect(maskedLogText("sent to olena%40example.org and OLENA%40Example.org")).toBe(
      "sent to o•••@example.org and O•••@Example.org",
    );
    expect(maskedLogText(`Failed query: select 1\nParams: ${ADDRESS}`)).toBe(
      "Failed query: select 1",
    );
    expect(maskedLogText(`PARAMS: ${TOKEN}`)).toBe("");
    // 12 to 19 characters mixing letters and digits: a token, masked.
    expect(maskedLogText("token Zq3vN8kLwP2x and 7f3a9c1e2b4d5f60a1b2")).toBe("token ••• and •••");
  });

  it("note 5's threshold leaves ordinary words alone: no digits, under 20 ASCII letters, or not ASCII", () => {
    const text =
      "Failed to query fallback join for model auth_account: INTERNAL_ERROR 23505 2026-10-20 " +
      "verification_token відновлення-пароля-сьогодні 1729450000000";
    expect(maskedLogText(text)).toBe(text);
  });
});
