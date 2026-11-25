import type {
  LoginEmailChangeOutcome,
  LoginEmailChangeWrite,
  RegistrantApplication,
} from "@opika/db/repos";
import type { ShelterId } from "@opika/domain";
import { describe, expect, it } from "vitest";
import type { Allowance } from "../../features/registration/limits";
import type { TransactionalSendResult } from "../registration-email";
import { type ChangeLoginEmailDeps, changeLoginEmailWith } from "./change-login-email";
import { confirmationDedupKey } from "./registration-mail";

const NOW = new Date("2026-11-25T10:00:00.000Z");
const OLD = "old-address@example.org";
const NEW = "new-address@example.org";
const APPLICATION: RegistrantApplication = {
  userId: "user-1",
  email: OLD,
  emailVerified: false,
  shelterId: "shelter-1" as ShelterId,
  displayName: "Тестовий хвіст",
  status: "application",
};
const RIGHT = "правильний пароль";

function harness(
  overrides: Partial<ChangeLoginEmailDeps> & {
    application?: RegistrantApplication | null;
    outcome?: LoginEmailChangeOutcome;
    confirmation?: TransactionalSendResult;
    taken?: boolean;
  } = {},
) {
  const calls: string[] = [];
  const writes: LoginEmailChangeWrite[] = [];
  const confirmations: { email: string; key: string }[] = [];
  const notices: { to: string; maskedEmail: string; key: string; input: unknown }[] = [];
  const scheduled: (() => Promise<void>)[] = [];
  const logs: string[] = [];
  let ids = 0;
  const deps: ChangeLoginEmailDeps = {
    enabled: true,
    caller: { userId: "user-1", sessionId: "session-here" },
    now: NOW,
    allowUser: async () => {
      calls.push("allowUser");
      return { kind: "ok" };
    },
    allowAddress: async () => {
      calls.push("allowAddress");
      return { kind: "ok" };
    },
    takeDailyMail: async () => {
      calls.push("takeDailyMail");
      return true;
    },
    verifyPassword: async (hash, password) => {
      calls.push("verifyPassword");
      return hash === "hash-1" && password === RIGHT;
    },
    repo: {
      applicationOf: async () =>
        overrides.application === undefined ? APPLICATION : overrides.application,
      credentialHashOf: async () => "hash-1",
      hasAccount: async () => {
        calls.push("hasAccount");
        return overrides.taken ?? false;
      },
      changeLoginEmail: async (input) => {
        calls.push("write");
        writes.push(input);
        return overrides.outcome ?? { kind: "changed" };
      },
    },
    newId: () => `history-${++ids}`,
    newToken: () => `token-${++ids}`,
    hashToken: (token) => `sha(${token})`,
    sendConfirmation: async (input, key) => {
      confirmations.push({ email: input.email, key });
      return overrides.confirmation ?? "sent";
    },
    sendNotice: async (input, key) => {
      notices.push({ to: input.to, maskedEmail: input.maskedEmail, key, input });
      return "sent";
    },
    schedule: (work) => {
      scheduled.push(work);
    },
    log: (reason) => {
      logs.push(reason);
    },
    ...overrides,
  };
  const run = async (
    raw: { email: unknown; password: unknown } = { email: NEW, password: RIGHT },
  ) => {
    const result = await changeLoginEmailWith(deps, raw);
    for (const work of scheduled.splice(0)) await work();
    return result;
  };
  return { deps, run, calls, writes, confirmations, notices, logs };
}

