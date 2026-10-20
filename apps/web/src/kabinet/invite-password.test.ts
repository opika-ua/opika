import type { InviteTokenRow } from "@opika/db/repos";
import { describe, expect, it } from "vitest";
import { inMemoryRateLimiter } from "../api/rate-limit";
import {
  type AcceptWithPasswordDeps,
  acceptInvitationWithPassword,
  invitePasswordLandingOf,
  invitePasswordStateOf,
  newInviteToken,
} from "./invite-password";

/**
 * The rules of the invitation link (PW-2), as pure functions over what the database holds, and
 * the POST's order of steps with every dependency a recorder. The same flow against a real
 * Better Auth and Postgres is `invite-password-flows.test.ts`.
 */

const NOW = new Date("2026-10-20T12:00:00.000Z");
const LATER = new Date(NOW.getTime() + 60_000);
const GOOD = "сосни-над-річкою-на-світанку";

const row = (overrides: Partial<InviteTokenRow> = {}): InviteTokenRow => ({
  invitationId: "inv-1",
  status: "pending",
  invitationExpiresAt: LATER,
  linkExpiresAt: LATER,
  email: "olena@example.org",
  shelterName: "Притулок «Ліс»",
  userId: "user-1",
  operator: false,
  member: false,
  hasPassword: false,
  ...overrides,
});

describe("invitePasswordStateOf: which links can set a password", () => {
  it("a pending, unexpired invitation for a user with no role and no password", () => {
    expect(invitePasswordStateOf(row(), NOW)).toEqual({
      kind: "usable",
      invitationId: "inv-1",
      userId: "user-1",
      email: "olena@example.org",
      shelterName: "Притулок «Ліс»",
    });
  });

  it.each([
    ["no row (unknown, or used up)", null],
    ["no user (the clean-up removed them)", row({ userId: null })],
    ["accepted", row({ status: "accepted" })],
    ["withdrawn", row({ status: "canceled" })],
    ["rejected", row({ status: "rejected" })],
    ["the invitation expired, to the millisecond", row({ invitationExpiresAt: NOW })],
    ["the link expired, to the millisecond", row({ linkExpiresAt: NOW })],
    ["the operator's address", row({ operator: true })],
    ["already a member", row({ member: true })],
    ["already has a password", row({ hasPassword: true })],
  ])("%s → unusable", (_name, value) => {
    expect(invitePasswordStateOf(value, NOW)).toEqual({ kind: "unusable" });
  });
});

describe("invitePasswordLandingOf: the link's page", () => {
  it("names the shelter and the address, masked, and never looks up a token of the wrong shape", async () => {
    const asked: string[] = [];
    const lookup = async (token: string) => {
      asked.push(token);
      return row();
    };
    const token = newInviteToken();
    expect(await invitePasswordLandingOf(token, { lookup, now: NOW })).toEqual({
      kind: "form",
      shelterName: "Притулок «Ліс»",
      maskedEmail: "o•••@example.org",
    });
    for (const bad of ["", "short", `${token}x`, `${token.slice(0, 42)}=`]) {
      expect(await invitePasswordLandingOf(bad, { lookup, now: NOW })).toEqual({
        kind: "unusable",
      });
    }
    expect(asked).toEqual([token]);
  });

  it("a token is 43 base64url characters, never the same twice", () => {
    const a = newInviteToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newInviteToken()).not.toBe(a);
  });
});

/** Every dependency records its call, in one shared order. */
function recording(overrides: Partial<AcceptWithPasswordDeps> = {}) {
  const calls: string[] = [];
  const deps: AcceptWithPasswordDeps = {
    lookup: async () => {
      calls.push("lookup");
      return row();
    },
    consume: async () => {
      calls.push("consume");
      return true;
    },
    voidResetLinks: async () => {
      calls.push("voidResetLinks");
    },
    accept: async (userId) => {
      calls.push(`accept:${userId}`);
      return { kind: "nothing_to_accept" };
    },
    perIp: {
      check: async () => {
        calls.push("perIp");
        return true;
      },
    },
    ip: "198.51.100.7",
    credentials: {
      createCredential: async (userId) => {
        calls.push(`createCredential:${userId}`);
      },
      signIn: async (email) => {
        calls.push(`signIn:${email}`);
        return { kind: "signed_in", userId: "user-1", setCookies: ["kabinet.session_token=x"] };
      },
    },
    now: NOW,
    ...overrides,
  };
  return { calls, deps };
}

const token = newInviteToken();

describe("acceptInvitationWithPassword: the order of the steps", () => {
  it("charges, reads, uses the link up, writes the credential, voids reset links, signs in, then accepts", async () => {
    const { calls, deps } = recording();
    expect(await acceptInvitationWithPassword({ token, password: GOOD }, deps)).toEqual({
      kind: "signed_in",
      setCookies: ["kabinet.session_token=x"],
    });
    expect(calls).toEqual([
      "perIp",
      "lookup",
      "consume",
      "createCredential:user-1",
      "voidResetLinks",
      "signIn:olena@example.org",
      "accept:user-1",
    ]);
  });

  it("over the per-IP budget: refused before anything is read", async () => {
    const { calls, deps } = recording({
      perIp: inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 0 }),
    });
    expect(await acceptInvitationWithPassword({ token, password: GOOD }, deps)).toEqual({
      kind: "rate_limited",
    });
    expect(calls).toEqual([]);
  });

  it("a refused password uses nothing up and writes nothing", async () => {
    const { calls, deps } = recording();
    expect(
      await acceptInvitationWithPassword({ token, password: "olena-має-пароль-тут" }, deps),
    ).toEqual({ kind: "rejected", reason: "contains_personal" });
    expect(calls).toEqual(["perIp", "lookup"]);
  });

  it("a link another submission used first: unusable, with no credential written", async () => {
    const { calls, deps } = recording({ consume: async () => false });
    expect(await acceptInvitationWithPassword({ token, password: GOOD }, deps)).toEqual({
      kind: "unusable",
    });
    expect(calls).toEqual(["perIp", "lookup"]);
  });

  it("the address is the invitation's: the request carries none, and the sign-in uses the invitation's", async () => {
    const { calls, deps } = recording({
      lookup: async () => row({ email: "invited@example.org" }),
    });
    await acceptInvitationWithPassword({ token, password: GOOD }, deps);
    expect(calls).toContain("signIn:invited@example.org");
  });

  it("a sign-in that doesn't go through, or signs in someone else: password_set, no cookie handed on, nothing accepted", async () => {
    for (const signIn of [
      async () => ({ kind: "refused" as const }),
      async () => ({ kind: "signed_in" as const, userId: "someone-else", setCookies: ["c=1"] }),
    ]) {
      const { calls, deps } = recording();
      deps.credentials = { ...deps.credentials, signIn };
      expect(await acceptInvitationWithPassword({ token, password: GOOD }, deps)).toEqual({
        kind: "password_set",
      });
      expect(calls.some((call) => call.startsWith("accept:"))).toBe(false);
    }
  });

  it("an accept that fails still signs in: /kabinet retries it, as after a magic link", async () => {
    const { deps } = recording({ accept: async () => ({ kind: "failed" }) });
    expect(await acceptInvitationWithPassword({ token, password: GOOD }, deps)).toMatchObject({
      kind: "signed_in",
    });
  });
});
