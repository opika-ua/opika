import { describe, expect, it } from "vitest";
import { ModeratorIdSchema, ShelterAdminIdSchema } from "../../primitives/ids";
import {
  type LoginEmailChangeActorChecked,
  type LoginEmailSubject,
  loginEmailChangeDecisionOf,
  maskEmailAddress,
} from "./login-email";

const NOW = new Date("2026-11-25T10:00:00.000Z");
const ADMIN = ShelterAdminIdSchema.parse("33333333-3333-4333-8333-333333333333");
const MOD = ModeratorIdSchema.parse("11111111-1111-4111-8111-111111111111");
const SUBJECT: LoginEmailSubject = {
  email: "old-address@example.org",
  emailVerified: false,
  status: "application",
  source: "self_registration",
};
const SELF: LoginEmailChangeActorChecked = {
  kind: "self",
  shelterAdminId: ADMIN,
  passwordCheck: "matches",
};

describe("loginEmailChangeDecisionOf", () => {
  it("changes an unconfirmed application's address, with a line that holds no address", () => {
    const decision = loginEmailChangeDecisionOf(SUBJECT, "new@example.org", SELF, NOW);
    expect(decision).toEqual({
      kind: "change",
      from: "old-address@example.org",
      to: "new@example.org",
      entry: {
        kind: "login_email_changed",
        at: NOW,
        by: { kind: "self", shelterAdminId: ADMIN },
      },
    });
    if (decision.kind === "change") expect(JSON.stringify(decision.entry)).not.toContain("@");
  });

  it.each([
    ["a confirmed address", { emailVerified: true }],
    ["an accepted shelter", { status: "pending" }],
    ["a rejected application", { status: "rejected" }],
    ["an operator-created shelter", { source: "operator" }],
  ] as const)("not_needed for %s", (_name, overrides) => {
    expect(
      loginEmailChangeDecisionOf({ ...SUBJECT, ...overrides }, "new@example.org", SELF, NOW),
    ).toEqual({ kind: "not_needed" });
  });

  it("a wrong password, before anything about the address", () => {
    const wrong = { ...SELF, passwordCheck: "wrong" } as const;
    expect(loginEmailChangeDecisionOf(SUBJECT, "new@example.org", wrong, NOW)).toEqual({
      kind: "wrong_password",
    });
    expect(loginEmailChangeDecisionOf(SUBJECT, SUBJECT.email, wrong, NOW)).toEqual({
      kind: "wrong_password",
    });
  });

  it("the same address, in any case or with spaces, is same_email", () => {
    expect(loginEmailChangeDecisionOf(SUBJECT, " Old-Address@Example.org ", SELF, NOW)).toEqual({
      kind: "same_email",
    });
  });

  it("the operator's reason is kept trimmed, for the operator's history only", () => {
    const decision = loginEmailChangeDecisionOf(
      SUBJECT,
      "new@example.org",
      { kind: "operator", moderatorId: MOD, reason: "  Написали з іншої адреси " },
      NOW,
    );
    expect(decision).toMatchObject({
      kind: "change",
      entry: { by: { kind: "operator", moderatorId: MOD, reason: "Написали з іншої адреси" } },
    });
  });
});

describe("maskEmailAddress (D5)", () => {
  it.each([
    ["user9@gmail.com", "u•••9@gmail.com"],
    ["olena@example.org", "o•••a@example.org"],
    ["abcd@x.ua", "a•••d@x.ua"],
    ["abc@x.ua", "a•••@x.ua"],
    ["ab@x.ua", "a•••@x.ua"],
    ["a@x.ua", "a•••@x.ua"],
    ["anna+opika@x.ua", "a•••a@x.ua"],
    ["an+opika@x.ua", "a•••@x.ua"],
    ["+tag@x.ua", "•••"],
    ["no-at-sign", "•••"],
    ["@example.org", "•••"],
    ["olena@xn--80aswg.xn--p1ai", "o•••a@xn--80aswg.xn--p1ai"],
    ['"a@b"@example.org', '"•••"@example.org'],
  ])("%s → %s", (address, masked) => {
    expect(maskEmailAddress(address)).toBe(masked);
  });

  it("never shows the full local part", () => {
    expect(maskEmailAddress("new-address@example.org")).not.toContain("new-address");
  });
});