describe("changeLoginEmailWith", () => {
  it("changes the address: one write, the confirmation to the new address, the notice to the old", async () => {
    const h = harness();
    expect(await h.run({ email: "  New-Address@Example.org ", password: RIGHT })).toEqual({
      kind: "changed",
      email: NEW,
      confirmation: "sent",
    });
    expect(h.writes).toHaveLength(1);
    const write = h.writes[0];
    expect(write).toMatchObject({
      userId: "user-1",
      from: OLD,
      to: NEW,
      passwordHash: "hash-1",
      keepSessionId: "session-here",
      history: { entry: { kind: "login_email_changed", at: NOW, by: { kind: "self" } } },
    });
    expect(write?.tokens.map((token) => token.purpose)).toEqual(["confirm_email", "not_me"]);
    expect(write?.tokens.every((token) => token.tokenHash.startsWith("sha("))).toBe(true);
    // 14 days, as a resend's; applied_at is not touched (D10).
    expect(write?.tokens[0]?.expiresAt).toEqual(new Date(NOW.getTime() + 14 * 86_400_000));
    expect(h.confirmations.map((sent) => sent.email)).toEqual([NEW]);
    expect(h.notices.map((sent) => sent.to)).toEqual([OLD]);
  });

  it("the old-address notice carries the new address masked, never in full", async () => {
    const h = harness();
    await h.run();
    expect(h.notices[0]?.maskedEmail).toBe("n•••s@example.org");
    expect(JSON.stringify(h.notices[0]?.input)).not.toContain(NEW);
  });

  it("each send has its own key, distinct from a resend in the same minute", async () => {
    const h = harness();
    await h.run();
    const confirmKey = h.confirmations[0]?.key;
    const noticeKey = h.notices[0]?.key;
    const historyId = h.writes[0]?.history.id ?? "";
    expect(confirmKey).not.toBe(confirmationDedupKey("user-1", NOW));
    expect(confirmKey).not.toBe(confirmationDedupKey("user-1"));
    expect(confirmKey).toContain(historyId);
    expect(noticeKey).toContain(historyId);
    expect(noticeKey).not.toBe(confirmKey);
  });

  it("a wrong password changes nothing, and the per-user budget was charged before the check", async () => {
    const h = harness();
    expect(await h.run({ email: NEW, password: "не той" })).toEqual({ kind: "wrong_password" });
    expect(h.calls.indexOf("allowUser")).toBeGreaterThanOrEqual(0);
    expect(h.calls.indexOf("allowUser")).toBeLessThan(h.calls.indexOf("verifyPassword"));
    expect(h.writes).toEqual([]);
    expect(h.confirmations).toEqual([]);
    expect(h.notices).toEqual([]);
  });

  it("over the per-user budget: refused before the password is looked at", async () => {
    const limited: Allowance = { kind: "limited", retryAfterSeconds: 120 };
    const h = harness({
      allowUser: async () => limited,
      verifyPassword: async () => {
        throw new Error("the password must not be checked");
      },
    });
    expect(await h.run()).toEqual({ kind: "rate_limited", retryAfterSeconds: 120 });
    expect(h.writes).toEqual([]);
  });

  it.each([
    [
      "the per-user store is down",
      { allowUser: async (): Promise<Allowance> => ({ kind: "unavailable" }) },
    ],
    [
      "the per-address store is down",
      { allowAddress: async (): Promise<Allowance> => ({ kind: "unavailable" }) },
    ],
  ])("limiter_unavailable when %s, nothing written", async (_why, overrides) => {
    const h = harness(overrides);
    expect(await h.run()).toEqual({ kind: "limiter_unavailable" });
    expect(h.writes).toEqual([]);
  });

  it("the per-address budget on the new address refuses with its wait", async () => {
    const h = harness({
      allowAddress: async () => ({ kind: "limited", retryAfterSeconds: 900 }),
    });
    expect(await h.run()).toEqual({ kind: "rate_limited", retryAfterSeconds: 900 });
    expect(h.writes).toEqual([]);
  });

  it.each([
    ["the address is confirmed", { application: { ...APPLICATION, emailVerified: true } }],
    ["the operator has decided", { application: { ...APPLICATION, status: "pending" as const } }],
    ["the shelter isn't self-registered", { application: null }],
    ["it is a support view or nobody", { caller: null }],
    ["the flag is off", { enabled: false }],
  ])("not_needed when %s, nothing charged or written", async (_why, overrides) => {
    const h = harness(overrides);
    expect(await h.run()).toEqual({ kind: "not_needed" });
    expect(h.calls).toEqual([]);
  });

  it("a taken address answers email_taken, as registration does, before the cap", async () => {
    const h = harness({ taken: true });
    expect(await h.run()).toEqual({ kind: "email_taken" });
    expect(h.calls).not.toContain("takeDailyMail");
    expect(h.writes).toEqual([]);
  });

  it("the write's own email_taken (a race on the unique index) is the same answer", async () => {
    const h = harness({ outcome: { kind: "email_taken" } });
    expect(await h.run()).toEqual({ kind: "email_taken" });
    expect(h.confirmations).toEqual([]);
    expect(h.notices).toEqual([]);
  });

  it("at the day's cap: daily_cap, nothing written", async () => {
    const h = harness({ takeDailyMail: async () => false });
    expect(await h.run()).toEqual({ kind: "daily_cap" });
    expect(h.writes).toEqual([]);
  });

  it.each([
    [{ email: "", password: RIGHT }, { email: "required" }],
    [{ email: "not-an-address", password: RIGHT }, { email: "email" }],
    [{ email: NEW, password: "" }, { password: "required" }],
    [{ email: OLD.toUpperCase(), password: RIGHT }, { email: "same_email" }],
  ])("invalid input %j: %j, nothing written", async (raw, fields) => {
    const h = harness();
    expect(await h.run(raw)).toEqual({ kind: "invalid", fields });
    expect(h.writes).toEqual([]);
  });

  it("a failed write is failed; a failed confirmation still reports the change", async () => {
    const thrown = harness({
      repo: {
        ...harness().deps.repo,
        changeLoginEmail: async () => {
          throw new Error("down");
        },
      },
    });
    expect(await thrown.run()).toEqual({ kind: "failed" });
    expect(thrown.confirmations).toEqual([]);

    const unsent = harness({ confirmation: "failed" });
    expect(await unsent.run()).toEqual({ kind: "changed", email: NEW, confirmation: "failed" });
    expect(unsent.notices).toHaveLength(1);
  });

  it("logs reason codes only, never an address or the password", async () => {
    const h = harness({ taken: true });
    await h.run();
    await harness().run({ email: NEW, password: "не той" });
    expect(h.logs).toEqual(["email_taken"]);
    for (const line of h.logs) expect(line).not.toMatch(/@|пароль/);
  });
});
