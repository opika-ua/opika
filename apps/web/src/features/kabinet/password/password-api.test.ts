import { describe, expect, it } from "vitest";
import { changeOutcomeOf, forgotOutcomeOf, resetOutcomeOf, signInOutcomeOf } from "./password-api";

/** How each answer the server can give becomes one state of a form (one sentence each). */
describe("the password answers, read by status and code only", () => {
  const answer = (status: number, body: unknown = null) => ({ status, body });

  it("sign-in: 200 is in; every refusal reads the same; the delay's minutes; the per-IP budget is a minute", () => {
    expect(signInOutcomeOf(answer(200, { status: true }))).toEqual({ kind: "signed_in" });
    for (const refused of [
      answer(401, { code: "INVALID_EMAIL_OR_PASSWORD" }),
      answer(400, { code: "INVALID_EMAIL" }),
      answer(403),
    ]) {
      expect(signInOutcomeOf(refused)).toEqual({ kind: "wrong" });
    }
    expect(signInOutcomeOf(answer(429, { code: "SIGN_IN_DELAYED", retryAfterMinutes: 8 }))).toEqual(
      { kind: "throttled", minutes: 8 },
    );
    expect(signInOutcomeOf(answer(429))).toEqual({ kind: "throttled", minutes: 1 });
    expect(signInOutcomeOf(answer(503))).toEqual({ kind: "failed" });
    expect(signInOutcomeOf(null)).toEqual({ kind: "failed" });
  });

  it("forgot: sent, throttled, failed", () => {
    expect(forgotOutcomeOf(answer(200, { status: true }))).toEqual({ kind: "sent" });
    expect(forgotOutcomeOf(answer(429))).toEqual({ kind: "throttled" });
    expect(forgotOutcomeOf(null)).toEqual({ kind: "failed" });
  });

  it("reset: each refusal by its code, an invalid link, throttled, failed", () => {
    expect(resetOutcomeOf(answer(200))).toEqual({ kind: "done" });
    for (const [code, refusal] of [
      ["PASSWORD_TOO_SHORT", "too_short"],
      ["PASSWORD_TOO_LONG", "too_long"],
      ["PASSWORD_COMMON", "common"],
      ["PASSWORD_CONTAINS_PERSONAL", "contains_personal"],
    ] as const) {
      expect(resetOutcomeOf(answer(400, { code }))).toEqual({ kind: "refused", refusal });
    }
    expect(resetOutcomeOf(answer(400, { code: "INVALID_TOKEN" }))).toEqual({
      kind: "invalid_link",
    });
    expect(resetOutcomeOf(answer(429))).toEqual({ kind: "throttled" });
    expect(resetOutcomeOf(null)).toEqual({ kind: "failed" });
  });

  it("change: the wrong current password, no password yet, a refusal, done", () => {
    expect(changeOutcomeOf(answer(200))).toEqual({ kind: "done" });
    expect(changeOutcomeOf(answer(400, { code: "INVALID_PASSWORD" }))).toEqual({
      kind: "wrong_current",
    });
    expect(changeOutcomeOf(answer(400, { code: "CREDENTIAL_ACCOUNT_NOT_FOUND" }))).toEqual({
      kind: "no_password",
    });
    expect(changeOutcomeOf(answer(400, { code: "PASSWORD_COMMON" }))).toEqual({
      kind: "refused",
      refusal: "common",
    });
    expect(changeOutcomeOf(answer(403))).toEqual({ kind: "failed" });
  });
});
