import type { Redis } from "@upstash/redis";
import { inMemoryRateLimiter, type RateLimiter } from "../api/rate-limit";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * The password flows' own budgets (`docs/shelter-passwords.md` §4.3), on the
 * shared store like every kabinet limit, every key an HMAC (`ipRateLimitKey`,
 * `addressRateLimitKey`, §9 answer 7). Each endpoint is also behind the
 * kabinet's per-IP budget (`LIMITED_AUTH_PATHS`), and «Змінити пароль» behind
 * the per-user one; these come on top.
 *
 * - «Забули пароль?»: 20 an hour per IP, 3 an hour per address, any address,
 *   existing or not, so the refusal says nothing about who exists.
 * - A reset link's POST: 20 an hour per IP. No per-address budget: the token
 *   is single use and names its own user.
 */
export const PASSWORD_LIMITS = {
  forgotPerIp: { windowMs: HOUR_MS, maxRequests: 20 },
  forgotPerAddress: { windowMs: HOUR_MS, maxRequests: 3 },
  resetPerIp: { windowMs: HOUR_MS, maxRequests: 20 },
} as const;

/**
 * The password sign-in's per-address delay (§4.3; Oleksii's scope item 5,
 * verbatim: "rate limits per IP and per account (HMAC'd keys as now) with
 * increasing delays, no hard lockout"): after 5 failures in 15 minutes, each
 * further attempt for that address waits 1, 2, 4, 8, then 15 minutes (the
 * cap) before it is even checked; a success resets it.
 *
 * How it is counted (the builder's reading, recorded under "Decisions taken"):
 *
 * - **Every attempt is charged as it starts**, and a success clears the lot.
 *   A failure needs no second write, and parallel attempts can't slip through
 *   together: they each take a number, and past the free five only the one
 *   that takes the gate goes ahead (`chargeSignInAttempt`).
 * - **"In 15 minutes" is a window from the first attempt.** Five attempts
 *   inside it start the delays; fewer, and it simply expires.
 * - **Once delays have started, the count is kept** until 15 minutes pass
 *   after a wait ends with no further attempt. Without that the count would
 *   be forgotten after one 15-minute wait and the delays would restart from
 *   nothing, which is no escalation; with it there is still no lockout, since
 *   no wait is ever longer than 15 minutes.
 * - **A refused attempt is not counted**, so a person pressing «Увійти» while
 *   waiting doesn't make the wait longer.
 *
 * It applies to any submitted address, existing or not, and its message is
 * the same for every address (§9 answer 5), so it can't be used to find
 * accounts.
 */
export const SIGN_IN_DELAY = {
  freeAttempts: 5,
  windowMs: 15 * MINUTE_MS,
  delaysMinutes: [1, 2, 4, 8, 15],
} as const;

/** The wait after attempt `n` (1-based) of a chain: none for the first four, then 1, 2, 4, 8, 15, 15, … minutes. */
export function delayAfterAttemptMs(n: number): number {
  if (n < SIGN_IN_DELAY.freeAttempts) return 0;
  const steps = SIGN_IN_DELAY.delaysMinutes;
  const index = Math.min(n - SIGN_IN_DELAY.freeAttempts, steps.length - 1);
  return (steps[index] ?? steps[steps.length - 1] ?? 0) * MINUTE_MS;
}

/**
 * The atomic operations the delay is built from, each one step on the shared
 * store (Redis `PTTL`, a script around `INCR`, a script around `SET NX PX`,
 * `DEL`), so the algorithm above is written once and the two stores can't
 * disagree on it. `now` is for the in-memory store; Upstash reads its own
 * clock, as the limiters do (`api/rate-limit.ts`).
 *
 * **A count and its expiry change in one step, never two** (PW1-F3, from the
 * Tier 1 review of #153). PW-1 sent `INCR` and then `PEXPIRE` as two commands,
 * so a `PEXPIRE` lost between them (a timeout, a crash) left the count with no
 * expiry, and failures any distance apart kept counting toward the free five.
 * Oleksii, in the 2026-10-20 handoff, verbatim: "It must never become a
 * permanent lockout or a bypass." So each write below happens whole or not at
 * all: a store failing part-way leaves every key with an expiry and every
 * count no lower than it was, and the attempt it failed on is refused (the
 * hooks fail closed). A key the code before this left without an expiry gets
 * one on its next charge, keeping its count. So a count only ever errs high,
 * and only until its key expires (`password-limits.test.ts`, "PW1-F3").
 */
