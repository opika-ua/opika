import { COPY_PENDING, pendingCopyPaths, uk } from "@opika/i18n";
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

  /**
   * Oleksii, 2026-10-14 (delivery test 2): the sign-in email is signed
   * `— {operator}` like the invite. Production's config carries the name
   * the wiring hands to `providerMagicLinkSender`; a missing or blank one is
   * the catalogue's fallback, never a reason to stay off (RS-Q2).
   */
  it("carries the configured operator name to sign both emails, else «Оператор реєстру»", () => {
    const on = productionSignInOf({
      ...full,
      KABINET_OPERATOR_DISPLAY_NAME: " Олексій Колотенко ",
    });
    expect(on.kind === "on" && on.operatorName).toBe("Олексій Колотенко");
    for (const unset of [undefined, "", "   "]) {
      const fallback = productionSignInOf({ ...full, KABINET_OPERATOR_DISPLAY_NAME: unset });
      expect(fallback.kind === "on" && fallback.operatorName, String(unset)).toBe(
        "Оператор реєстру",
      );
    }
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
  /**
   * Oleksii's final Ukrainian landed on 2026-10-14 (the PR #94 copy export),
   * every kabinet.* string of it. Against the live catalogue the gate sees
   * nothing pending and is no longer a reason production is off; the
   * synthetic catalogue below proves the gate itself still bites.
   */
  it("against the live catalogue, sees no pending kabinet string and lets production on", () => {
    expect(kabinetPendingCopy()).toEqual([]);
    expect(withLiveCopy(full).kind).toBe("on");
  });

  /**
   * Oleksii, 2026-10-14, item 5, verbatim: "Copy gate: full scope, every
   * kabinet.* string, including ones without a visible screen yet." So the
   * gate is the whole `uk.kabinet` subtree, walked here independently of
   * `pendingCopyPaths`: every leaf is either in the gate's list or written,
   * and the count of leaves is pinned so a narrower walk can't pass by
   * seeing fewer.
   */
  it("covers every kabinet.* string, the ones with no screen yet included (item 5)", () => {
    const pending: string[] = [];
    const written: string[] = [];
    const walk = (node: unknown, path: string) => {
      if (typeof node === "string") {
        (node.startsWith(COPY_PENDING) ? pending : written).push(path);
      } else {
        for (const [key, value] of Object.entries(node as object)) walk(value, `${path}.${key}`);
      }
    };
    walk(uk.kabinet, "kabinet");
    // 88 rows of the copy export plus operatorFallbackName and profileNotRecorded,
    // less profile.addressNote (row 57), deleted as a false claim (review of the final copy).
    expect(pending.length + written.length).toBe(89);
    expect(kabinetPendingCopy()).toEqual(pending.sort());
    for (const screenless of [
      "kabinet.history.adminJoined",
      "kabinet.registry.inviteSent.tellPersonally",
      "kabinet.email.invite.what",
    ]) {
      expect(written, screenless).toContain(screenless);
    }
  });

  /**
   * The gate still works now that almost nothing is pending: a catalogue
   * with placeholders put back (an email template, a screenless history
   * line, a nested group) is read by the same walk the gate uses and turns
   * production off, naming each.
   */
  it("turns production off for a synthetic catalogue with pending strings, naming each", () => {
    const synthetic = structuredClone(uk.kabinet) as unknown as {
      email: { invite: Record<string, string> };
      history: Record<string, string>;
      support: Record<string, string>;
    };
    synthetic.email.invite.notYou = `${COPY_PENDING} sign-off`;
    synthetic.history.adminJoined = `${COPY_PENDING} history`;
    synthetic.support.body = "Written.";
    const pending = pendingCopyPaths(synthetic, "kabinet");
    expect(pending).toEqual(["kabinet.email.invite.notYou", "kabinet.history.adminJoined"]);
    expect(withLiveCopy(full, pending)).toEqual({ kind: "off", reason: "copy_pending", pending });
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

  /**
   * "Make sure it can't break local/test": development sign-in takes no copy
   * input at all (`kabinetAuthAvailability` reads only the environment), so it
   * stays available whatever the catalogue holds.
   */
  it("leaves development sign-in available whatever the copy holds", () => {
    expect(
      kabinetAuthAvailability({
        NODE_ENV: "development",
        BETTER_AUTH_SECRET: "s".repeat(32),
        BETTER_AUTH_URL: "http://localhost:3000",
      }).kind,
    ).toBe("available");
  });
});
