import { describe, expect, it } from "vitest";
import { photoUploadConfigOf, photoUploadEnvProblem } from "../kabinet/photo-upload-env";
import { signInEnvProblems } from "../kabinet/sign-in-env";
import {
  assertBuildEnv,
  CRON_SECRET_MIN_LENGTH,
  cronSecretProblem,
  locationSecretProblem,
  rateLimitKeySecretProblem,
} from "./build-env";

/**
 * `assertBuildEnv` is what `next.config.ts` runs when a build loads it (KH-T6:
 * "a production build fails without CRON_SECRET ≥32 chars"). Plain objects
 * stand in for the build's environment; nothing here reads `process.env`.
 */
const R2 = { NEXT_PUBLIC_R2_PUBLIC_BASE_URL: "https://cdn.example.test" };
/** The other build-checked secret, valid, so a CRON_SECRET case tests only CRON_SECRET. */
const RATE_KEY = { RATE_LIMIT_KEY_SECRET: "r".repeat(32) };
/** Production-only since WI-T2, valid, so a case for another variable tests only that one. */
const LOCATION = { LOCATION_HMAC_SECRET: "l".repeat(32) };
/**
 * The photo upload variables (P-Q10), production only, valid, so a case for
 * another variable tests only that one. Example values, not credentials.
 */
const UPLOAD = {
  R2_ACCOUNT_ID: "example-account-id",
  R2_BUCKET_NAME: "example-photo-bucket",
  R2_UPLOAD_ACCESS_KEY_ID: "example-upload-key-id",
  R2_UPLOAD_SECRET_ACCESS_KEY: "example-upload-secret-value",
  R2_CLEANUP_ACCESS_KEY_ID: "example-cleanup-key-id",
  R2_CLEANUP_SECRET_ACCESS_KEY: "example-cleanup-secret-value",
} as const;
// A recognisable value, so a test can show it never reaches the message.
const SHORT_SECRET = "short-secret-value-0123456789ab"; // 31 characters
/**
 * Production sign-in's variables in the shape Oleksii reported setting in
 * Vercel Production (2026-10-15: apex URLs with no trailing slash, the From
 * address on mail., the Reply-To on the apex, the From name), with example
 * secrets. Valid, so a production case for another variable tests only that
 * one.
 */
const SIGN_IN = {
  EMAIL_PROVIDER: "resend",
  RESEND_API_KEY: "re_example_key_not_real",
  EMAIL_FROM_ADDRESS: "noreply@mail.opika.org.ua",
  EMAIL_FROM_NAME: "Opika",
  EMAIL_REPLY_TO: "hello@opika.org.ua",
  PRODUCTION_ORIGIN: "https://opika.org.ua",
  BETTER_AUTH_SECRET: "b".repeat(64),
  BETTER_AUTH_URL: "https://opika.org.ua",
} as const;

describe("assertBuildEnv: CRON_SECRET on a production build", () => {
  it("the fixture is one under the floor, and the floor is 32", () => {
    expect(SHORT_SECRET).toHaveLength(31);
    expect(CRON_SECRET_MIN_LENGTH).toBe(32);
  });

  it("fails a production build with no CRON_SECRET, naming the variable", () => {
    expect(() => assertBuildEnv({ VERCEL: "1", VERCEL_ENV: "production", ...R2 })).toThrow(
      /CRON_SECRET must be at least 32 characters/,
    );
  });

  it("fails one with an empty CRON_SECRET", () => {
    expect(() =>
      assertBuildEnv({ VERCEL: "1", VERCEL_ENV: "production", CRON_SECRET: "", ...R2 }),
    ).toThrow(/CRON_SECRET/);
  });

  it("fails one with a 31-character CRON_SECRET, and never prints the value", () => {
    let message = "";
    try {
      assertBuildEnv({ VERCEL: "1", VERCEL_ENV: "production", CRON_SECRET: SHORT_SECRET, ...R2 });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/CRON_SECRET must be at least 32 characters/);
    expect(message).not.toContain(SHORT_SECRET);
    expect(message).not.toContain(SHORT_SECRET.slice(0, 8));
  });

  it("builds with exactly 32 characters", () => {
    expect(() =>
      assertBuildEnv({
        VERCEL: "1",
        VERCEL_ENV: "production",
        CRON_SECRET: `${SHORT_SECRET}c`,
        ...RATE_KEY,
        ...LOCATION,
        ...R2,
        ...SIGN_IN,
        ...UPLOAD,
      }),
    ).not.toThrow();
  });

  it("names both problems at once when R2 is missing as well", () => {
    expect(() => assertBuildEnv({ VERCEL: "1", VERCEL_ENV: "production" })).toThrow(
      /NEXT_PUBLIC_R2_PUBLIC_BASE_URL[\s\S]*CRON_SECRET/,
    );
  });

  it.each([
    ["a Preview build", { VERCEL: "1", VERCEL_ENV: "preview", ...R2, ...RATE_KEY }],
    ["a development build on Vercel", { VERCEL: "1", VERCEL_ENV: "development", ...R2 }],
    ["a local or CI build (no VERCEL_ENV)", {}],
    ["NODE_ENV=production alone (every next build sets it)", { NODE_ENV: "production" }],
  ])("leaves %s alone without CRON_SECRET", (_label, env) => {
    expect(() => assertBuildEnv(env)).not.toThrow();
    expect(cronSecretProblem(env)).toBeNull();
  });
});

