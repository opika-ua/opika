import { describe, expect, it } from "vitest";
import { kabinetAuthAvailability } from "./auth-route";
import { kabinetPendingCopy, productionSignInOf as withLiveCopy } from "./production-sign-in";

/**
 * IN-Q6 and IN-R2 (Oleksii, Decision 2: "PRODUCTION_ORIGIN=https://opika.org.ua
 * (apex), pinned explicitly. Don't use VERCEL_PROJECT_PRODUCTION_URL for this.
 * Fail closed: if the environment can't be identified, sign-in is refused,
 * never skipped. Test the off-Vercel case." and "Previews: refuse sign-in
 * outright."). Moved out of email-provider.test.ts (review of 3bc08a0,
 * finding 6). Example values only, never a real key.
 */

/**
 * Every condition below but the copy one is tested with the copy treated as
 * landed; the copy gate has its own block at the end, against the live
 * catalogue.
 */
const productionSignInOf = (env: Readonly<Record<string, string | undefined>>) =>
  withLiveCopy(env, []);

const full = {
  EMAIL_PROVIDER: "postmark",
  EMAIL_PROVIDER_API_KEY: "key",
  EMAIL_FROM_ADDRESS: "kabinet@mail.example.org",
  EMAIL_REPLY_TO: "hello@example.org",
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

/**
 * Oleksii, 2026-10-14, answer 7, verbatim: "Yes. Production sign-in stays off
 * while any kabinet.* or email-template string is [COPY PENDING]. Test it."
 */
describe("production sign-in stays off while kabinet copy is pending (answer 7)", () => {
  it("is off today, against the live catalogue, naming the pending strings", () => {
    const pending = kabinetPendingCopy();
    // Not vacuous: the catalogue really does hold pending kabinet strings
    // today, the email templates among them.
    expect(pending).toContain("kabinet.email.signIn.subject");
    expect(pending).toContain("kabinet.email.invite.subject");
    expect(pending).toContain("kabinet.signIn.title");
    expect(withLiveCopy(full)).toEqual({ kind: "off", reason: "copy_pending", pending });
  });

  it("one pending string anywhere under kabinet.* is enough, an email template's included", () => {
    for (const path of ["kabinet.email.invite.notYou", "kabinet.support.title"]) {
      expect(withLiveCopy(full, [path]), path).toEqual({
        kind: "off",
        reason: "copy_pending",
        pending: [path],
      });
    }
    expect(withLiveCopy(full, []).kind).toBe("on");
  });

  it("never turns a Preview or an unidentified environment on, and leaves their reasons alone", () => {
    expect(withLiveCopy({ ...full, VERCEL_ENV: "preview" }, []).kind).toBe("off");
    expect(withLiveCopy({ ...full, VERCEL_ENV: undefined }, []).kind).toBe("off");
    expect(withLiveCopy({ ...full, VERCEL_ENV: "preview" })).toEqual({
      kind: "off",
      reason: "preview_never_sends",
    });
  });

  /** "Make sure it can't break local/test": development sign-in doesn't consult the copy at all. */
  it("leaves development sign-in available with the copy still pending", () => {
    expect(kabinetPendingCopy().length).toBeGreaterThan(0);
    expect(
      kabinetAuthAvailability({
        NODE_ENV: "development",
        BETTER_AUTH_SECRET: "s".repeat(32),
        BETTER_AUTH_URL: "http://localhost:3000",
      }).kind,
    ).toBe("available");
  });
});