export interface DelayStore {
  /** Milliseconds left on `key`, or 0 when it is absent, expired or has no expiry. */
  remainingMs(key: string, now: Date): Promise<number>;
  /**
   * Adds one to `key` (an absent key counts as 0) and returns the new value. In
   * the same step, a key with no expiry (just created, or left without one) is
   * made to expire `ms` from now; a key that has one keeps it.
   */
  increment(key: string, ms: number, now: Date): Promise<number>;
  /**
   * Sets `key` for `ms` unless it is already set; true when this call set it.
   * Only then, and in the same step, `alsoExpire.key` is made to expire
   * `alsoExpire.ms` from now (an absent key stays absent).
   */
  setIfAbsent(
    key: string,
    ms: number,
    alsoExpire: { key: string; ms: number },
    now: Date,
  ): Promise<boolean>;
  /** Deletes the keys. */
  remove(keys: readonly string[], now: Date): Promise<void>;
}

export type SignInAttempt = { kind: "allowed" } | { kind: "wait"; minutes: number };

const chainKey = (addressKey: string) => `chain:${addressKey}`;
const gateKey = (addressKey: string) => `gate:${addressKey}`;

/** Whole minutes, rounded up, never under one: «через {minutes} хв.» is never «через 0 хв.». */
const minutesOf = (ms: number): number => Math.max(1, Math.ceil(ms / MINUTE_MS));

/**
 * Charges one password sign-in attempt for an address (its HMAC'd key,
 * `addressRateLimitKey`), and says whether it may be checked now.
 *
 * 1. A gate still closed: wait, and nothing is charged.
 * 2. The attempt takes the next number in the chain; the first one opens the
 *    15-minute window, in the same step (as does the first charge of a count
 *    left without an expiry).
 * 3. Within the free five: go ahead. From the fifth on, the attempt must
 *    close the gate behind it for the next delay, and keep the count until 15
 *    minutes after that wait, in one step; only one caller can (`SET NX`), so
 *    of any number arriving at once, one goes ahead and the rest wait.
 */
export async function chargeSignInAttempt(
  store: DelayStore,
  addressKey: string,
  now: Date,
): Promise<SignInAttempt> {
  const chain = chainKey(addressKey);
  const gate = gateKey(addressKey);
  const closed = await store.remainingMs(gate, now);
  if (closed > 0) return { kind: "wait", minutes: minutesOf(closed) };
  const n = await store.increment(chain, SIGN_IN_DELAY.windowMs, now);
  const delay = delayAfterAttemptMs(n);
  if (delay === 0) return { kind: "allowed" };
  const keep = { key: chain, ms: delay + SIGN_IN_DELAY.windowMs };
  if (!(await store.setIfAbsent(gate, delay, keep, now))) {
    return { kind: "wait", minutes: minutesOf(await store.remainingMs(gate, now)) };
  }
  return { kind: "allowed" };
}

/** A success: the address starts again from nothing. */
export async function clearSignInAttempts(
  store: DelayStore,
  addressKey: string,
  now: Date,
): Promise<void> {
  await store.remove([chainKey(addressKey), gateKey(addressKey)], now);
}

/** One key of the in-memory store. `expiresAt` null is a key with no expiry, as Redis can hold one. */
export type DelayEntry = { value: number; expiresAt: number | null };

/**
 * The in-memory store: local development, tests and the harness, as
 * `inMemoryRateLimiter` is. Per process, so in production the shared store is
 * used (`limiters.ts`). Each operation runs with no `await` inside it, so it
 * is one step, as each Upstash command is. `entries` is its state, passed in
 * only by tests: to seed a key with no expiry, or to read every key's expiry.
 */
