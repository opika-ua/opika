import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Redis } from "@upstash/redis";
import { sharedRedisStore } from "../src/api/rate-limit";
import {
  chargeSignInAttempt,
  clearSignInAttempts,
  SIGN_IN_DELAY,
  type SignInAttempt,
  upstashDelayStore,
} from "../src/kabinet/password-limits";

/**
 * PW1-F3 on real Upstash: the sign-in delay's two scripts (`upstashDelayStore`) do on the store
 * itself what the unit tests show the in-memory store doing. Run by Oleksii, not by CI: it
 * writes to the one Upstash database Production and Preview share (RL-4).
 *
 *   KV_REST_API_URL=… KV_REST_API_TOKEN=… \
 *     pnpm --filter @opika/web kabinet:sign-in-delay-smoke --write-smoke-keys
 *
 * Refuses without `--write-smoke-keys`, before it builds a client. The credentials come from the
 * environment only (the pair `rate-limit.ts` reads) and are never printed. Every key it writes is
 * one of `SMOKE_KEYS`, under a prefix of its own, `opika-smoke-sign-in-delay-<8 random hex>-<VERCEL_ENV,
 * else unknown>`, never the delay's (`opika-kabinet-sign-in-delay-…`). It deletes all five at the
 * end, whatever happened, and says if any is left; otherwise none lives past 16 minutes, except
 * `chain:stuck` before its step runs (it is written with no expiry, the state under test).
 */

export const SMOKE_FLAG = "--write-smoke-keys";

/** Every key the run writes, under its prefix (`sign-in-delay-smoke.test.ts` holds the run to these). */
export const SMOKE_KEYS = [
  "chain:stuck",
  "chain:fresh",
  "gate:fresh",
  "chain:address:smoke",
  "gate:address:smoke",
] as const;

const WINDOW = SIGN_IN_DELAY.windowMs;

export type Outcome = { name: string; ok: boolean; detail: string };

/** Why the run must not start, or null. */
export function smokeRefusalOf(argv: readonly string[], hasCredentials: boolean): string | null {
  if (!argv.includes(SMOKE_FLAG)) {
    return `it writes ${SMOKE_KEYS.length} keys to the shared Upstash store and deletes them; run it with ${SMOKE_FLAG}`;
  }
  if (!hasCredentials) {
    return "no Upstash pair in the environment (KV_REST_API_URL and KV_REST_API_TOKEN, or UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN)";
  }
  return null;
}

const shown = (a: SignInAttempt | undefined) =>
  a === undefined ? "none" : a.kind === "wait" ? `wait ${a.minutes}` : a.kind;

export async function runDelaySmoke(redis: Redis, prefix: string): Promise<Outcome[]> {
  const out: Outcome[] = [];
  const check = (name: string, ok: boolean, detail: string) => out.push({ name, ok, detail });
  const store = upstashDelayStore(redis, prefix);
  const at = (key: string) => `${prefix}:${key}`;
  const now = new Date(); // Upstash reads its own clock

  // 1. A count left with no expiry, as the code before PW1-F3 could leave one.
  await redis.set(at("chain:stuck"), 3);
  const stuckBefore = await redis.pttl(at("chain:stuck"));
  const stuckCount = await store.increment("chain:stuck", WINDOW, now);
  const stuckAfter = await redis.pttl(at("chain:stuck"));
  check(
    "a count with no expiry gains one on its next charge, keeping its count",
    stuckBefore === -1 && stuckCount === 4 && stuckAfter > 0 && stuckAfter <= WINDOW,
    `PTTL before ${stuckBefore}, count ${stuckCount}, PTTL after ${stuckAfter}`,
  );

  // 2. A new count gets its expiry as it is made; one that has an expiry keeps it (asked for 1 ms).
  const first = await store.increment("chain:fresh", WINDOW, now);
  const firstTtl = await redis.pttl(at("chain:fresh"));
  const second = await store.increment("chain:fresh", 1, now);
  const secondTtl = await redis.pttl(at("chain:fresh"));
  check(
    "a new count expires in the same step; a later charge keeps its expiry",
    first === 1 &&
      second === 2 &&
      firstTtl > 0 &&
      firstTtl <= WINDOW &&
      secondTtl > 1_000 &&
      secondTtl <= firstTtl,
    `counts ${first}, ${second}; PTTL ${firstTtl}, then ${secondTtl}`,
  );

  // 3. The gate, and the count kept 15 minutes past it, only for the caller that set the gate.
  const keepMs = 60_000 + WINDOW;
  const set = await store.setIfAbsent(
    "gate:fresh",
    60_000,
    { key: "chain:fresh", ms: keepMs },
    now,
  );
  const gateTtl = await redis.pttl(at("gate:fresh"));
  const keptTtl = await redis.pttl(at("chain:fresh"));
  const again = await store.setIfAbsent("gate:fresh", 60_000, { key: "chain:fresh", ms: 1 }, now);
  const keptAfter = await redis.pttl(at("chain:fresh"));
  check(
    "closing the gate keeps the count past it, in one step; a second close changes nothing",
    set &&
      !again &&
      gateTtl > 0 &&
      gateTtl <= 60_000 &&
      keptTtl > WINDOW &&
      keptTtl <= keepMs &&
      keptAfter > WINDOW,
    `set ${set}, again ${again}; gate PTTL ${gateTtl}; count PTTL ${keptTtl}, then ${keptAfter}`,
  );

  // 4. The delay end to end, then a success.
  const answers: SignInAttempt[] = [];
  for (let i = 0; i < 6; i++) answers.push(await chargeSignInAttempt(store, "address:smoke", now));
  const sixth = answers[5];
  check(
    "five attempts go ahead and the sixth waits a minute",
    answers.slice(0, 5).every((a) => a.kind === "allowed") &&
      sixth?.kind === "wait" &&
      sixth.minutes === 1,
    answers.map(shown).join(", "),
  );
  await clearSignInAttempts(store, "address:smoke", now);
  const left = await redis.exists(at("chain:address:smoke"), at("gate:address:smoke"));
  check("a success clears the count and the gate", left === 0, `${left} of 2 left`);
  return out;
}

async function main(): Promise<void> {
  const shared = process.argv.includes(SMOKE_FLAG)
    ? sharedRedisStore(`smoke-sign-in-delay-${randomBytes(4).toString("hex")}`)
    : null;
  const refusal = smokeRefusalOf(process.argv, shared !== null);
  if (refusal !== null || shared === null) {
    console.error(`REFUSED: ${refusal ?? "no store"}. Nothing was written.`);
    process.exit(1);
  }
  const { redis, prefix } = shared;
  const keys = SMOKE_KEYS.map((key) => `${prefix}:${key}`);
  console.log(`Writing only under ${prefix}: ${SMOKE_KEYS.join(", ")}`);
  let outcomes: Outcome[] = [];
  try {
    outcomes = await runDelaySmoke(redis, prefix);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "an error";
    outcomes.push({ name: "the run", ok: false, detail });
  } finally {
    try {
      await redis.del(...keys);
      const left = await redis.exists(...keys);
      outcomes.push({ name: "clean-up", ok: left === 0, detail: `${left} of ${keys.length} left` });
    } catch {
      outcomes.push({
        name: "clean-up",
        ok: false,
        detail: `not confirmed; delete ${keys.join(" ")}`,
      });
    }
  }
  for (const o of outcomes) console.log(`${o.ok ? "PASS" : "FAIL"}  ${o.name}: ${o.detail}`);
  const failed = outcomes.filter((o) => !o.ok).length;
  console.log(`${outcomes.length - failed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
