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
});