describe("assertBuildEnv: NEXT_PUBLIC_R2_PUBLIC_BASE_URL (moved here from next.config.ts)", () => {
  it.each([
    ["VERCEL", { VERCEL: "1" }],
    ["VERCEL_ENV=preview", { VERCEL_ENV: "preview" }],
  ])("fails any Vercel build without it (%s)", (_label, env) => {
    expect(() => assertBuildEnv(env)).toThrow(
      /Missing required environment variable: NEXT_PUBLIC_R2_PUBLIC_BASE_URL/,
    );
  });

  it("does not require it of a local build", () => {
    expect(() => assertBuildEnv({})).not.toThrow();
  });
});

/**
 * EM-Q11 (Oleksii, 2026-10-14, verbatim): "Required in production with a
 * build-time check, like CRON_SECRET." The same shared rule, so the same
 * cases, with `CRON_SECRET` valid throughout so each case tests only this one.
 */
describe("assertBuildEnv: RATE_LIMIT_KEY_SECRET on a Vercel build", () => {
  const CRON = { CRON_SECRET: "c".repeat(32) };
  const production = {
    VERCEL: "1",
    VERCEL_ENV: "production",
    ...R2,
    ...CRON,
    ...LOCATION,
    ...SIGN_IN,
    ...UPLOAD,
  };

  it("fails a production build without it, naming the variable", () => {
    expect(() => assertBuildEnv(production)).toThrow(
      /RATE_LIMIT_KEY_SECRET must be at least 32 characters/,
    );
  });

  it("fails one with 31 characters, and never prints the value", () => {
    let message = "";
    try {
      assertBuildEnv({ ...production, RATE_LIMIT_KEY_SECRET: SHORT_SECRET });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/RATE_LIMIT_KEY_SECRET must be at least 32 characters/);
    expect(message).not.toContain(SHORT_SECRET.slice(0, 8));
  });

  it("builds with exactly 32 characters", () => {
    expect(() =>
      assertBuildEnv({ ...production, RATE_LIMIT_KEY_SECRET: `${SHORT_SECRET}c` }),
    ).not.toThrow();
  });

  it("names both secrets at once when both are missing", () => {
    expect(() => assertBuildEnv({ VERCEL: "1", VERCEL_ENV: "production", ...R2 })).toThrow(
      /CRON_SECRET[\s\S]*RATE_LIMIT_KEY_SECRET/,
    );
  });

  /** EM-B6 (Oleksii, 2026-10-15, verbatim): "Build-time check covers both." */
  describe("on a Preview build (EM-B6)", () => {
    const preview = { VERCEL: "1", VERCEL_ENV: "preview", ...R2 };

    it("fails without it, or with 31 characters, naming the variable and not the value", () => {
      for (const env of [preview, { ...preview, RATE_LIMIT_KEY_SECRET: SHORT_SECRET }]) {
        let message = "";
        try {
          assertBuildEnv(env);
        } catch (error) {
          message = (error as Error).message;
        }
        expect(message).toMatch(/RATE_LIMIT_KEY_SECRET must be at least 32 characters/);
        expect(message).toMatch(/Preview/);
        expect(message).not.toContain(SHORT_SECRET.slice(0, 8));
        // CRON_SECRET stays production-only: only one problem is named.
        expect(message).not.toMatch(/CRON_SECRET/);
      }
    });

    it("builds with exactly 32 characters, and with no CRON_SECRET", () => {
      expect(() =>
        assertBuildEnv({ ...preview, RATE_LIMIT_KEY_SECRET: `${SHORT_SECRET}c` }),
      ).not.toThrow();
    });

    it("fails closed on a Vercel environment it doesn't recognise, or VERCEL_ENV alone", () => {
      for (const env of [
        { VERCEL: "1", VERCEL_ENV: "staging", ...R2 },
        { VERCEL_ENV: "preview", ...R2 },
      ]) {
        expect(rateLimitKeySecretProblem(env) ?? "no problem reported").toMatch(
          /RATE_LIMIT_KEY_SECRET/,
        );
      }
    });
  });

  it.each([
    ["a local or CI build (no VERCEL_ENV)", {}],
    ["NODE_ENV=production alone (every next build sets it)", { NODE_ENV: "production" }],
    [
      "a developer's pulled Vercel env (VERCEL=1, VERCEL_ENV=development)",
      { VERCEL: "1", VERCEL_ENV: "development", ...R2 },
    ],
  ])("leaves %s alone without it", (_label, env) => {
    expect(() => assertBuildEnv(env)).not.toThrow();
    expect(rateLimitKeySecretProblem(env)).toBeNull();
  });
});

