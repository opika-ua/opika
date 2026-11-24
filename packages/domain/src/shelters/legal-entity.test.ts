import { describe, expect, it } from "vitest";
import { organisationWordOf } from "./legal-entity";

describe("organisationWordOf", () => {
  it.each([
    ["unregistered_initiative", "initiative"],
    ["registered_ngo", "shelter"],
    ["sole_proprietor", "shelter"],
    // D1: no form chosen yet keeps today's word.
    [null, "shelter"],
  ] as const)("%s is a %s", (kind, word) => {
    expect(organisationWordOf(kind)).toBe(word);
  });
});
