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
   * `- {operator}` like the invite. Production's config carries the name
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
   * refused for them." Every email production sends is an auth email, so a Brevo setting on
   * either variable turns production sign-in off, failing closed as any misconfiguration does,
   * with Brevo's own key present: the grace-period rollback that used to be on is gone.
   */
  it("is off (provider_invalid) with a Brevo setting on either variable, Brevo's key set and all", () => {
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
    // 88 rows of the copy export plus operatorFallbackName and profileNotRecorded.
    // profile.addressNote (row 57) was deleted as a false claim and is back with
    // his replacement text (2026-10-14, EM-Q10). 91 with confirm.rateLimited,
    // the over-limit card's notice (the wiring PR; his text, 2026-10-15).
    // 165 with K4's 74 `profileEdit.*` strings (PR 2 of the K milestone, his
    // text, 2026-10-17; the key set is pinned in copy-status.test.ts).
    // 385 with R-UI's 220 `operator.*` and `verificationDecision.*` strings
    // (his text, 2026-10-17, all three R-UI PRs; pinned in copy-status.test.ts).
    // 397 with the 12 `animalHistoryLabels.*` words (his K3 words, R-UI 1).
    // 398 with operatorFallbackNameInSentence, the fallback's lower case for the
    // locked note once round 2's answer 6 capitalised the standalone one.
    // 399 with verificationDecision.signature (round 2's answer 2, R-UI 3).
    // 400 with operator.admins.inviteFirst (his N7, round 3).
    // 516 with K3 (PR 4): 110 `animalForm.*` and 5 `listingStatus.*` strings
    // and the one `testShelterOnly.animalForm.*` line (his text, 2026-10-17,
    // all pinned in copy-status.test.ts).
    // 594 with K2 (PR 5): his 78 strings (`k2-copy-uk.md`, 2026-10-18): 75
    // under `animalList.*` (the two `{cards}` groups' six forms included), the
    // two `nav.*` and `deleteDraft.refused.wasPublished`, pinned in
    // copy-status.test.ts. `dateUnchanged` moved within the tree (P10), so it
    // adds nothing. 595 with operator.create.errors.nameTooLong (his RUI4-F2
    // text, 2026-10-18). 596 with email.invite.whatBeforeVerification (Q-C, 2026-10-19).
    // 595 since PR 6 deleted profileEdit.errors.notAvailable (P6-Q8).
    // 635 with PW-1's passwords (his text, 2026-10-19, pinned in copy-status.test.ts): 8 new
    // `signIn.*` keys less `signIn.send`, 3 `setPassword.*`, 5 `password.*`, 5 `forgot.*`,
    // 5 `reset.*`, 7 `changePassword.*`, 5 `email.reset.*` and 3 `email.passwordChanged.*`.
    // 640 with designer round 1's fur (his text, 2026-10-20, pinned in copy-status.test.ts):
    // the four `animalForm.coat.*` and `animalHistoryLabels.field.coatLength`.
    // 637 with PW-2: his 3 `setPassword.*` (title, intro, submit), less the magic-link landing's
    // 6 `inviteLanding.*` (ready, send, sent, title, alreadyAccepted, rateLimited).
    // 639 with the copy audit's G3 `profile.pendingNote` and G4 `signIn.failed` (2026-10-22).
    // 637 with designer round 1, S6 (his DR1-Q1 and DR1-Q5 text, 2026-10-20): less
    // `voice.nameStaysHint`, `voice.insertName` and `voice.previewNoAnimals`, plus
    // `errors.nameTokenGone`.
    // 648 with the pet card redesign's 11 (his approval of 2026-10-26, quoted in
    // copy-status.test.ts's `PET_CARD_COPY`): the four `animalForm.temperament.*`, the four
    // `animalForm.colour.*` and three `animalHistoryLabels.field.*`. His other two, the medical
    // note's label and hint, ship in PR 5 with the note's field.
    // 661 with pet card PR 3b's logo section: the twelve `profileEdit.logo.*` keys (his final
    // text, 2026-10-27, including `add`) and `operator.history.logo_changed`.
    // 664 with pet card PR 5's medical note field: his `animalForm.medicalNotes.title`/`.hint`
    // (given directly, 2026-10-27), plus the builder-drafted
    // `animalForm.validation.medicalNotesTooLong` (not his words, but real text, never
    // `COPY_PENDING` - a pending `kabinet.*` string would turn production sign-in off
    // entirely, which this very test exists to gate).
    // 665 with the sex-filter feature's one new gap word, `animalForm.publish.gap.sex`
    // (confirmed directly in chat, pinned in copy-status.test.ts's `SEX_FILTER_COPY`).
    // 666 with the kabinet redesign Phase 2 PR 1's one new key, `kabinet.nav.home`
    // («Головна», owner-approved 2026-10-28, pinned in copy-status.test.ts's K2_FINAL).
    // 670 with the animal form's four section names, `animalForm.sections.*` (owner-approved
    // 2026-10-28/29, pinned in copy-status.test.ts's FORM_SECTIONS_COPY).
    // 680 with the settlement picker's ten strings, `cityPicker.*` (owner-approved Phase 0 table,
    // 2026-10-29, nationwide N4).
    // 681 with kabinet UX round 2: less `nav.home` (no Головна tab), plus `shell.viewSite` and
    // `shell.newTab` (owner-approved 2026-10-29).
    // 684 with kabinet UX round 2's list strings (`animalList.actions.viewOnSite`,
    // `orderInfoLabel`, `row.menuLabel`; owner-approved 2026-10-29).
    // 693 with kabinet UX round 2's Притулок sub-tabs and save bar: `profile.viewOnSite`, six
    // `profileTabs.*` and two `profileEdit.saveBar.*` (owner-approved 2026-10-29).
    expect(pending.length + written.length).toBe(693);
    expect(written).toContain("kabinet.profileEdit.errors.nameTokenGone");
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
