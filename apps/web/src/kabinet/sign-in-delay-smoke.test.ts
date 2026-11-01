import type { Redis } from "@upstash/redis";
import { describe, expect, it } from "vitest";
import {
  runDelaySmoke,
  SMOKE_FLAG,
  SMOKE_KEYS,
  smokeRefusalOf,
} from "../../scripts/sign-in-delay-smoke";

/**
 * The PW1-F3 smoke (`scripts/sign-in-delay-smoke.ts`) writes to the shared Upstash store, so
 * what it may touch is pinned here; whether its checks pass is for a run against a real store.
 */
describe("the sign-in delay smoke", () => {
  it("refuses without its flag, and without credentials", () => {
    expect(smokeRefusalOf([], true)).toContain(SMOKE_FLAG);
    expect(smokeRefusalOf(["--write"], true)).toContain(SMOKE_FLAG);
    expect(smokeRefusalOf([SMOKE_FLAG], false)).toContain("KV_REST_API_URL");
    expect(smokeRefusalOf([SMOKE_FLAG], true)).toBeNull();
  });

  it("writes only keys under its own prefix that its clean-up deletes, never the delay's own", async () => {
    const written = new Set<string>();
    const redis = {
      set: async (key: string) => {
        written.add(key);
        return "OK";
      },
      eval: async (_script: string, keys: string[]) => {
        for (const key of keys) written.add(key);
        return 1;
      },
      pttl: async () => -1,
      exists: async () => 0,
      del: async (...keys: string[]) => {
        for (const key of keys) written.add(key);
        return 0;
      },
    } as unknown as Redis;
    const prefix = "opika-smoke-sign-in-delay-0a1b2c3d-unknown";
    await runDelaySmoke(redis, prefix);
    const allowed = new Set(SMOKE_KEYS.map((key) => `${prefix}:${key}`));
    expect(written.size).toBeGreaterThan(0);
    for (const key of written) {
      expect(allowed.has(key), key).toBe(true);
      expect(key).not.toMatch(/^opika-kabinet-sign-in-delay-/);
    }
  });
});
