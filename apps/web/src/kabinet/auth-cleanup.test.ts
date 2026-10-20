import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { authSession, authUser, authVerification } from "@opika/db/schema";
import { setupTestDatabase, truncateAll } from "@opika/db/test";
import { uk } from "@opika/i18n";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { handleAuthCleanup } from "./auth-cleanup";
import { MAGIC_LINK_TTL_SECONDS } from "./magic-link-sender";
import { SIGN_IN_LIMITS } from "./sign-in-limit";

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
 * The cron is what the /pro sentence relies on, so its wiring is pinned, not
 * just the handler: one entry in Vercel's config, at a path that has a route
 * and that the pre-launch gate lets through (KH-T5), on a schedule that keeps
 * the sentence true (the describe after this one).
 */
const AUTH_CLEANUP_PATH = "/api/cron/auth-cleanup";
const WEB = resolve(fileURLToPath(import.meta.url), "../../..");
const vercelConfig = JSON.parse(readFileSync(join(WEB, "vercel.json"), "utf8")) as {
  crons?: { path: string; schedule: string }[];
};
const authCleanupCrons = vercelConfig.crons?.filter((c) => c.path === AUTH_CLEANUP_PATH) ?? [];

describe("the auth clean-up is scheduled and reachable", () => {
  it("apps/web/vercel.json has exactly one schedule for /api/cron/auth-cleanup", () => {
    // One, so the schedule the next describe reads is the only one there is.
    expect(authCleanupCrons).toHaveLength(1);
  });

  it("the path has a GET route and skips the pre-launch gate", async () => {
    expect(existsSync(join(WEB, "src/app/api/cron/auth-cleanup/route.ts"))).toBe(true);
    const { GET } = await import("../app/api/cron/auth-cleanup/route");
    expect(typeof GET).toBe("function");
    const { isCronPath } = await import("../proxy");
    expect(isCronPath(AUTH_CLEANUP_PATH)).toBe(true);
  });
});

/**
 * KH-Q12. Oleksii, 2026-10-18 (VP-T1), verbatim: "Run the sign-in clean-up
 * every 6 hours on Pro, and change /pro to «…видаляються протягом доби.» […]
 * Pin the sentence with a test that reads the cron schedule from config, so
 * copy and schedule can't drift."
 *
 * The limit is the sentence's own word, not a value the code renders: a доба
 * is 24 hours, counted from the moment a record stops being needed. The worst
 * case is computed from the schedule in `apps/web/vercel.json`:
 * - an address typed into the sign-in form lives in `auth_verification` for
 *   the link's lifetime (`MAGIC_LINK_TTL_SECONDS`), then is past expiry; a
 *   sign-in record is past expiry from the moment it loses force;
 * - the same typed address also keys the shared rate limiter (the
 *   per-address limit, HS-Q5; since PW-1 the key is `address:` and an HMAC
 *   of the address, `addressKeyWith`, `docs/shelter-passwords.md` §9 answer
 *   7, no longer the address itself). `@upstash/ratelimit`'s sliding window
 *   keeps a key for
 *   2 × its window + 1 s, then Redis drops it; that has to fit within a day
 *   too, and is checked below beside the schedule;
 * - a record past expiry goes at the first run after it expired, and since the
 *   delete is strict (`expires_at < now`), one expiring at the instant of a
 *   run waits for the next: at most one gap between runs, the day's largest
 *   gap being the bound;
 * - Vercel does not retry a failed cron, so one skipped run doubles that. For
 *   «протягом двох діб» he accepted the skipped run as outside "the normal
 *   cycle" (KH-C1, row 90); a run every 6 hours covers it within a day, so
 *   this test counts it.
 *
 * Worst case = link lifetime + 2 × largest gap, at most 24 h. Every 6 hours
 * that is 15 min + 12 h = 12 h 15 min; even with every run up to an hour late
 * (Hobby promised only the hour; nothing here assumes Pro is tighter) it stays
 * under 14 h. Back to one run a day it is 48 h 15 min.
 */