/**
 * IN-R2, Decision 1 (Oleksii, verbatim: "From the commit that turns sign-in
 * on: A production build fails if any of the five variables is missing, so a
 * bad deploy never goes live."). Decision 1's five plus PRODUCTION_ORIGIN and
 * EMAIL_REPLY_TO (inbox WI-Q1, built as recommended), and once all are
 * present, a configuration production sign-in can actually turn on.
 */
describe("assertBuildEnv: production sign-in's variables (IN-R2, Decision 1)", () => {
  const production = {
    VERCEL: "1",
    VERCEL_ENV: "production",
    CRON_SECRET: "c".repeat(32),
    ...RATE_KEY,
    ...LOCATION,
    ...R2,
    ...SIGN_IN,
    ...UPLOAD,
  };

  const messageOf = (env: Record<string, string | undefined>) => {
    try {
      assertBuildEnv(env);
    } catch (error) {
      return (error as Error).message;
    }
    return "";
  };

  it("builds with exactly the values Oleksii reported (apex URLs, no trailing slash)", () => {
    expect(signInEnvProblems(production)).toEqual([]);
    expect(() => assertBuildEnv(production)).not.toThrow();
  });

  it.each([
    "EMAIL_PROVIDER",
    "RESEND_API_KEY",
    "EMAIL_FROM_ADDRESS",
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_URL",
    "PRODUCTION_ORIGIN",
    "EMAIL_REPLY_TO",
  ])("fails a production build without %s (unset or blank), naming it", (name) => {
    for (const value of [undefined, "", "  "]) {
      expect(messageOf({ ...production, [name]: value }), `${name}=${String(value)}`).toMatch(
        new RegExp(
          `Missing required environment variable\\(s\\) for production sign-in: .*${name}`,
        ),
      );
    }
  });

  it("names every missing one at once, and the provider's own key only once it knows the provider", () => {
    const message = messageOf({
      ...production,
      RESEND_API_KEY: undefined,
      BETTER_AUTH_SECRET: undefined,
      EMAIL_REPLY_TO: undefined,
    });
    expect(message).toMatch(/RESEND_API_KEY, EMAIL_REPLY_TO, BETTER_AUTH_SECRET/);
    // An unknown provider names no key (there is no variable for it) but is still refused.
    expect(messageOf({ ...production, EMAIL_PROVIDER: "sendgrid" })).toMatch(
      /EMAIL_PROVIDER must be resend: every email it routes is an auth email/,
    );
    // PW1-Q4: nor does a locked one. Brevo without its key is refused as Brevo, never sent to
    // look for a BREVO_API_KEY that couldn't configure anything.
    const brevo = messageOf({ ...production, EMAIL_PROVIDER: "brevo" });
    expect(brevo).toMatch(/EMAIL_PROVIDER must be resend: every email it routes is an auth email/);
    expect(brevo).not.toContain("BREVO_API_KEY");
    expect(messageOf({ ...production, EMAIL_SIGN_IN_PROVIDER: "brevo" })).toMatch(
      /EMAIL_SIGN_IN_PROVIDER must be unset or resend: every email it routes is an auth email/,
    );
  });

  it.each([
    [
      "a BETTER_AUTH_URL that is www",
      { BETTER_AUTH_URL: "https://www.opika.org.ua" },
      /BETTER_AUTH_URL must be PRODUCTION_ORIGIN/,
    ],
    [
      "a BETTER_AUTH_URL over http",
      { BETTER_AUTH_URL: "http://opika.org.ua" },
      /BETTER_AUTH_URL must be PRODUCTION_ORIGIN/,
    ],
    [
      "a PRODUCTION_ORIGIN with a path",
      { PRODUCTION_ORIGIN: "https://opika.org.ua/kabinet" },
      /PRODUCTION_ORIGIN must be an https origin/,
    ],
    [
      "a 31-character BETTER_AUTH_SECRET",
      { BETTER_AUTH_SECRET: SHORT_SECRET },
      /BETTER_AUTH_SECRET must be at least 32 characters/,
    ],
    [
      "a From address off mail.",
      { EMAIL_FROM_ADDRESS: "noreply@opika.org.ua" },
      /EMAIL_FROM_ADDRESS must be an address on mail\./,
    ],
    [
      "a Reply-To on another host",
      { EMAIL_REPLY_TO: "hello@example.org" },
      /EMAIL_REPLY_TO must be an address on PRODUCTION_ORIGIN's host/,
    ],
    [
      "a sign-in route naming Brevo, its key set (PW1-Q4)",
      { EMAIL_SIGN_IN_PROVIDER: "brevo", BREVO_API_KEY: "brevo-key-example" },
      /EMAIL_SIGN_IN_PROVIDER must be unset or resend: every email it routes is an auth email/,
    ],
    [
      "the default route naming Brevo, its key set (PW1-Q4)",
      { EMAIL_PROVIDER: "brevo", BREVO_API_KEY: "brevo-key-example" },
      /EMAIL_PROVIDER must be resend: every email it routes is an auth email/,
    ],
  ])(
    "fails a production build with %s, naming the problem and never a value",
    (_label, change, problem) => {
      const message = messageOf({ ...production, ...change });
      expect(message).toMatch(problem);
      expect(message).not.toContain(SIGN_IN.RESEND_API_KEY);
      expect(message).not.toContain("brevo-key-example");
      expect(message).not.toContain(SHORT_SECRET.slice(0, 8));
    },
  );

  it("accepts a trailing slash on the origin, as productionSignInOf does", () => {
    expect(
      signInEnvProblems({ ...production, PRODUCTION_ORIGIN: "https://opika.org.ua/" }),
    ).toEqual([]);
  });

  it.each([
    ["a Preview build", { ...production, VERCEL_ENV: "preview" }],
    ["a local or CI build (no VERCEL_ENV)", { ...R2 }],
    ["NODE_ENV=production alone (every next build sets it)", { NODE_ENV: "production" }],
  ])("leaves %s alone without any sign-in variable", (_label, env) => {
    const bare = Object.fromEntries(Object.entries(env).filter(([name]) => !(name in SIGN_IN)));
    expect(signInEnvProblems(bare)).toEqual([]);
  });
});

