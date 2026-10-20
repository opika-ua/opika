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
 * The atomic operations the delay is built from, each one a single command on
 * the shared store (Redis `PTTL`, `INCR`, `PEXPIRE`, `SET NX PX`, `DEL`), so
 * the algorithm above is written once and the two stores can't disagree on it.
 * `now` is for the in-memory store; Upstash reads its own clock, as the
 * limiters do (`api/rate-limit.ts`).
 */
export interface DelayStore {
  /** Milliseconds left on `key`, or 0 when it is absent or expired. */
  remainingMs(key: string, now: Date): Promise<number>;
  /** Adds one to `key` (an absent key counts as 0) and returns the new value. */
  increment(key: string, now: Date): Promise<number>;
  /** Makes `key` expire `ms` from now. */
  expireIn(key: string, ms: number, now: Date): Promise<void>;
  /** Sets `key` for `ms` unless it is already set; true when this call set it. */
  setIfAbsent(key: string, ms: number, now: Date): Promise<boolean>;
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
 * 2. The attempt takes the next number in the chain (the first one opens the
 *    15-minute window).
 * 3. Within the free five: go ahead. From the fifth on, the attempt must
 *    close the gate behind it for the next delay; only one caller can (`SET
 *    NX`), so of any number arriving at once, one goes ahead and the rest wait.
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
  const n = await store.increment(chain, now);
  if (n === 1) await store.expireIn(chain, SIGN_IN_DELAY.windowMs, now);
  const delay = delayAfterAttemptMs(n);
  if (delay === 0) return { kind: "allowed" };
  if (!(await store.setIfAbsent(gate, delay, now))) {
    return { kind: "wait", minutes: minutesOf(await store.remainingMs(gate, now)) };
  }
  await store.expireIn(chain, delay + SIGN_IN_DELAY.windowMs, now);
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

/**
 * The in-memory store: local development, tests and the harness, as
 * `inMemoryRateLimiter` is. Per process, so in production the shared store is
 * used (`limiters.ts`).
 */
export function inMemoryDelayStore(): DelayStore {
  const entries = new Map<string, { value: number; expiresAt: number | null }>();
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
    async increment(key, now) {
      const entry = live(key, now) ?? { value: 0, expiresAt: null };
      entry.value += 1;
      entries.set(key, entry);
      return entry.value;
    },
    async expireIn(key, ms, now) {
      const entry = live(key, now);
      if (entry !== undefined) entry.expiresAt = now.getTime() + ms;
    },
    async setIfAbsent(key, ms, now) {
      if (live(key, now) !== undefined) return false;
      entries.set(key, { value: 1, expiresAt: now.getTime() + ms });
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
 * The delay on the shared Upstash store, one Redis command per operation, so
 * each step is atomic across every instance (`SET NX` is what lets exactly one
 * of a burst of attempts through a closed gate). Keys are `<prefix>:` plus the
 * caller's, which are HMACs of addresses, never an address.
 */
export function upstashDelayStore(redis: Redis, prefix: string): DelayStore {
  const at = (key: string) => `${prefix}:${key}`;
  return {
    async remainingMs(key) {
      const ms = await redis.pttl(at(key));
      return ms > 0 ? ms : 0;
    },
    async increment(key) {
      return redis.incr(at(key));
    },
    async expireIn(key, ms) {
      await redis.pexpire(at(key), ms);
    },
    async setIfAbsent(key, ms) {
      return (await redis.set(at(key), "1", { nx: true, px: ms })) === "OK";
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