describe("/pro's deletion clause and the clean-up's schedule cannot drift (KH-Q12)", () => {
  const HOUR_MS = 60 * 60 * 1000;
  /** «протягом доби»: within one доба, 24 hours. */
  const A_DAY_MS = 24 * HOUR_MS;
  /** His sentence, transcribed from his message and PR 6's text, never read from `uk.ts`. */
  const DELETION_SENTENCE =
    "Адреси, введені у формі входу, і записи про входи, що втратили силу, видаляються протягом доби.";

  it("/pro promises deletion within a day, and the schedule's worst case keeps that true", () => {
    expect(uk.about.data, "/pro about.data carries his «…видаляються протягом доби.»").toContain(
      DELETION_SENTENCE,
    );

    const schedule = authCleanupCrons[0]?.schedule ?? "";
    const linkMs = MAGIC_LINK_TTL_SECONDS * 1000;
    const gapMs = largestGapHoursOf(schedule) * HOUR_MS;
    const worstCaseMs = linkMs + 2 * gapMs;
    expect(
      worstCaseMs,
      `"${schedule}": worst case ${duration(worstCaseMs)} (link ${duration(linkMs)} + 2 × largest gap ${duration(gapMs)}) is past the ${duration(A_DAY_MS)} «протягом доби» allows`,
    ).toBeLessThanOrEqual(A_DAY_MS);

    const limiterKeyMs = 2 * SIGN_IN_LIMITS.perAddress.windowMs + 1000;
    expect(
      limiterKeyMs,
      `the per-address limiter keeps a typed address for ${duration(limiterKeyMs)} (2 × its window + 1 s), past the ${duration(A_DAY_MS)} «протягом доби» allows`,
    ).toBeLessThanOrEqual(A_DAY_MS);
  });
});

describe("largestGapHoursOf, the schedule reader the test above relies on", () => {
  it.each([
    ["0 3 * * *", 24],
    ["0 */6 * * *", 6],
    ["30 1,7,13,19 * * *", 6],
    ["0 0,2 * * *", 22],
    // 0,5,10,15,20: the wrap from 20 to the next day's 0 is 4.
    ["0 */5 * * *", 5],
    // 0,7,14,21: the wrap is 3.
    ["0 */7 * * *", 7],
    // Out of order: 2 to 22 is 20, the wrap from 22 to 2 is 4.
    ["0 22,2 * * *", 20],
  ])("%s: the largest gap is %i h", (schedule, hours) => {
    expect(largestGapHoursOf(schedule)).toBe(hours);
  });

  it.each([
    ["a range", "0 3-9 * * *"],
    ["a step that is not a number", "0 */x * * *"],
    ["an hour past 23", "0 24 * * *"],
    ["a step of 0", "0 */0 * * *"],
    ["a step of 24", "0 */24 * * *"],
    ["a minute that is not fixed", "* */6 * * *"],
    ["a schedule that skips days", "0 */6 * * 1"],
    ["four fields", "0 */6 * *"],
    ["an empty schedule", ""],
  ])("refuses %s (%s) loudly instead of guessing", (_label, schedule) => {
    expect(() => largestGapHoursOf(schedule)).toThrow(/^cron schedule /);
  });
});

/**
 * The largest gap, in hours, between two consecutive runs of a cron schedule
 * that runs every day, the wrap from the day's last run to the next day's
 * first included. Reads only what this test needs (one fixed minute, every
 * day, and an hour field that is one hour, a list or a step) and throws on
 * anything else, so a schedule it cannot read fails the test rather than
 * passing it.
 */
function largestGapHoursOf(schedule: string): number {
  const refusal = (why: string) =>
    new Error(`cron schedule "${schedule}": ${why}; extend largestGapHoursOf to read it`);
  const fields = schedule.split(" ");
  const [minute = "", hourField = "", ...days] = fields;
  if (fields.length !== 5) throw refusal("expected five space-separated fields");
  if (!/^\d{1,2}$/.test(minute) || Number(minute) > 59) {
    throw refusal("the minute must be one fixed minute");
  }
  if (days.join(" ") !== "* * *") {
    throw refusal("it must run every day (day of month, month and day of week all *)");
  }
  const hours = runHoursOf(hourField, refusal);
  const gaps = hours.map((hour, i) => (hours[i + 1] ?? (hours[0] ?? 0) + 24) - hour);
  return Math.max(...gaps);
}

function runHoursOf(hourField: string, refusal: (why: string) => Error): number[] {
  const step = /^\*\/(\d{1,2})$/.exec(hourField);
  if (step) {
    const every = Number(step[1]);
    if (!Number.isInteger(every) || every < 1 || every > 23) {
      throw refusal(`a step of ${step[1]} hours is outside 1–23`);
    }
    return Array.from({ length: Math.ceil(24 / every) }, (_, i) => i * every);
  }
  if (/^\d{1,2}(,\d{1,2})*$/.test(hourField)) {
    const hours = [...new Set(hourField.split(",").map(Number))].sort((a, b) => a - b);
    if (hours.some((hour) => hour > 23)) throw refusal("an hour is outside 0–23");
    return hours;
  }
  throw refusal(
    `the hour field "${hourField}" is none of: one hour (3), a list (0,6,12,18), a step (*/6)`,
  );
}

function duration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
