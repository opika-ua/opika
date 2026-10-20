import type { Redis } from "@upstash/redis";
import { describe, expect, it } from "vitest";
import {
  chargeSignInAttempt,
  clearSignInAttempts,
  type DelayEntry,
  type DelayStore,
  delayAfterAttemptMs,
  inMemoryDelayStore,
  PASSWORD_LIMITS,
  SIGN_IN_DELAY,
  type SignInAttempt,
  upstashDelayStore,
} from "./password-limits";

/**
 * §4.3's numbers, written out: «Забули пароль?» 20 an hour per IP and 3 per address, a reset's
 * POST 20 an hour per IP; the sign-in delay five free attempts in 15 minutes, then 1, 2, 4, 8,
 * then 15 minutes (the cap), no lockout, a success resets it. The clock is moved by hand: no
 * test here waits.
 */
const MINUTE = 60_000;
const KEY = "address:test-key";

describe("the password limits' numbers (§4.3)", () => {
  it("pins the budgets", () => {
    expect(PASSWORD_LIMITS).toEqual({
      forgotPerIp: { windowMs: 60 * MINUTE, maxRequests: 20 },
      forgotPerAddress: { windowMs: 60 * MINUTE, maxRequests: 3 },
      resetPerIp: { windowMs: 60 * MINUTE, maxRequests: 20 },
    });
    expect(SIGN_IN_DELAY).toEqual({
      freeAttempts: 5,
      windowMs: 15 * MINUTE,
      delaysMinutes: [1, 2, 4, 8, 15],
    });
  });

  it("the waits after each attempt: none for four, then 1, 2, 4, 8, 15, 15 … minutes", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 30].map((n) => delayAfterAttemptMs(n) / MINUTE)).toEqual(
      [0, 0, 0, 0, 1, 2, 4, 8, 15, 15, 15],
    );
  });
});

describe("chargeSignInAttempt", () => {
  it("lets five attempts through, then makes each further one wait, longer each time, never past 15 minutes", async () => {
    const store = inMemoryDelayStore();
    let now = new Date("2026-10-20T12:00:00.000Z");
    const attempt = () => chargeSignInAttempt(store, KEY, now);
    for (let i = 0; i < 5; i++) expect(await attempt()).toEqual({ kind: "allowed" });
    for (const minutes of [1, 2, 4, 8, 15, 15, 15]) {
      expect(await attempt()).toEqual({ kind: "wait", minutes });
      now = new Date(now.getTime() + minutes * MINUTE - 1);
      expect((await attempt()).kind, `a millisecond short of ${minutes}`).toBe("wait");
      now = new Date(now.getTime() + 1);
      expect(await attempt(), `after ${minutes}`).toEqual({ kind: "allowed" });
    }
  });

  it("rounds the minutes up, never to zero", async () => {
    const store = inMemoryDelayStore();
    const start = new Date("2026-10-20T12:00:00.000Z");
    for (let i = 0; i < 5; i++) await chargeSignInAttempt(store, KEY, start);
    expect(await chargeSignInAttempt(store, KEY, new Date(start.getTime() + 59_999))).toEqual({
      kind: "wait",
      minutes: 1,
    });
  });

  it("a refused attempt adds nothing: pressing while waiting doesn't lengthen the wait", async () => {
    const store = inMemoryDelayStore();
    let now = new Date("2026-10-20T12:00:00.000Z");
    for (let i = 0; i < 5; i++) await chargeSignInAttempt(store, KEY, now);
    for (let i = 0; i < 10; i++) {
      expect((await chargeSignInAttempt(store, KEY, now)).kind).toBe("wait");
    }
    now = new Date(now.getTime() + MINUTE);
    expect(await chargeSignInAttempt(store, KEY, now)).toEqual({ kind: "allowed" });
    // The sixth attempt went through; the next wait is the second step, 2 minutes.
    expect(await chargeSignInAttempt(store, KEY, now)).toEqual({ kind: "wait", minutes: 2 });
  });

  it("five attempts must fall within 15 minutes of the first to start the delays", async () => {
    const store = inMemoryDelayStore();
    let now = new Date("2026-10-20T12:00:00.000Z");
    for (let i = 0; i < 4; i++) await chargeSignInAttempt(store, KEY, now);
    now = new Date(now.getTime() + 15 * MINUTE);
    for (let i = 0; i < 4; i++) {
      expect(await chargeSignInAttempt(store, KEY, now)).toEqual({ kind: "allowed" });
    }
  });

  it("once delays have started, the count is forgotten 15 minutes after a wait ends with no attempt", async () => {
    const store = inMemoryDelayStore();
    let now = new Date("2026-10-20T12:00:00.000Z");
    for (let i = 0; i < 6; i++) await chargeSignInAttempt(store, KEY, now);
    // The sixth set a 1-minute wait; 15 minutes after it ends, nothing is left.
    now = new Date(now.getTime() + MINUTE + 15 * MINUTE + 1);
    for (let i = 0; i < 5; i++) {
      expect(await chargeSignInAttempt(store, KEY, now)).toEqual({ kind: "allowed" });
    }
  });

  it("a success clears the address: five free attempts again", async () => {
    const store = inMemoryDelayStore();
    const now = new Date("2026-10-20T12:00:00.000Z");
    for (let i = 0; i < 5; i++) await chargeSignInAttempt(store, KEY, now);
    await clearSignInAttempts(store, KEY, now);
    for (let i = 0; i < 5; i++) {
      expect(await chargeSignInAttempt(store, KEY, now)).toEqual({ kind: "allowed" });
    }
  });

  it("addresses don't share a count", async () => {
    const store = inMemoryDelayStore();
    const now = new Date("2026-10-20T12:00:00.000Z");
    for (let i = 0; i < 5; i++) await chargeSignInAttempt(store, KEY, now);
    expect(await chargeSignInAttempt(store, "address:another", now)).toEqual({ kind: "allowed" });
  });
});

