import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { authSession, authUser, authVerification } from "@opika/db/schema";
import { setupTestDatabase, truncateAll } from "@opika/db/test";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { handleAuthCleanup } from "./auth-cleanup";

/**
 * KH-Q9 (Oleksii, 2026-10-14, relayed, verbatim): "Test: an expired row is
 * deleted, a live one isn't, and an unauthenticated call is refused." Real
 * Postgres, real `Request`s; nothing mocked but the log sink.
 */

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());

const NOW = new Date("2026-10-14T03:00:00.000Z");
const at = (ms: number) => new Date(NOW.getTime() + ms);
const SECRET = "cron-secret-for-tests-0123456789abcdef";
const EMAIL = "olena@example.org";
const USER = "aaaaaaaa-0000-4000-8000-00000000000a";

beforeEach(async () => {
  await truncateAll(db);
  await db.insert(authUser).values({
    id: USER,
    name: "Олена",
    email: EMAIL,
    emailVerified: true,
    createdAt: at(-30 * 86_400_000),
    updatedAt: at(-30 * 86_400_000),
  });
  const session = (id: string, expiresAt: Date) => ({
    id,
    token: `token-of-${id}`,
    userId: USER,
    expiresAt,
    createdAt: at(-8 * 86_400_000),
    updatedAt: at(-8 * 86_400_000),
  });
  const verification = (id: string, expiresAt: Date) => ({
    id,
    identifier: `hashed-${id}`,
    value: JSON.stringify({ email: EMAIL }),
    expiresAt,
    createdAt: at(-60 * 60_000),
    updatedAt: at(-60 * 60_000),
  });
  await db
    .insert(authSession)
    .values([session("session-expired", at(-1)), session("session-live", at(86_400_000))]);
  await db
    .insert(authVerification)
    .values([
      verification("verification-expired", at(-1)),
      verification("verification-live", at(15 * 60_000)),
    ]);
});

const rows = async () => ({
  sessions: (await db.select({ id: authSession.id }).from(authSession)).map((r) => r.id).sort(),
  verifications: (await db.select({ id: authVerification.id }).from(authVerification))
    .map((r) => r.id)
    .sort(),
});
const ALL = {
  sessions: ["session-expired", "session-live"],
  verifications: ["verification-expired", "verification-live"],
};

async function run(
  headers: Record<string, string>,
  { cronSecret }: { cronSecret: string | undefined } = { cronSecret: SECRET },
) {
  const lines: string[] = [];
  const response = await handleAuthCleanup(
    new Request("https://opika.example/api/cron/auth-cleanup", { headers }),
    { cronSecret, db: () => db, now: NOW, log: (line) => lines.push(line) },
  );
  return { response, lines };
}

describe("the auth clean-up cron (KH-Q9)", () => {
  it("with the secret: deletes the expired session and verification, keeps the live ones", async () => {
    const { response } = await run({ authorization: `Bearer ${SECRET}` });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ verifications: 1, sessions: 1 });
    expect(await rows()).toEqual({
      sessions: ["session-live"],
      verifications: ["verification-live"],
    });
  });

  it("logs the counts, and no address, token or id", async () => {
    const { lines } = await run({ authorization: `Bearer ${SECRET}` });
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? "")).toEqual({
      event: "kabinet_auth_cleanup",
      outcome: "deleted",
      verifications: 1,
      sessions: 1,
    });
    for (const secretish of [EMAIL, "olena", "token-of-", "hashed-", USER, "expired", SECRET]) {
      expect(lines[0]).not.toContain(secretish);
    }
  });

  it.each([
    ["no Authorization header", {}],
    ["a wrong secret", { authorization: "Bearer not-the-secret" }],
    ["the secret without the Bearer scheme", { authorization: SECRET }],
    ["a lowercase scheme", { authorization: `bearer ${SECRET}` }],
  ])("refuses %s with 401 and deletes nothing", async (_label, headers) => {
    const { response, lines } = await run(headers);
    expect(response.status).toBe(401);
    expect(await rows()).toEqual(ALL);
    expect(lines).toEqual([]);
  });

  it.each([
    ["unset", undefined],
    ["empty", ""],
  ])(
    "CRON_SECRET %s: refuses every call (500) and deletes nothing, fail closed",
    async (_label, secret) => {
      for (const authorization of ["Bearer ", "Bearer undefined", `Bearer ${SECRET}`]) {
        const { response, lines } = await run({ authorization }, { cronSecret: secret });
        expect(response.status).toBe(500);
        expect(lines.map((l) => JSON.parse(l))).toEqual([
          { event: "kabinet_auth_cleanup", outcome: "refused_no_secret" },
        ]);
      }
      expect(await rows()).toEqual(ALL);
    },
  );
});

/**
 * The cron is what the provisional /pro sentence relies on, so its wiring is
 * pinned, not just the handler: Vercel's config schedules it daily, at a path
 * that has a route and that the pre-launch gate lets through (KH-T5).
 */
describe("the auth clean-up is scheduled daily and reachable", () => {
  const WEB = resolve(fileURLToPath(import.meta.url), "../../..");
  const config = JSON.parse(readFileSync(join(WEB, "vercel.json"), "utf8")) as {
    crons?: { path: string; schedule: string }[];
  };
  const cron = config.crons?.find((c) => c.path === "/api/cron/auth-cleanup");

  it("apps/web/vercel.json schedules /api/cron/auth-cleanup once a day", () => {
    // minute hour * * *: one fixed time, every day.
    expect(cron?.schedule).toMatch(/^\d{1,2} \d{1,2} \* \* \*$/);
  });

  it("the path has a GET route and skips the pre-launch gate", async () => {
    expect(existsSync(join(WEB, "src/app/api/cron/auth-cleanup/route.ts"))).toBe(true);
    const { GET } = await import("../app/api/cron/auth-cleanup/route");
    expect(typeof GET).toBe("function");
    const { isCronPath } = await import("../proxy");
    expect(isCronPath(cron?.path ?? "")).toBe(true);
  });
});