export function inMemoryDelayStore(entries: Map<string, DelayEntry> = new Map()): DelayStore {
  const live = (key: string, now: Date) => {
    const entry = entries.get(key);
    if (entry === undefined) return undefined;
    if (entry.expiresAt !== null && entry.expiresAt <= now.getTime()) {
      entries.delete(key);
      return undefined;
    }
    return entry;
  };
  return {
    async remainingMs(key, now) {
      const entry = live(key, now);
      return entry?.expiresAt == null ? 0 : entry.expiresAt - now.getTime();
    },
    async increment(key, ms, now) {
      const entry = live(key, now) ?? { value: 0, expiresAt: null };
      entry.value += 1;
      if (entry.expiresAt === null) entry.expiresAt = now.getTime() + ms;
      entries.set(key, entry);
      return entry.value;
    },
    async setIfAbsent(key, ms, alsoExpire, now) {
      if (live(key, now) !== undefined) return false;
      entries.set(key, { value: 1, expiresAt: now.getTime() + ms });
      const other = live(alsoExpire.key, now);
      if (other !== undefined) other.expiresAt = now.getTime() + alsoExpire.ms;
      return true;
    },
    async remove(keys) {
      for (const key of keys) entries.delete(key);
    },
  };
}

/** The limiters and the delay store `createKabinetAuth` charges the password flows against. */
export type PasswordLimiters = {
  forgotPerIp: RateLimiter;
  forgotPerAddress: RateLimiter;
  resetPerIp: RateLimiter;
  signInDelay: DelayStore;
};

/**
 * `increment` on Upstash: `INCR`, then `PEXPIRE` when the key has no expiry
 * (`PTTL` -1), in one script, which Redis runs as one step. The same shape as
 * `@upstash/ratelimit`'s window scripts, which `INCRBY` and `PEXPIRE` inside
 * one script on this same database.
 */
const INCREMENT_SCRIPT = `local n = redis.call("INCR", KEYS[1])
if redis.call("PTTL", KEYS[1]) < 0 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
return n`;

/** `setIfAbsent` on Upstash: `SET NX PX` and, only when it set the key, `PEXPIRE` on the other, in one script. */
const SET_IF_ABSENT_SCRIPT = `if redis.call("SET", KEYS[1], "1", "NX", "PX", ARGV[1]) then
  redis.call("PEXPIRE", KEYS[2], ARGV[2])
  return 1
end
return 0`;

/**
 * A script's integer reply. Any other shape throws, so the hooks fail closed
 * and log it, rather than reading a reply they don't understand as a count or
 * as a closed gate.
 */
function integerReply(reply: unknown, script: string): number {
  const value = typeof reply === "string" && reply !== "" ? Number(reply) : reply;
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`sign-in delay store: ${script} answered in an unexpected shape`);
  }
  return value;
}

/**
 * The delay on the shared Upstash store, one Redis command per operation (two
 * of them scripts), so each step is atomic across every instance (`SET NX` is
 * what lets exactly one of a burst of attempts through a closed gate). Keys
 * are `<prefix>:` plus the caller's, which are HMACs of addresses, never an
 * address.
 */
export function upstashDelayStore(redis: Redis, prefix: string): DelayStore {
  const at = (key: string) => `${prefix}:${key}`;
  return {
    async remainingMs(key) {
      const ms = await redis.pttl(at(key));
      return ms > 0 ? ms : 0;
    },
    async increment(key, ms) {
      const n = integerReply(await redis.eval(INCREMENT_SCRIPT, [at(key)], [ms]), "increment");
      if (n < 1) throw new Error("sign-in delay store: increment answered below 1");
      return n;
    },
    async setIfAbsent(key, ms, alsoExpire) {
      const reply = integerReply(
        await redis.eval(SET_IF_ABSENT_SCRIPT, [at(key), at(alsoExpire.key)], [ms, alsoExpire.ms]),
        "setIfAbsent",
      );
      if (reply !== 0 && reply !== 1) {
        throw new Error("sign-in delay store: setIfAbsent answered neither 0 nor 1");
      }
      return reply === 1;
    },
    async remove(keys) {
      if (keys.length > 0) await redis.del(...keys.map(at));
    },
  };
}

/**
 * In-memory budgets no ordinary run reaches: the suites and the Neon smoke
 * that aren't about these limits build their auth with them, and the suites
 * that are (`password-flows.test.ts`) build their own.
 */
export function generousPasswordLimiters(): PasswordLimiters {
  const generous = () => inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 100_000 });
  return {
    forgotPerIp: generous(),
    forgotPerAddress: generous(),
    resetPerIp: generous(),
    signInDelay: inMemoryDelayStore(),
  };
}
