import {
  CONTACT_TOO_MANY_CHANNELS_MESSAGE,
  SHELTER_DESCRIPTION_TOO_LONG_MESSAGE,
} from "@opika/domain";
import { describe, expect, it } from "vitest";
import { writeFailureOf } from "./write-result";

const err = (code: string, data?: unknown) => Object.assign(new Error(code), { code, data });

describe("writeFailureOf", () => {
  it.each([
    [err("CONFLICT"), { kind: "conflict" }],
    [err("ILLEGAL_TRANSITION"), { kind: "illegal_transition" }],
    [
      err("BAD_REQUEST", {
        issues: [{ path: ["contact", "additional"], message: CONTACT_TOO_MANY_CHANNELS_MESSAGE }],
      }),
      { kind: "too_many_channels" },
    ],
    [
      err("BAD_REQUEST", {
        issues: [{ path: ["description", "uk"], message: SHELTER_DESCRIPTION_TOO_LONG_MESSAGE }],
      }),
      { kind: "description_too_long" },
    ],
    [
      err("FORBIDDEN", { issues: [{ message: SHELTER_DESCRIPTION_TOO_LONG_MESSAGE }] }),
      { kind: "failed" },
    ],
    [
      err("BAD_REQUEST", { issues: [{ path: ["contact"], message: "Too big" }] }),
      { kind: "failed" },
    ],
    [err("BAD_REQUEST"), { kind: "failed" }],
    [
      err("FORBIDDEN", { issues: [{ message: CONTACT_TOO_MANY_CHANNELS_MESSAGE }] }),
      { kind: "failed" },
    ],
  ])("%s -> %j", (error, expected) => {
    expect(writeFailureOf(error)).toEqual(expected);
  });

  it("no code at all is no answer", () => {
    expect(writeFailureOf(new TypeError("Failed to fetch"))).toEqual({ kind: "no_answer" });
  });
});
