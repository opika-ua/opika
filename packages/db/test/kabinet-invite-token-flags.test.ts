import { describe, expect, it } from "vitest";
import {
  inviteTokenRowOf,
  isRefusalFlagSet,
  type RawInviteTokenRow,
} from "../src/repos/kabinet-invite-token-repo";

/**
 * PW-2 review finding 1, fixed per Oleksii, 2026-10-21, verbatim excerpt: "The three refusal
 * checks (operator, has a password, already a member) fail closed: anything other than an
 * explicit “not refused” counts as refused. Add tests for true, 't', 1, null, undefined and an
 * unexpected shape." Whatever a driver hands back for one of `landingOf`'s three EXISTS flags,
 * only `false` reads as "not refused". The page and the POST over such a row:
 * `apps/web/src/kabinet/invite-password.test.ts`.
 */

const LATER = new Date("2026-10-21T12:00:00.000Z");

const raw = (flags: Partial<Pick<RawInviteTokenRow, "operator" | "member" | "hasPassword">>) =>
  ({
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
    ...flags,
  }) satisfies RawInviteTokenRow;

/** Every value a driver could plausibly hand back that isn't the boolean `false`. */
const NOT_EXPLICITLY_FALSE: ReadonlyArray<readonly [string, unknown]> = [
  ["true", true],
  ["'t'", "t"],
  ["1", 1],
  ["null", null],
  ["undefined", undefined],
  ["an object", { exists: false }],
  ["the string 'false'", "false"],
  ["0", 0],
  ["'f'", "f"],
];

describe("isRefusalFlagSet: fail closed", () => {
  it("only an explicit false lifts a refusal", () => {
    expect(isRefusalFlagSet(false)).toBe(false);
  });

  it.each(NOT_EXPLICITLY_FALSE)("%s → refused", (_name, value) => {
    expect(isRefusalFlagSet(value)).toBe(true);
  });
});

describe("inviteTokenRowOf: each of the three flags, alone", () => {
  for (const flag of ["operator", "member", "hasPassword"] as const) {
    it.each(NOT_EXPLICITLY_FALSE)(`${flag} = %s → ${flag} refused`, (_name, value) => {
      const row = inviteTokenRowOf(raw({ [flag]: value }));
      expect(row[flag]).toBe(true);
      // The other two stay as the driver said: an explicit false.
      for (const other of ["operator", "member", "hasPassword"] as const) {
        if (other !== flag) expect(row[other], other).toBe(false);
      }
    });
  }

  it("all three explicitly false: nothing refused, and the rest of the row as read", () => {
    expect(inviteTokenRowOf(raw({}))).toEqual(raw({}));
  });
});