/**
 * WI-T2 (Oleksii, 2026-10-15, verbatim: "yes, check LOCATION_HMAC_SECRET at
 * the production build too"): the same function the boot check calls, so the
 * same cases, production builds only.
 */
describe("assertBuildEnv: LOCATION_HMAC_SECRET on a production build (WI-T2)", () => {
  const production = {
    VERCEL: "1",
    VERCEL_ENV: "production",
    CRON_SECRET: "c".repeat(32),
    ...RATE_KEY,
    ...R2,
    ...SIGN_IN,
    ...UPLOAD,
  };
  const messageOf = (env: Record<string, string | undefined>) => {
    try {
      assertBuildEnv(env);
    } catch (error) {
      return (error as Error).message;
    }
    return "";
  };

  it.each([
    ["unset", undefined],
    ["empty", ""],
    ["31 characters", SHORT_SECRET],
    ["32 spaces", " ".repeat(32)],
  ])("fails a production build with it %s, naming it and never a new key", (_label, value) => {
    const message = messageOf({ ...production, LOCATION_HMAC_SECRET: value });
    expect(message).toMatch(/LOCATION_HMAC_SECRET must be at least 32 characters/);
    expect(message).toMatch(/same value the onboarding script uses, never a new one/);
    expect(message).not.toContain(SHORT_SECRET.slice(0, 8));
  });

  it("fails one with a padded value, naming it and never the value", () => {
    const padded = `${"l".repeat(40)}\n`;
    const message = messageOf({ ...production, LOCATION_HMAC_SECRET: padded });
    expect(message).toMatch(/LOCATION_HMAC_SECRET has a space or a line break/);
    expect(message).not.toContain("l".repeat(8));
  });

  it("builds with exactly 32 characters", () => {
    expect(messageOf({ ...production, LOCATION_HMAC_SECRET: "l".repeat(32) })).toBe("");
  });

  it.each([
    ["a Preview build", { ...production, VERCEL_ENV: "preview" }],
    ["a development build on Vercel", { ...production, VERCEL_ENV: "development" }],
    ["a local or CI build (no VERCEL_ENV)", {}],
    ["NODE_ENV=production alone", { NODE_ENV: "production" }],
  ])("leaves %s alone without it", (_label, env) => {
    expect(locationSecretProblem(env)).toBeNull();
    expect(messageOf(env)).not.toMatch(/LOCATION_HMAC_SECRET/);
  });
});

