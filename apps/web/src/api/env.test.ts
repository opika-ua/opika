import { afterEach, describe, expect, it, vi } from "vitest";
import { productionSignInOf } from "../kabinet/production-sign-in";
import { assertBuildEnv } from "./build-env";
import { validateEnv } from "./env";

/**
 * `validateEnv` is the boot-time check `instrumentation.ts` calls — see that
 * file and `env.ts`'s own comment for why it only applies in production.
 * `vi.stubEnv` (not direct `process.env` assignment: `NODE_ENV` is typed
 * read-only by `@types/node`) plus `vi.unstubAllEnvs()` in `afterEach`
 * restores the real environment after every test, the same guarantee
 * `test-harness.ts` gives by hand for `CURSOR_HMAC_SECRET`.
 */
/** Production sign-in's variables in the shape Oleksii reported setting (2026-10-15), example secrets. */
const SIGN_IN = {
  EMAIL_PROVIDER: "resend",
  RESEND_API_KEY: "re_example_key",
  EMAIL_FROM_ADDRESS: "noreply@mail.opika.org.ua",
  EMAIL_FROM_NAME: "Opika",
  EMAIL_REPLY_TO: "hello@opika.org.ua",
  PRODUCTION_ORIGIN: "https://opika.org.ua",
  BETTER_AUTH_SECRET: "b".repeat(64),
  BETTER_AUTH_URL: "https://opika.org.ua",
} as const;
/** The photo upload variables (P-Q10), production only; example values, not credentials. */
const UPLOAD = {
  R2_ACCOUNT_ID: "example-account-id",
  R2_BUCKET_NAME: "example-photo-bucket",
  R2_UPLOAD_ACCESS_KEY_ID: "example-upload-key-id",
  R2_UPLOAD_SECRET_ACCESS_KEY: "example-upload-secret-value",
} as const;

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
    // Valid by default (every Vercel deployment needs it, EM-B6); the
    // RATE_LIMIT_KEY_SECRET cases below clear it to test it alone.
    vi.stubEnv("RATE_LIMIT_KEY_SECRET", "r".repeat(32));
    // Valid by default too (read on a production deployment only): the
    // location key (RG-Q10) and production sign-in's variables (IN-R2,
    // Decision 1), each cleared by its own cases below.
    vi.stubEnv("LOCATION_HMAC_SECRET", "l".repeat(32));
    for (const [name, value] of Object.entries(SIGN_IN)) vi.stubEnv(name, value);
    for (const [name, value] of Object.entries(UPLOAD)) vi.stubEnv(name, value);
    vi.stubEnv("EMAIL_SIGN_IN_PROVIDER", "");
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

  describe("CRON_SECRET (KH-Q9)", () => {
    function productionWithUpstash(): void {
      setBaseRequiredEnv();
      vi.stubEnv("KV_REST_API_URL", "https://example-upstash.example.com");
      vi.stubEnv("KV_REST_API_TOKEN", "a-real-looking-token");
    }

    it("is required on a production deployment (VERCEL_ENV=production)", () => {
      productionWithUpstash();
      vi.stubEnv("VERCEL_ENV", "production");
      vi.stubEnv("CRON_SECRET", "");
      expect(() => validateEnv()).toThrow(/CRON_SECRET must be at least 32 characters/);
    });

    it("rejects one under 32 characters, and accepts exactly 32", () => {
      productionWithUpstash();
      vi.stubEnv("VERCEL_ENV", "production");
      vi.stubEnv("CRON_SECRET", "a".repeat(31));
      expect(() => validateEnv()).toThrow(/CRON_SECRET/);
      vi.stubEnv("CRON_SECRET", "a".repeat(32));
      vi.stubEnv("RATE_LIMIT_KEY_SECRET", "r".repeat(32));
      expect(() => validateEnv()).not.toThrow();
    });

    it("is not required on a Preview (no cron runs there) or under the harness's next start", () => {
      productionWithUpstash();
      vi.stubEnv("CRON_SECRET", "");
      vi.stubEnv("VERCEL_ENV", "preview");
      expect(() => validateEnv()).not.toThrow();
      vi.stubEnv("VERCEL_ENV", "");
      vi.stubEnv("VERCEL", "");
      expect(() => validateEnv()).not.toThrow();
    });
  });
  describe("RATE_LIMIT_KEY_SECRET (EM-Q11)", () => {
    function productionWithUpstashAndCron(): void {
      setBaseRequiredEnv();
      vi.stubEnv("KV_REST_API_URL", "https://example-upstash.example.com");
      vi.stubEnv("KV_REST_API_TOKEN", "a-real-looking-token");
      vi.stubEnv("CRON_SECRET", "a".repeat(32));
    }

    it("is required on a production deployment, at 32 characters or more", () => {
      productionWithUpstashAndCron();
      vi.stubEnv("VERCEL_ENV", "production");
      vi.stubEnv("RATE_LIMIT_KEY_SECRET", "");
      expect(() => validateEnv()).toThrow(/RATE_LIMIT_KEY_SECRET must be at least 32 characters/);
      vi.stubEnv("RATE_LIMIT_KEY_SECRET", "r".repeat(31));
      expect(() => validateEnv()).toThrow(/RATE_LIMIT_KEY_SECRET/);
      vi.stubEnv("RATE_LIMIT_KEY_SECRET", "r".repeat(32));
      expect(() => validateEnv()).not.toThrow();
    });

    it("names both production secrets in one error when both are missing", () => {
      productionWithUpstashAndCron();
      vi.stubEnv("VERCEL_ENV", "production");
      vi.stubEnv("CRON_SECRET", "");
      vi.stubEnv("RATE_LIMIT_KEY_SECRET", "");
      expect(() => validateEnv()).toThrow(/CRON_SECRET[\s\S]*RATE_LIMIT_KEY_SECRET/);
    });

    /** EM-B6 (Oleksii, 2026-10-15): "required on every Vercel deployment, including Preview". */
    it("is required on a Preview too, naming the variable, and accepts 32 characters there", () => {
      productionWithUpstashAndCron();
      vi.stubEnv("VERCEL", "1");
      vi.stubEnv("VERCEL_ENV", "preview");
      vi.stubEnv("RATE_LIMIT_KEY_SECRET", "");
      expect(() => validateEnv()).toThrow(/RATE_LIMIT_KEY_SECRET must be at least 32 characters/);
      vi.stubEnv("RATE_LIMIT_KEY_SECRET", "r".repeat(31));
      expect(() => validateEnv()).toThrow(/RATE_LIMIT_KEY_SECRET/);
      vi.stubEnv("RATE_LIMIT_KEY_SECRET", "r".repeat(32));
      expect(() => validateEnv()).not.toThrow();
    });

    it("is not required under the harness's next start (no VERCEL, no VERCEL_ENV)", () => {
      productionWithUpstashAndCron();
      vi.stubEnv("RATE_LIMIT_KEY_SECRET", "");
      vi.stubEnv("VERCEL_ENV", "");
      vi.stubEnv("VERCEL", "");
      expect(() => validateEnv()).not.toThrow();
    });
  });

  /**
   * IN-R2, Decision 1 (Oleksii, verbatim: "Keep the runtime boot check as a
   * second guard."): the build's rule (`signInEnvProblems`) against the
   * server's own environment, production deployments only.
   */
  describe("production sign-in's variables (IN-R2, Decision 1)", () => {
    function production(): void {
      setBaseRequiredEnv();
      vi.stubEnv("KV_REST_API_URL", "https://example-upstash.example.com");
      vi.stubEnv("KV_REST_API_TOKEN", "a-real-looking-token");
      vi.stubEnv("CRON_SECRET", "a".repeat(32));
      vi.stubEnv("VERCEL", "1");
      vi.stubEnv("VERCEL_ENV", "production");
    }

    it("boots with the values Oleksii reported (apex URLs, no trailing slash)", () => {
      production();
      expect(() => validateEnv()).not.toThrow();
    });

    it.each([
      "EMAIL_PROVIDER",
      "RESEND_API_KEY",
      "EMAIL_FROM_ADDRESS",
      "EMAIL_REPLY_TO",
      "PRODUCTION_ORIGIN",
      "BETTER_AUTH_SECRET",
      "BETTER_AUTH_URL",
    ])("refuses to boot a production deployment without %s, naming it", (name) => {
      production();
      vi.stubEnv(name, "");
      expect(() => validateEnv()).toThrow(new RegExp(`production sign-in: .*${name}`));
    });

    it("refuses a present but wrong value, naming the problem and never the value", () => {
      production();
      vi.stubEnv("BETTER_AUTH_URL", "https://www.opika.org.ua");
      expect(() => validateEnv()).toThrow(/BETTER_AUTH_URL must be PRODUCTION_ORIGIN/);
      vi.stubEnv("BETTER_AUTH_URL", SIGN_IN.BETTER_AUTH_URL);
      vi.stubEnv("BETTER_AUTH_SECRET", "b".repeat(31));
      expect(() => validateEnv()).toThrow(/BETTER_AUTH_SECRET must be at least 32 characters/);
      vi.stubEnv("BETTER_AUTH_SECRET", SIGN_IN.BETTER_AUTH_SECRET);
      vi.stubEnv("EMAIL_SIGN_IN_PROVIDER", "brevo");
      let message = "";
      try {
        validateEnv();
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toMatch(/EMAIL_SIGN_IN_PROVIDER=brevo needs BREVO_API_KEY/);
      expect(message).not.toContain(SIGN_IN.RESEND_API_KEY);
    });

    it("is not required on a Preview or under the harness's next start", () => {
      production();
      for (const name of Object.keys(SIGN_IN)) vi.stubEnv(name, "");
      vi.stubEnv("VERCEL_ENV", "preview");
      expect(() => validateEnv()).not.toThrow();
      vi.stubEnv("VERCEL_ENV", "");
      vi.stubEnv("VERCEL", "");
      expect(() => validateEnv()).not.toThrow();
    });
  });

  /** RG-Q10 (Oleksii, verbatim: "the invite PR adds it to the required prod env schema"). */
  describe("the photo upload variables (P-Q10)", () => {
    it("a production deployment refuses to boot without one of them, naming it", () => {
      setBaseRequiredEnv();
      vi.stubEnv("VERCEL", "1");
      vi.stubEnv("VERCEL_ENV", "production");
      vi.stubEnv("KV_REST_API_URL", "https://example-upstash.example.com");
      vi.stubEnv("KV_REST_API_TOKEN", "a-real-looking-token");
      vi.stubEnv("CRON_SECRET", "c".repeat(32));
      expect(() => validateEnv()).not.toThrow();
      vi.stubEnv("R2_UPLOAD_SECRET_ACCESS_KEY", "");
      expect(() => validateEnv()).toThrow(/R2_UPLOAD_SECRET_ACCESS_KEY must be set/);
    });

    it("a Preview boots without any of them (uploads are off there)", () => {
      setBaseRequiredEnv();
      vi.stubEnv("VERCEL", "1");
      vi.stubEnv("VERCEL_ENV", "preview");
      vi.stubEnv("KV_REST_API_URL", "https://example-upstash.example.com");
      vi.stubEnv("KV_REST_API_TOKEN", "a-real-looking-token");
      for (const name of Object.keys(UPLOAD)) vi.stubEnv(name, "");
      expect(() => validateEnv()).not.toThrow();
    });
  });

  describe("LOCATION_HMAC_SECRET (RG-Q10)", () => {
    function production(): void {
      setBaseRequiredEnv();
      vi.stubEnv("KV_REST_API_URL", "https://example-upstash.example.com");
      vi.stubEnv("KV_REST_API_TOKEN", "a-real-looking-token");
      vi.stubEnv("CRON_SECRET", "a".repeat(32));
      vi.stubEnv("VERCEL", "1");
      vi.stubEnv("VERCEL_ENV", "production");
    }

    it("is required on a production deployment, at 32 characters or more, and never says to generate a new one", () => {
      production();
      vi.stubEnv("LOCATION_HMAC_SECRET", "");
      expect(() => validateEnv()).toThrow(/LOCATION_HMAC_SECRET must be at least 32 characters/);
      expect(() => validateEnv()).toThrow(/same value the onboarding script uses/);
      expect(() => validateEnv()).not.toThrow(/LOCATION_HMAC_SECRET[^;]*generate/);
      vi.stubEnv("LOCATION_HMAC_SECRET", "l".repeat(31));
      expect(() => validateEnv()).toThrow(/LOCATION_HMAC_SECRET/);
      vi.stubEnv("LOCATION_HMAC_SECRET", "l".repeat(32));
      expect(() => validateEnv()).not.toThrow();
    });

    /** A Preview never signs in, so never reaches the registry, and holds no copy of the key. */
    it("is not required on a Preview or under the harness's next start", () => {
      production();
      vi.stubEnv("LOCATION_HMAC_SECRET", "");
      vi.stubEnv("VERCEL_ENV", "preview");
      expect(() => validateEnv()).not.toThrow();
      vi.stubEnv("VERCEL_ENV", "");
      vi.stubEnv("VERCEL", "");
      expect(() => validateEnv()).not.toThrow();
    });
  });
});

