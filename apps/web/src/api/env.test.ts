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

    expect(() => validateEnv()).toThrow(/DATABASE_URL/);
    expect(() => validateEnv()).toThrow(/CURSOR_HMAC_SECRET/);
    expect(() => validateEnv()).toThrow(/NEXT_PUBLIC_R2_PUBLIC_BASE_URL/);
  });

  it("does not throw in production once every required secret is set", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@host/db");
    vi.stubEnv("CURSOR_HMAC_SECRET", "a".repeat(32));
    vi.stubEnv("NEXT_PUBLIC_R2_PUBLIC_BASE_URL", "https://cdn.opika.org.ua");

    expect(() => validateEnv()).not.toThrow();
  });

  it("does not throw outside production even if every secret is missing", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("CURSOR_HMAC_SECRET", "");
    vi.stubEnv("NEXT_PUBLIC_R2_PUBLIC_BASE_URL", "");

    expect(() => validateEnv()).not.toThrow();
  });

  it("requires NEXT_PUBLIC_R2_PUBLIC_BASE_URL specifically — H1's runtime dependency, not just the operator script's", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@host/db");
    vi.stubEnv("CURSOR_HMAC_SECRET", "a".repeat(32));
    vi.stubEnv("NEXT_PUBLIC_R2_PUBLIC_BASE_URL", "");

    expect(() => validateEnv()).toThrow(/NEXT_PUBLIC_R2_PUBLIC_BASE_URL/);
  });
});