/**
 * P-Q10 (Oleksii, verbatim amendment: "R2_UPLOAD_* in Production only;
 * Preview has no upload token, so uploads are off in Preview"): a production
 * build fails without all four upload variables; nothing else asks for them.
 */
describe("the photo upload variables (P-Q10)", () => {
  const production = {
    VERCEL: "1",
    VERCEL_ENV: "production",
    CRON_SECRET: "c".repeat(32),
    ...RATE_KEY,
    ...LOCATION,
    ...R2,
    ...SIGN_IN,
    ...UPLOAD,
  };
  const messageOf = (env: Record<string, string | undefined>) => {
    try {
      assertBuildEnv(env);
    } catch (error) {
      return (error as Error).message;
    }
    return "";
  };

  it("builds with all four", () => {
    expect(messageOf(production)).toBe("");
  });

  it.each(Object.keys(UPLOAD))(
    "fails a production build without %s, naming it and never a value",
    (name) => {
      const message = messageOf({ ...production, [name]: undefined });
      expect(message).toContain(name);
      expect(message).toMatch(/Production environment only, never Preview/);
      for (const value of Object.values(UPLOAD)) expect(message).not.toContain(value);
    },
  );

  it("fails one with a padded value, naming it and never the value", () => {
    const message = messageOf({ ...production, R2_UPLOAD_SECRET_ACCESS_KEY: " padded-secret " });
    expect(message).toMatch(/R2_UPLOAD_SECRET_ACCESS_KEY has a space or a line break/);
    expect(message).not.toContain("padded-secret");
  });

  it.each([
    ["a Preview build", { ...production, ...{ VERCEL_ENV: "preview" } }],
    ["a local or CI build", {}],
    ["NODE_ENV=production alone", { NODE_ENV: "production" }],
  ])("leaves %s alone without them", (_label, env) => {
    const bare = Object.fromEntries(Object.entries(env).filter(([name]) => !(name in UPLOAD)));
    expect(photoUploadEnvProblem(bare)).toBeNull();
  });

  describe("photoUploadConfigOf, read per request by the route", () => {
    it("is on with all four, carrying exactly them", () => {
      expect(photoUploadConfigOf({ VERCEL_ENV: "production", ...UPLOAD })).toEqual({
        kind: "on",
        r2: {
          accountId: UPLOAD.R2_ACCOUNT_ID,
          bucketName: UPLOAD.R2_BUCKET_NAME,
          accessKeyId: UPLOAD.R2_UPLOAD_ACCESS_KEY_ID,
          secretAccessKey: UPLOAD.R2_UPLOAD_SECRET_ACCESS_KEY,
        },
      });
    });

    it("is off in Preview even with all four set (Preview never uploads)", () => {
      expect(photoUploadConfigOf({ VERCEL_ENV: "preview", ...UPLOAD })).toEqual({
        kind: "off",
        because: "preview",
      });
    });

    it("is off locally unless all four are set", () => {
      expect(photoUploadConfigOf({})).toEqual({ kind: "off", because: "not_configured" });
      expect(photoUploadConfigOf({ ...UPLOAD, R2_UPLOAD_ACCESS_KEY_ID: "" })).toEqual({
        kind: "off",
        because: "not_configured",
      });
      expect(photoUploadConfigOf({ ...UPLOAD }).kind).toBe("on");
    });

    it("never takes the onboarding script's own token", () => {
      const onboardingOnly = {
        R2_ACCOUNT_ID: UPLOAD.R2_ACCOUNT_ID,
        R2_BUCKET_NAME: UPLOAD.R2_BUCKET_NAME,
        R2_ACCESS_KEY_ID: "operator-key",
        R2_SECRET_ACCESS_KEY: "operator-secret",
      };
      expect(photoUploadConfigOf(onboardingOnly).kind).toBe("off");
    });
  });
});