/**
 * WI-Q1's whitespace note (Oleksii, 2026-10-15, verbatim: "make the build and
 * startup checks share one rule so a value can't pass one and fail the
 * other"): every variable the build checks, set blank or padded, is refused by
 * the build (`assertBuildEnv`), by the boot (`validateEnv`) and, for sign-in's,
 * by production sign-in itself (`productionSignInOf`), each naming the
 * variable and never its value. One deployment's environment, handed to all
 * three.
 */
describe("build, boot and production sign-in read each value by one rule (WI-Q1)", () => {
  const deployment: Record<string, string> = {
    NODE_ENV: "production",
    VERCEL: "1",
    VERCEL_ENV: "production",
    DATABASE_URL: "postgres://user:pass@host/db",
    CURSOR_HMAC_SECRET: "a".repeat(32),
    PRELAUNCH_GATE_SECRET: "p".repeat(32),
    NEXT_PUBLIC_R2_PUBLIC_BASE_URL: "https://cdn.opika.org.ua",
    KV_REST_API_URL: "https://example-upstash.example.com",
    KV_REST_API_TOKEN: "a-real-looking-token",
    CRON_SECRET: "c".repeat(32),
    RATE_LIMIT_KEY_SECRET: "r".repeat(32),
    LOCATION_HMAC_SECRET: "l".repeat(32),
    ...SIGN_IN,
    ...UPLOAD,
  };
  const SIGN_IN_NAMES = Object.keys(SIGN_IN).filter((name) => name !== "EMAIL_FROM_NAME");
  const CHECKED = [
    "CRON_SECRET",
    "RATE_LIMIT_KEY_SECRET",
    "LOCATION_HMAC_SECRET",
    "NEXT_PUBLIC_R2_PUBLIC_BASE_URL",
    ...SIGN_IN_NAMES,
    ...Object.keys(UPLOAD),
  ];

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const buildMessage = (env: Record<string, string>) => {
    try {
      assertBuildEnv(env);
    } catch (error) {
      return (error as Error).message;
    }
    return "";
  };
  const bootMessage = (env: Record<string, string>) => {
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
    vi.stubEnv("EMAIL_SIGN_IN_PROVIDER", "");
    try {
      validateEnv();
    } catch (error) {
      return (error as Error).message;
    }
    return "";
  };

  /**
   * K-Q17: `KABINET_WRITE_ALLOWLIST` is optional, so blank means unset and
   * passes both; a padded or malformed value, or a second id, is refused by
   * both, by name.
   */
  it("KABINET_WRITE_ALLOWLIST: one id or blank passes build and boot, padded, malformed or two ids fails both", () => {
    const id = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    for (const ok of [id, " ".repeat(4)]) {
      const env = { ...deployment, KABINET_WRITE_ALLOWLIST: ok };
      expect(buildMessage(env)).toBe("");
      expect(bootMessage(env)).toBe("");
    }
    for (const bad of [
      `${id}
`,
      ` ${id}`,
      `${id},${id.replaceAll("d", "e")}`,
      `${id}, ${id.replaceAll("d", "e")}`,
      id.toUpperCase(),
    ]) {
      const env = { ...deployment, KABINET_WRITE_ALLOWLIST: bad };
      for (const message of [buildMessage(env), bootMessage(env)]) {
        expect(message).toContain("KABINET_WRITE_ALLOWLIST");
        expect(message.toLowerCase()).not.toContain("dddddddd");
      }
    }
  });

  it("the deployment itself passes all three", () => {
    expect(buildMessage(deployment)).toBe("");
    expect(bootMessage(deployment)).toBe("");
    expect(productionSignInOf(deployment, []).kind).toBe("on");
  });

  it.each(
    CHECKED.flatMap((name) => [
      [name, "whitespace only", " ".repeat(40)],
      [name, "a leading space", ` ${deployment[name]}`],
      [name, "a trailing line break", `${deployment[name]}\n`],
    ]),
  )("%s with %s: refused by build and boot alike, naming it", (name, _label, value) => {
    const env = { ...deployment, [name]: value };
    const build = buildMessage(env);
    const boot = bootMessage(env);
    for (const [path, message] of [
      ["build", build],
      ["boot", boot],
    ]) {
      expect(message, path).toContain(name);
      // The value never reaches the message (blank values carry nothing to leak).
      if (value.trim() !== "") expect(message, path).not.toContain(value.trim());
    }
    if (SIGN_IN_NAMES.includes(name)) {
      expect(productionSignInOf(env, []).kind, "productionSignInOf").toBe("off");
    }
  });
});
