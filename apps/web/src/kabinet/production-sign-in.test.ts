import { describe, expect, it } from "vitest";
import { productionSignInOf } from "./production-sign-in";

/**
 * IN-Q6 and IN-R2 (Oleksii, Decision 2: "PRODUCTION_ORIGIN=https://opika.org.ua
 * (apex), pinned explicitly. Don't use VERCEL_PROJECT_PRODUCTION_URL for this.
 * Fail closed: if the environment can't be identified, sign-in is refused,
 * never skipped. Test the off-Vercel case." and "Previews: refuse sign-in
 * outright."). Moved out of email-provider.test.ts (review of 3bc08a0,
 * finding 6). Example values only, never a real key.
 */

const full = {
  EMAIL_PROVIDER: "postmark",
  EMAIL_PROVIDER_API_KEY: "key",
  EMAIL_FROM_ADDRESS: "kabinet@mail.example.org",
  PRODUCTION_ORIGIN: "https://example.org",
  BETTER_AUTH_SECRET: "s".repeat(32),
  BETTER_AUTH_URL: "https://example.org",
  VERCEL_ENV: "production",
};

describe("productionSignInOf", () => {
  it("is on exactly when everything is set and BETTER_AUTH_URL is the pinned origin", () => {
    expect(productionSignInOf(full).kind).toBe("on");
    expect(productionSignInOf({ ...full, BETTER_AUTH_URL: "https://example.org/" }).kind).toBe(
      "on",
    );
  });

  it("is off with any of the variables missing", () => {
    expect(productionSignInOf({ ...full, EMAIL_PROVIDER_API_KEY: undefined })).toEqual({
      kind: "off",
      reason: "provider_not_configured",
    });
    expect(productionSignInOf({ ...full, PRODUCTION_ORIGIN: undefined })).toEqual({
      kind: "off",
      reason: "provider_not_configured",
    });
    expect(productionSignInOf({ ...full, BETTER_AUTH_SECRET: undefined })).toEqual({
      kind: "off",
      reason: "auth_config_missing",
    });
    expect(productionSignInOf({ ...full, BETTER_AUTH_URL: undefined })).toEqual({
      kind: "off",
      reason: "auth_config_missing",
    });
  });

  it("refuses a Preview outright, provider key set there or not", () => {
    expect(productionSignInOf({ ...full, VERCEL_ENV: "preview" })).toEqual({
      kind: "off",
      reason: "preview_never_sends",
    });
    expect(
      productionSignInOf({ ...full, VERCEL_ENV: "preview", EMAIL_PROVIDER_API_KEY: undefined }),
    ).toEqual({ kind: "off", reason: "preview_never_sends" });
  });

  /** Off Vercel (or the variable lost), the environment can't be identified: refused, never skipped. */
  it("fails closed when the environment can't be identified", () => {
    for (const vercelEnv of [undefined, "", "development", "staging"]) {
      expect(productionSignInOf({ ...full, VERCEL_ENV: vercelEnv }), String(vercelEnv)).toEqual({
        kind: "off",
        reason: "environment_unidentified",
      });
    }
  });

  it("is off when BETTER_AUTH_URL is not the pinned origin, www and Vercel's own URL included", () => {
    for (const wrong of [
      "https://www.example.org",
      "https://preview-abc.vercel.app",
      "http://example.org",
      "https://example.org/kabinet",
    ]) {
      expect(productionSignInOf({ ...full, BETTER_AUTH_URL: wrong }), wrong).toEqual({
        kind: "off",
        reason: "auth_url_not_production_origin",
      });
    }
  });

  it("ignores VERCEL_PROJECT_PRODUCTION_URL entirely: the pinned origin decides", () => {
    expect(
      productionSignInOf({ ...full, VERCEL_PROJECT_PRODUCTION_URL: "www.example.org" }).kind,
    ).toBe("on");
    expect(
      productionSignInOf({
        ...full,
        BETTER_AUTH_URL: "https://www.example.org",
        VERCEL_PROJECT_PRODUCTION_URL: "www.example.org",
      }),
    ).toEqual({ kind: "off", reason: "auth_url_not_production_origin" });
  });
});
