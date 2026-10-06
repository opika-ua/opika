import { afterEach, describe, expect, it, vi } from "vitest";
import { validateEnv } from "./env";

/**
 * `validateEnv` is the boot-time check `instrumentation.ts` calls — see that
 * file and `env.ts`'s own comment for why it only applies in production.
 * `vi.stubEnv` (not direct `process.env` assignment: `NODE_ENV` is typed
 * read-only by `@types/node`) plus `vi.unstubAllEnvs()` in `afterEach`
 * restores the real environment after every test, the same guarantee
 * `test-harness.ts` gives by hand for `CURSOR_HMAC_SECRET`.
 */
describe("validateEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("throws naming every missing secret when NODE_ENV is production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("CURSOR_HMAC_SECRET", "");
    vi.stubEnv("NEXT_PUBLIC_R2_PUBLIC_BASE_URL", "");
    vi.stubEnv("PRELAUNCH_GATE_SECRET", "");

    expect(() => validateEnv()).toThrow(/DATABASE_URL/);
    expect(() => validateEnv()).toThrow(/CURSOR_HMAC_SECRET/);
    expect(() => validateEnv()).toThrow(/NEXT_PUBLIC_R2_PUBLIC_BASE_URL/);
    expect(() => validateEnv()).toThrow(/PRELAUNCH_GATE_SECRET/);
  });

  it("does not throw in production once every required secret is set", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@host/db");
    vi.stubEnv("CURSOR_HMAC_SECRET", "a".repeat(32));
    vi.stubEnv("NEXT_PUBLIC_R2_PUBLIC_BASE_URL", "https://cdn.opika.org.ua");
    vi.stubEnv("PRELAUNCH_GATE_SECRET", "a".repeat(32));

    expect(() => validateEnv()).not.toThrow();
  });

  it("does not throw outside production even if every secret is missing", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("CURSOR_HMAC_SECRET", "");
    vi.stubEnv("NEXT_PUBLIC_R2_PUBLIC_BASE_URL", "");
    vi.stubEnv("PRELAUNCH_GATE_SECRET", "");

    expect(() => validateEnv()).not.toThrow();
  });

  it("requires NEXT_PUBLIC_R2_PUBLIC_BASE_URL specifically — H1's runtime dependency, not just the operator script's", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@host/db");
    vi.stubEnv("CURSOR_HMAC_SECRET", "a".repeat(32));
    vi.stubEnv("NEXT_PUBLIC_R2_PUBLIC_BASE_URL", "");
    vi.stubEnv("PRELAUNCH_GATE_SECRET", "a".repeat(32));

    expect(() => validateEnv()).toThrow(/NEXT_PUBLIC_R2_PUBLIC_BASE_URL/);
  });

  it("requires PRELAUNCH_GATE_SECRET specifically — proxy.ts reads it on every request while the site is not publicly discoverable", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@host/db");
    vi.stubEnv("CURSOR_HMAC_SECRET", "a".repeat(32));
    vi.stubEnv("NEXT_PUBLIC_R2_PUBLIC_BASE_URL", "https://cdn.opika.org.ua");
    vi.stubEnv("PRELAUNCH_GATE_SECRET", "");

    expect(() => validateEnv()).toThrow(/PRELAUNCH_GATE_SECRET/);
  });

  it("rejects a PRELAUNCH_GATE_SECRET under 32 characters — Oleksii's own floor, 'a short gate is guessable by exactly the traffic it exists to stop', with a message naming the actual reason, not a generic 'missing'", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@host/db");
    vi.stubEnv("CURSOR_HMAC_SECRET", "a".repeat(32));
    vi.stubEnv("NEXT_PUBLIC_R2_PUBLIC_BASE_URL", "https://cdn.opika.org.ua");
    vi.stubEnv("PRELAUNCH_GATE_SECRET", "a".repeat(31));

    // A variable that IS set but too short must not be reported as
    // "missing" — an operator checking Vercel would find it genuinely
    // present and have no way to learn why boot still refused it.
    expect(() => validateEnv()).toThrow(/PRELAUNCH_GATE_SECRET must be at least 32 characters/);
  });

  it("accepts a PRELAUNCH_GATE_SECRET at exactly the 32-character floor", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@host/db");
    vi.stubEnv("CURSOR_HMAC_SECRET", "a".repeat(32));
    vi.stubEnv("NEXT_PUBLIC_R2_PUBLIC_BASE_URL", "https://cdn.opika.org.ua");
    vi.stubEnv("PRELAUNCH_GATE_SECRET", "a".repeat(32));

    expect(() => validateEnv()).not.toThrow();
  });

  /**
   * Phase 3, block 4 — the Upstash rate-limiter credentials are
   * deliberately NOT part of `RequiredProductionEnvSchema` (see that
   * schema's own comment): they're gated on `process.env.VERCEL`/
   * `VERCEL_ENV`, not `NODE_ENV` alone, so the Playwright harness's own
   * `next start` (which sets `NODE_ENV=production` with no Vercel env
   * variable and no live Upstash account) can keep passing without them.
   *
   * Two accepted name pairs, confirmed against this project's own real
   * Vercel provisioning (not assumed): `KV_REST_API_URL`/`KV_REST_API_
   * TOKEN` is what Vercel's Storage marketplace integration actually
   * injects when Upstash for Redis is connected that way — the path this
   * project used. `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`
   * (Upstash's own naming) is kept as a fallback. Every test below clears
   * all four variables first, so a leftover value from a prior test (or
   * from whatever shell actually ran this suite) can't make a "should
   * throw" case pass by accident.
   */
  function setBaseRequiredEnv(): void {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@host/db");
    vi.stubEnv("CURSOR_HMAC_SECRET", "a".repeat(32));
    vi.stubEnv("NEXT_PUBLIC_R2_PUBLIC_BASE_URL", "https://cdn.opika.org.ua");
    vi.stubEnv("PRELAUNCH_GATE_SECRET", "a".repeat(32));
    vi.stubEnv("KV_REST_API_URL", "");
    vi.stubEnv("KV_REST_API_TOKEN", "");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  }

  it("does not require Upstash credentials when VERCEL/VERCEL_ENV are unset — the harness's own next start", () => {
    setBaseRequiredEnv();
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("VERCEL_ENV", "");

    expect(() => validateEnv()).not.toThrow();
  });

  it("requires Upstash credentials (either naming) on a real Vercel deployment (VERCEL set)", () => {
    setBaseRequiredEnv();
    vi.stubEnv("VERCEL", "1");

    expect(() => validateEnv()).toThrow(/KV_REST_API_URL/);
  });

  it("requires Upstash credentials (either naming) on a real Vercel deployment (VERCEL_ENV set, VERCEL unset)", () => {
    setBaseRequiredEnv();
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("VERCEL_ENV", "preview");

    expect(() => validateEnv()).toThrow(/UPSTASH_REDIS_REST_TOKEN/);
  });

  it("does not throw once KV_REST_API_URL/TOKEN are set — Vercel's own Storage integration naming", () => {
    setBaseRequiredEnv();
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("KV_REST_API_URL", "https://example-upstash.example.com");
    vi.stubEnv("KV_REST_API_TOKEN", "a-real-looking-token");

    expect(() => validateEnv()).not.toThrow();
  });

  it("does not throw once UPSTASH_REDIS_REST_URL/TOKEN are set — Upstash's own naming", () => {
    setBaseRequiredEnv();
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example-upstash.example.com");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "a-real-looking-token");

    expect(() => validateEnv()).not.toThrow();
  });

  /**
   * Tier 1 review's medium finding, now applied to both naming pairs: a
   * test that only ever sets *neither* variable in a pair can't distinguish
   * `!URL || !TOKEN` (correct — throws unless both are present) from a
   * regressed `!URL && !TOKEN` (throws only if *neither* is present,
   * silently accepting exactly one) — both conditions agree on the "both
   * missing" and "both present" cases and disagree only when exactly one is
   * set. These are what actually pin `||` over that specific wrong
   * mutation, for each naming pair independently.
   */
  it.each([
    ["KV_REST_API_URL only", "KV_REST_API_URL", "KV_REST_API_TOKEN"],
    ["KV_REST_API_TOKEN only", "KV_REST_API_TOKEN", "KV_REST_API_URL"],
    ["UPSTASH_REDIS_REST_URL only", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
    ["UPSTASH_REDIS_REST_TOKEN only", "UPSTASH_REDIS_REST_TOKEN", "UPSTASH_REDIS_REST_URL"],
  ])(
    "still throws on a real Vercel deployment when only %s is set, neither pair complete",
    (_label, setVar) => {
      setBaseRequiredEnv();
      vi.stubEnv("VERCEL", "1");
      vi.stubEnv(setVar, "some-value");

      expect(() => validateEnv()).toThrow();
    },
  );

  it("still throws when one half of each pair is set, but no pair is actually complete", () => {
    setBaseRequiredEnv();
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("KV_REST_API_URL", "https://example-upstash.example.com");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "a-real-looking-token");

    expect(() => validateEnv()).toThrow();
  });
});