/**
 * PW1-F3 (the Tier 1 review of #153, finding 6). Oleksii's requirement, verbatim: "PW1-F3: the
 * sign-in delay counter can lose its expiry. It must never become a permanent lockout or a
 * bypass." A store can fail on any one call of a charge in two ways: the call never reaches it (a
 * lost request: nothing written), or it is applied and its answer is lost (a timeout, or a crash
 * after the write). Every case below fails each call of one attempt in turn, both ways, then
 * reads what the store holds and what the next attempts get. The failed attempt itself is
 * refused: `chargeSignInAttempt` rejects, and the hooks answer that with a minute's wait
 * (`password-flows.test.ts`, "fails closed").
 */
describe("PW1-F3: a store that fails part-way through a charge", () => {
  const START = new Date("2026-10-20T12:00:00.000Z").getTime();
  const at = (ms: number) => new Date(START + ms);
  const CHAIN = `chain:${KEY}`;
  const GATE = `gate:${KEY}`;
  /** The schedule's longest wait, and how long a count is kept past a wait, written out. */
  const LONGEST_WAIT = 15 * MINUTE;
  const KEPT_PAST_A_WAIT = 15 * MINUTE;

  type Failure = { call: number; kind: "lost request" | "lost response" };
  type Counted = DelayStore & { calls: () => number };

  /** `store` with one call failing (counted from 0 across every method), or none. */
  function failing(store: DelayStore, failure: Failure | null): Counted {
    let calls = 0;
    const wrapped = new Proxy(store, {
      get(target, property, receiver) {
        if (property === "calls") return () => calls;
        const method: unknown = Reflect.get(target, property, receiver);
        if (typeof method !== "function") return method;
        return async (...args: unknown[]) => {
          const index = calls++;
          if (failure === null || index !== failure.call) return method.apply(target, args);
          if (failure.kind === "lost request") throw new Error("lost request");
          await method.apply(target, args);
          throw new Error("lost response");
        };
      },
    });
    return wrapped as Counted;
  }

  const charge = (store: DelayStore, ms: number) => chargeSignInAttempt(store, KEY, at(ms));

  /** Where each case starts: it prepares the store and returns when (ms after START) the attempt that fails is made. */
  type Case = { name: string; prepare: (store: DelayStore) => Promise<number> };
  const CASES: Case[] = [
    { name: "the first attempt", prepare: async () => 0 },
    {
      name: "the fifth attempt, which closes the first gate",
      prepare: async (store) => {
        for (let i = 0; i < 4; i++) await charge(store, 0);
        return 0;
      },
    },
    {
      name: "an attempt at the 15-minute cap",
      prepare: async (store) => {
        for (let i = 0; i < 5; i++) await charge(store, 0);
        let t = 0;
        for (const minutes of [1, 2, 4, 8]) {
          t += minutes * MINUTE;
          await charge(store, t);
        }
        return t + 15 * MINUTE;
      },
    },
    {
      name: "an attempt while the gate is closed",
      prepare: async (store) => {
        for (let i = 0; i < 5; i++) await charge(store, 0);
        return 0;
      },
    },
  ];

  /** Every case, as is and on a count left with no expiry (the state PW1-F3 heals). */
  const SEEDS: { name: string; seed: [string, DelayEntry][] }[] = [
    { name: "", seed: [] },
    {
      name: ", on a count of 3 left with no expiry",
      seed: [[CHAIN, { value: 3, expiresAt: null }]],
    },
  ];

  /** A case's store, seeded and prepared; `entries` is what it holds. */
  async function prepared(c: Case, seed: [string, DelayEntry][]) {
    const entries = new Map<string, DelayEntry>(seed.map(([key, entry]) => [key, { ...entry }]));
    const store = inMemoryDelayStore(entries);
    const failAt = await c.prepare(store);
    return { entries, store, failAt };
  }

  const liveAt = (entries: Map<string, DelayEntry>, ms: number) =>
    new Map(
      [...entries]
        .filter(([, e]) => e.expiresAt === null || e.expiresAt > START + ms)
        .map(([key, e]) => [key, { ...e }]),
    );

  /** How many calls the case's attempt makes when nothing fails. */
  async function callsOf(c: Case, seed: [string, DelayEntry][]): Promise<number> {
    const { store, failAt } = await prepared(c, seed);
    const counted = failing(store, null);
    await charge(counted, failAt);
    return counted.calls();
  }

  /** Someone trying twice a minute for two hours from `from`: how many attempts went ahead by each minute. */
  async function persistent(store: DelayStore, from: number): Promise<number[]> {
    const byMinute: number[] = [];
    let through = 0;
    for (let minute = 0; minute <= 120; minute++) {
      for (let i = 0; i < 2; i++) {
        if ((await charge(store, from + minute * MINUTE)).kind === "allowed") through++;
      }
      byMinute.push(through);
    }
    return byMinute;
  }

  const FAILURES = ["lost request", "lost response"] as const;

  for (const c of CASES) {
    for (const { name: seedName, seed } of SEEDS) {
      const title = `${c.name}${seedName}`;

      it(`${title}: any one call failing, either way, leaves every key with an expiry and no count lower`, async () => {
        const calls = await callsOf(c, seed);
        expect(calls).toBeGreaterThan(0);
        for (let call = 0; call < calls; call++) {
          for (const kind of FAILURES) {
            const label = `${title}, call ${call} (${kind})`;
            const { entries, store, failAt } = await prepared(c, seed);
            const before = liveAt(entries, failAt);

            await expect(charge(failing(store, { call, kind }), failAt), label).rejects.toThrow(
              kind,
            );

            // Every key the attempt created or counted has an expiry, and one that had an expiry
            // keeps one: nothing starts counting forever. (A count already left with none, which
            // this attempt never reached, keeps none until its next charge, as below.)
            for (const [key, entry] of entries) {
              const was = before.get(key);
              if (was === undefined || was.expiresAt !== null || was.value !== entry.value) {
                expect(entry.expiresAt, `${label}: ${key} has no expiry`).not.toBeNull();
              }
            }
            // A closed gate keeps its count until 15 minutes past the wait.
            const after = liveAt(entries, failAt);
            const gate = after.get(GATE);
            if (gate !== undefined) {
              expect(
                after.get(CHAIN)?.expiresAt ?? 0,
                `${label}: the count is kept past the gate`,
              ).toBeGreaterThanOrEqual((gate.expiresAt ?? 0) + KEPT_PAST_A_WAIT);
            }
            // Nothing went down: no key gone, no count lower, no expiry earlier (one with none gains one).
            for (const [key, was] of before) {
              const now = after.get(key);
              expect(now, `${label}: ${key} is gone`).toBeDefined();
              expect(now?.value ?? 0, `${label}: ${key}'s count went down`).toBeGreaterThanOrEqual(
                was.value,
              );
              if (was.expiresAt !== null) {
                expect(
                  now?.expiresAt ?? 0,
                  `${label}: ${key} expires sooner`,
                ).toBeGreaterThanOrEqual(was.expiresAt);
              }
            }
          }
        }
      });

      it(`${title}: after any one call fails, no more attempts get through, by any minute of the next two hours, than if it hadn't`, async () => {
        const calls = await callsOf(c, seed);
        for (let call = 0; call < calls; call++) {
          for (const kind of FAILURES) {
            const label = `${title}, call ${call} (${kind})`;
            const broken = await prepared(c, seed);
            await expect(
              charge(failing(broken.store, { call, kind }), broken.failAt),
            ).rejects.toThrow(kind);
            const afterFailure = await persistent(broken.store, broken.failAt);

            const intact = await prepared(c, seed);
            const first = (await charge(intact.store, intact.failAt)).kind === "allowed" ? 1 : 0;
            const unbroken = (await persistent(intact.store, intact.failAt)).map((n) => n + first);

            afterFailure.forEach((through, minute) => {
              expect(through, `${label}: attempts through by minute ${minute}`).toBeLessThanOrEqual(
                unbroken[minute] ?? 0,
              );
            });
          }
        }
      });

      it(`${title}: after any one call fails, waiting what the answer says gets the attempt checked, and a success clears everything`, async () => {
        const calls = await callsOf(c, seed);
        for (let call = 0; call < calls; call++) {
          for (const kind of FAILURES) {
            const label = `${title}, call ${call} (${kind})`;
            const { entries, store, failAt } = await prepared(c, seed);
            await expect(charge(failing(store, { call, kind }), failAt)).rejects.toThrow(kind);

            let t = failAt;
            let answer: SignInAttempt = await charge(store, t);
            if (answer.kind === "wait") {
              expect(answer.minutes * MINUTE, `${label}: the wait`).toBeLessThanOrEqual(
                LONGEST_WAIT,
              );
              t += answer.minutes * MINUTE;
              answer = await charge(store, t);
            }
            expect(answer, `${label}: after one wait`).toEqual({ kind: "allowed" });

            await clearSignInAttempts(store, KEY, at(t));
            expect([...entries.keys()], `${label}: after a success`).toEqual([]);
            for (let i = 0; i < 5; i++) {
              expect(await charge(store, t), `${label}: free attempt ${i + 1}`).toEqual({
                kind: "allowed",
              });
            }
          }
        }
      });
    }
  }
});

