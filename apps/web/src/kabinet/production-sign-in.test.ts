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

/** Production's shape after the switch-on (EM-B10): every email on Resend, on RESEND_API_KEY. */
const full = {
  EMAIL_PROVIDER: "resend",
  RESEND_API_KEY: "resend-key",
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
   * `{operator}` like the invite. Production's config carries the name
   * the wiring hands to `providerMagicLinkSender`; a missing or blank one is
   * the catalogue's fallback, never a reason to stay off (RS-Q2).
   */
  it("carries the configured operator name to sign both emails, else «Адміністратор сайту»", () => {
    const on = productionSignInOf({
      ...full,
      KABINET_OPERATOR_DISPLAY_NAME: " Олексій Колотенко ",
    });
    expect(on.kind === "on" && on.operatorName).toBe("Олексій Колотенко");
    for (const unset of [undefined, "", "   "]) {
      const fallback = productionSignInOf({ ...full, KABINET_OPERATOR_DISPLAY_NAME: unset });
      expect(fallback.kind === "on" && fallback.operatorName, String(unset)).toBe(
        "Адміністратор сайту",
      );
    }
  });

  /**
   * EM-B6 and EM-B10: the routes `production-mail.ts` hands to the two senders.
   * After the switch-on both are Resend, on one key. Since PW1-Q4 no other
   * shape can be configured (the next test).
   */
  it("carries both email routes, both on Resend's key; a Brevo key left in the environment moves nothing", () => {
    const on = productionSignInOf(full);
    expect(on.kind).toBe("on");
    if (on.kind !== "on") return;
    expect(on.email.invite).toMatchObject({ provider: "resend", apiKey: "resend-key" });
    expect(on.email.signIn).toEqual(on.email.invite);
    const leftover = productionSignInOf({ ...full, BREVO_API_KEY: "brevo-key" });
    expect(leftover.kind === "on" && leftover.email).toEqual(on.email);
  });

  /**
   * Oleksii, 2026-10-20 (inbox PW1-Q4), verbatim: "PW1-Q4: (a). Lock auth emails (sign-in,
   * invite, reset, password changed) to Resend in config, with a test that a Brevo setting is
   * refused for them." Brevo's code is removed; a stale Brevo setting left in Vercel (an unknown
   * provider now) on either variable turns production sign-in off, failing closed as any
   * misconfiguration does, a leftover key present or not. It is never read.
   */
  it("is off (provider_invalid) with a stale Brevo setting on either variable, a leftover key set and all", () => {
    for (const brevo of [
      { EMAIL_PROVIDER: "brevo", BREVO_API_KEY: "brevo-key" },
      { EMAIL_PROVIDER: "brevo", BREVO_API_KEY: "brevo-key", EMAIL_SIGN_IN_PROVIDER: "resend" },
      { EMAIL_SIGN_IN_PROVIDER: "brevo", BREVO_API_KEY: "brevo-key" },
    ]) {
      const off = productionSignInOf({ ...full, ...brevo });
      expect(off, JSON.stringify(brevo)).toEqual({ kind: "off", reason: "provider_invalid" });
      expect(JSON.stringify(off)).not.toContain("brevo-key");
      expect(JSON.stringify(off)).not.toContain("resend-key");
    }
  });

  /**
   * EM-B10, verbatim: "No sends with a mismatched provider/key pair at any
   * point." A provider whose own key is missing is off, whichever route names
   * it, and another provider's key never stands in.
   */
  it("is off (provider_invalid) when a route's provider has no key of its own, failing closed", () => {
    for (const half of [
      { RESEND_API_KEY: undefined },
      { RESEND_API_KEY: " " },
      {
        RESEND_API_KEY: undefined,
        EMAIL_PROVIDER_API_KEY: "resend-key",
        BREVO_API_KEY: "brevo-key",
      },
      { EMAIL_PROVIDER: "brevo" },
      { EMAIL_SIGN_IN_PROVIDER: "brevo" },
      { EMAIL_SIGN_IN_PROVIDER: "brevo", BREVO_API_KEY: " " },
      { EMAIL_SIGN_IN_PROVIDER: "sendgrid" },
    ]) {
      const off = productionSignInOf({ ...full, ...half });
      expect(off, JSON.stringify(half)).toEqual({ kind: "off", reason: "provider_invalid" });
      expect(JSON.stringify(off)).not.toContain("resend-key");
      expect(JSON.stringify(off)).not.toContain("brevo-key");
    }
  });

  it("is off with any of the variables missing", () => {
    expect(productionSignInOf({ ...full, EMAIL_PROVIDER: undefined })).toEqual({
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

  /** IN-Q6 (accepted): "`BETTER_AUTH_SECRET` has a 32-character floor". 31 is off, 32 is on. */
  it("is off with a BETTER_AUTH_SECRET under 32 characters", () => {
    expect(productionSignInOf({ ...full, BETTER_AUTH_SECRET: "s".repeat(31) })).toEqual({
      kind: "off",
      reason: "auth_secret_too_short",
    });
    expect(productionSignInOf({ ...full, BETTER_AUTH_SECRET: "s".repeat(32) }).kind).toBe("on");
  });

  it("refuses a Preview outright, provider key set there or not", () => {
    expect(productionSignInOf({ ...full, VERCEL_ENV: "preview" })).toEqual({
      kind: "off",
      reason: "preview_never_sends",
    });
    expect(
      productionSignInOf({ ...full, VERCEL_ENV: "preview", RESEND_API_KEY: undefined }),
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
 * Leaves per top-level `kabinet` group, pinned so a narrower walk can't pass by seeing fewer. One
 * line per group with a blank line between: a PR edits only its groups' lines, and edits two lines
 * apart merge cleanly where neighbouring lines would conflict.
 */
const KABINET_STRINGS_PER_GROUP: Readonly<Record<string, number>> = {
  units: 12,

  cityPicker: 10,

  dateField: 5,

  operatorFallbackName: 1,

  operatorFallbackNameInSentence: 1,

  shell: 5,

  signIn: 21,

  setPassword: 10,

  password: 5,

  forgot: 5,

  reset: 5,

  changePassword: 7,

  profile: 27,

  profileStatus: 6,

  operatorStatus: 2,

  profileChannel: 9,

  profileNotRecorded: 1,

  notFilledYet: 1,

  profileTabs: 5,

  profileEdit: 94,

  listingStatus: 5,

  animalForm: 156,

  animalList: 80,

  nav: 2,

  deleteDraft: 1,

  support: 6,

  email: 63,

  signInCard: 1,

  inviteLanding: 4,

  registry: 1,

  confirm: 9,

  history: 2,

  operator: 283,

  verificationDecision: 8,

  animalHistoryLabels: 16,
};

/**
 * Oleksii, 2026-10-14, answer 7, verbatim: "Yes. Production sign-in stays off
 * while any kabinet.* or email-template string is [COPY PENDING]. Test it."
 */
describe("production sign-in stays off while kabinet copy is pending (answer 7)", () => {
  /**
   * Oleksii's final Ukrainian landed on 2026-10-14 (the PR #94 copy export),
   * every kabinet.* string of it. The wiring PR added one key, the over-limit
   * card's notice (`kabinet.confirm.rateLimited`, IN-T15's gate item), and his
   * text for it landed 2026-10-15 (inbox WI-Q3). So against the live catalogue
   * nothing is pending, and with the configuration he reported for Production
   * (WI-B1: the apex origin with no trailing slash, From on `mail.`, Reply-To
   * on the apex, From name as given; example key and secret, never real ones)
   * production sign-in is on. This is what merging the wiring PR turns on.
   *
   * K3 (PR 4) has nothing pending either: its two hidden-shelter lines got
   * his final text (round 2b, answer 3) and left `kabinet.testShelterOnly`,
   * and K2 (PR 5) moved its last line out (`animalForm.listed.dateUnchanged`,
   * P10), so the namespace was empty, and PR 6 deleted it with its
   * exemption (his 0.3a). CG-B1, verbatim: "Under the open policy, any
   * pending string turns sign-in off." That is checked here with a pending
   * path handed in, since the live catalogue has none.
   */
  it("against the live catalogue, nothing is pending and the reported Production configuration is on", () => {
    const reported = {
      VERCEL_ENV: "production",
      EMAIL_PROVIDER: "resend",
      RESEND_API_KEY: "resend-key-example",
      EMAIL_FROM_ADDRESS: "noreply@mail.opika.org.ua",
      EMAIL_FROM_NAME: "Opika",
      EMAIL_REPLY_TO: "hello@opika.org.ua",
      PRODUCTION_ORIGIN: "https://opika.org.ua",
      BETTER_AUTH_SECRET: "s".repeat(64),
      BETTER_AUTH_URL: "https://opika.org.ua",
      KABINET_OPERATOR_DISPLAY_NAME: "Оператор",
    };
    expect(kabinetPendingCopy()).toEqual([]);
    expect(withLiveCopy(reported).kind).toBe("on");
    // A line where the exempt namespace used to be turns it off like any other.
    const formerNamespaceLine = ["kabinet.testShelterOnly.animalList.parkedLine"];
    expect(withLiveCopy(reported, formerNamespaceLine)).toEqual({
      kind: "off",
      reason: "copy_pending",
      pending: formerNamespaceLine,
    });
    // The gate still reads the catalogue: one pending path anywhere turns it off.
    expect(withLiveCopy(reported, ["kabinet.confirm.rateLimited"])).toEqual({
      kind: "off",
      reason: "copy_pending",
      pending: ["kabinet.confirm.rateLimited"],
    });
  });

  /**
   * Oleksii, 2026-10-14, item 5, verbatim: "Copy gate: full scope, every
   * kabinet.* string, including ones without a visible screen yet." So the
   * gate is the whole `uk.kabinet` subtree, walked here independently of
   * `pendingCopyPaths`: every leaf is either in the gate's list or written,
   * and the leaves are counted per group (`KABINET_STRINGS_PER_GROUP`).
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
    const perGroup: Record<string, number> = {};
    for (const path of [...pending, ...written]) {
      const group = path.split(".")[1] ?? "";
      perGroup[group] = (perGroup[group] ?? 0) + 1;
    }
    expect(perGroup).toEqual(KABINET_STRINGS_PER_GROUP);
    expect(written).toContain("kabinet.profileEdit.errors.aboutTooLong");
    expect(written).toContain("kabinet.animalForm.coat.unknown");
    expect(written).toContain("kabinet.animalForm.temperament.hint");
    expect(written).toContain("kabinet.operator.create.errors.nameTooLong");
    expect(written).toContain("kabinet.profileEdit.state.saved");
    expect(written).toContain("kabinet.animalForm.draft.notVisible");
    expect(written).toContain("kabinet.animalForm.publish.publishedNotShown");
    expect(written).toContain("kabinet.animalForm.listed.dateUnchanged");
    expect(written).toContain("kabinet.animalList.stale.caption");
    expect(written).toContain("kabinet.deleteDraft.refused.wasPublished");
    expect(pending).toEqual([]);
    expect(written).toContain("kabinet.confirm.rateLimited");
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
   * The gate still works now that nothing is pending: a catalogue
   * with placeholders put back (an email template, a screenless history
   * line, a nested group) is read by the same walk the gate uses and turns
   * production off, naming each.
   */
  it("turns production off for a synthetic catalogue with pending strings, naming each", () => {
    const synthetic = structuredClone(uk.kabinet) as unknown as {
      email: { invite: Record<string, string> };
      history: Record<string, string>;
      support: Record<string, string>;
      parked: Record<string, string>;
    };
    synthetic.email.invite.notYou = `${COPY_PENDING} sign-off`;
    synthetic.history.adminJoined = `${COPY_PENDING} history`;
    synthetic.parked = { line: `${COPY_PENDING} parked line` };
    synthetic.support.body = "Written.";
    const pending = pendingCopyPaths(synthetic, "kabinet");
    expect(pending).toEqual([
      "kabinet.email.invite.notYou",
      "kabinet.history.adminJoined",
      "kabinet.parked.line",
    ]);
    // No namespace is exempt (PR 6): all three turn it off.
    expect(withLiveCopy(full, pending)).toEqual({ kind: "off", reason: "copy_pending", pending });
  });

  /** The copy gate comes first, whatever the email routes say (EM-B6 changes routing, not the gate). */
  it("reports copy_pending before a half-configured sign-in route, and with a split one", () => {
    const pending = ["kabinet.email.signIn.expiry"];
    for (const routing of [
      { EMAIL_SIGN_IN_PROVIDER: "brevo" },
      { EMAIL_SIGN_IN_PROVIDER: "brevo", BREVO_API_KEY: "brevo-key" },
    ]) {
      expect(withLiveCopy({ ...full, ...routing }, pending)).toEqual({
        kind: "off",
        reason: "copy_pending",
        pending,
      });
    }
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

/**
 * CG-B1 (Oleksii, verbatim: "Under the open policy, any pending string turns
 * sign-in off."). PR 6 opened writes for every shelter and deleted the
 * `kabinet.testShelterOnly` namespace and its exemption (his 0.3a), so no
 * path under `kabinet.*` is exempt any more, whatever it is called.
 */
describe("no kabinet namespace is exempt from the copy gate (CG-B1, PR 6)", () => {
  it.each([
    ["kabinet.testShelterOnly.k3.photoHint"],
    ["kabinet.email.signIn.subject"],
    ["kabinet.signIn.title"],
    ["kabinet.profileEdit.state.saved"],
    ["kabinet.animalList.stale.caption"],
  ])("pending %s → off, naming it", (path) => {
    expect(withLiveCopy(full, [path])).toEqual({
      kind: "off",
      reason: "copy_pending",
      pending: [path],
    });
  });
});
