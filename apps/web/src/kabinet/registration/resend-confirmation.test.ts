import type { RegistrantApplication, RegistrationTokenPair } from "@opika/db/repos";
import type { ShelterId } from "@opika/domain";
import { describe, expect, it } from "vitest";
import type { TransactionalSendResult } from "../registration-email";
import { type ResendDeps, resendConfirmationWith } from "./resend-confirmation";

const NOW = new Date("2026-11-18T10:00:00.000Z");
const APPLICATION: RegistrantApplication = {
  userId: "user-1",
  email: "olena@example.org",
  emailVerified: false,
  shelterId: "shelter-1" as ShelterId,
  displayName: "Тестовий хвіст",
  status: "application",
};

function harness(
  overrides: Partial<ResendDeps> & {
    application?: RegistrantApplication | null;
    sendResult?: TransactionalSendResult;
  } = {},
) {
  const issued: RegistrationTokenPair[] = [];
  const sends: string[] = [];
  const deps: ResendDeps = {
    enabled: true,
    userId: "user-1",
    now: NOW,
    allow: async () => true,
    repo: {
      applicationOf: async () =>
        overrides.application === undefined ? APPLICATION : overrides.application,
      issueTokens: async (_userId, tokens) => {
        issued.push(tokens);
      },
    },
    newToken: () => `t${issued.length}`,
    hashToken: (token) => `sha(${token})`,
    send: async (input) => {
      sends.push(input.email);
      return overrides.sendResult ?? "sent";
    },
    ...overrides,
  };
  return { deps, issued, sends };
}

describe("resendConfirmationWith", () => {
  it("issues two fresh links (hashes only) and sends the email to the registrant", async () => {
    const h = harness();
    expect(await resendConfirmationWith(h.deps)).toEqual({ kind: "sent" });
    expect(h.issued).toHaveLength(1);
    expect(h.issued[0]?.map((token) => token.purpose)).toEqual(["confirm_email", "not_me"]);
    expect(h.issued[0]?.every((token) => token.tokenHash.startsWith("sha("))).toBe(true);
    expect(h.sends).toEqual(["olena@example.org"]);
  });

  it.each([
    ["the flag is off", { enabled: false }],
    ["nobody is signed in", { userId: null }],
    ["the address is confirmed", { application: { ...APPLICATION, emailVerified: true } }],
    ["the operator has decided", { application: { ...APPLICATION, status: "pending" as const } }],
    ["the shelter isn't self-registered", { application: null }],
  ])("does nothing when %s", async (_why, overrides) => {
    const h = harness(overrides);
    expect(await resendConfirmationWith(h.deps)).toEqual({ kind: "not_needed" });
    expect(h.issued).toEqual([]);
    expect(h.sends).toEqual([]);
  });

  it("over the per-user budget: rate_limited, nothing issued or sent", async () => {
    const h = harness({ allow: async () => false });
    expect(await resendConfirmationWith(h.deps)).toEqual({ kind: "rate_limited" });
    expect(h.issued).toEqual([]);
    expect(h.sends).toEqual([]);
  });

  it("says failed when the provider refused, and sent for the same minute's duplicate", async () => {
    expect(await resendConfirmationWith(harness({ sendResult: "failed" }).deps)).toEqual({
      kind: "failed",
    });
    expect(await resendConfirmationWith(harness({ sendResult: "duplicate" }).deps)).toEqual({
      kind: "sent",
    });
  });
});