describe("PW1-F3: a count left with no expiry by the code before the fix", () => {
  const START = new Date("2026-10-20T12:00:00.000Z").getTime();
  const at = (ms: number) => new Date(START + ms);
  const CHAIN = `chain:${KEY}`;

  // [the count left, when it expires after its next charge, in minutes: the window, or the wait
  // that charge starts plus the 15 minutes kept after it]
  const STUCK: [number, number][] = [
    [1, 15],
    [2, 15],
    [3, 15],
    [4, 1 + 15],
    [7, 8 + 15],
  ];

  it.each(STUCK)(
    "a count of %i with no expiry keeps its count and gains an expiry on its next charge, and is gone %i minutes later",
    async (stuck, expiresInMinutes) => {
      const entries = new Map<string, DelayEntry>([[CHAIN, { value: stuck, expiresAt: null }]]);
      const store = inMemoryDelayStore(entries);
      await chargeSignInAttempt(store, KEY, at(0));
      // Kept, so never a bypass: the earlier attempts still count.
      expect(entries.get(CHAIN)?.value).toBe(stuck + 1);
      expect(entries.get(CHAIN)?.expiresAt).toBe(START + expiresInMinutes * MINUTE);
      // Gone when that passes, so never a lockout: five free attempts again.
      for (let i = 0; i < 5; i++) {
        expect(await chargeSignInAttempt(store, KEY, at(expiresInMinutes * MINUTE))).toEqual({
          kind: "allowed",
        });
      }
    },
  );

  it("a count that has an expiry keeps it: a later charge doesn't move the 15 minutes from the first", async () => {
    const entries = new Map<string, DelayEntry>();
    const store = inMemoryDelayStore(entries);
    await chargeSignInAttempt(store, KEY, at(0));
    await chargeSignInAttempt(store, KEY, at(10 * MINUTE));
    expect(entries.get(CHAIN)).toEqual({ value: 2, expiresAt: START + 15 * MINUTE });
  });
});

/**
 * What `upstashDelayStore` sends, to a client that answers only `eval`, `pttl` and `del`. This
 * checks the calls' shape, not Redis: what the two scripts do on a real store is for
 * `scripts/sign-in-delay-smoke.ts` to show, run against Upstash itself.
 */
describe("upstashDelayStore: each write is one script", () => {
  function fakeRedis(replies: unknown[]) {
    const sent: { script: string; keys: string[]; args: unknown[] }[] = [];
    const redis = {
      eval: async (script: string, keys: string[], args: unknown[]) => {
        sent.push({ script, keys, args });
        return replies.shift();
      },
      pttl: async () => -2,
      del: async () => 0,
    };
    // No `incr`, `pexpire` or `set`: a store that sent the count, its expiry or the gate as a
    // command of its own fails here with "not a function".
    return { redis: redis as unknown as Redis, sent };
  }

  it("increment: one script on the prefixed key, carrying the expiry for a key that has none", async () => {
    const { redis, sent } = fakeRedis([3]);
    const store = upstashDelayStore(redis, "p");
    expect(await store.increment("chain:k", 900_000, new Date())).toBe(3);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.keys).toEqual(["p:chain:k"]);
    expect(sent[0]?.args).toEqual([900_000]);
    expect(sent[0]?.script).toMatch(/INCR[\s\S]*PTTL[\s\S]*PEXPIRE/);
  });

  it("setIfAbsent: one script on the gate and the count; 1 is set, 0 is not", async () => {
    const { redis, sent } = fakeRedis([1, 0]);
    const store = upstashDelayStore(redis, "p");
    const keep = { key: "chain:k", ms: 960_000 };
    expect(await store.setIfAbsent("gate:k", 60_000, keep, new Date())).toBe(true);
    expect(await store.setIfAbsent("gate:k", 60_000, keep, new Date())).toBe(false);
    expect(sent.map((s) => s.keys)).toEqual([
      ["p:gate:k", "p:chain:k"],
      ["p:gate:k", "p:chain:k"],
    ]);
    expect(sent.map((s) => s.args)).toEqual([
      [60_000, 960_000],
      [60_000, 960_000],
    ]);
    expect(sent[0]?.script).toMatch(/SET[\s\S]*NX[\s\S]*PX[\s\S]*PEXPIRE/);
  });

  it("an integer reply sent as text reads as the integer", async () => {
    const { redis } = fakeRedis(["4", "1"]);
    const store = upstashDelayStore(redis, "p");
    expect(await store.increment("chain:k", 900_000, new Date())).toBe(4);
    const keep = { key: "chain:k", ms: 1 };
    expect(await store.setIfAbsent("gate:k", 60_000, keep, new Date())).toBe(true);
  });

  it.each([null, undefined, "OK", "", [1], 1.5, 0, -1])(
    "a reply of %j to increment throws (the attempt is refused), never read as a count",
    async (reply) => {
      const { redis } = fakeRedis([reply]);
      const store = upstashDelayStore(redis, "p");
      await expect(store.increment("chain:k", 900_000, new Date())).rejects.toThrow(
        /sign-in delay store/,
      );
    },
  );

  it.each([null, "OK", "", [1], 2, -1, true])(
    "a reply of %j to setIfAbsent throws (the attempt is refused), never read as a gate",
    async (reply) => {
      const { redis } = fakeRedis([reply]);
      const store = upstashDelayStore(redis, "p");
      const keep = { key: "chain:k", ms: 1 };
      await expect(store.setIfAbsent("gate:k", 60_000, keep, new Date())).rejects.toThrow(
        /sign-in delay store/,
      );
    },
  );
});
