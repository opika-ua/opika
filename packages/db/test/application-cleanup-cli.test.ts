import { describe, expect, it } from "vitest";
import { parseApplicationCleanupArgs } from "../src/application-cleanup";

/** `applications:cleanup` deletes only when told to, exactly once. */
describe("parseApplicationCleanupArgs", () => {
  const argv = (...rest: string[]) => ["node", "application-cleanup.ts", ...rest];

  it("needs exactly one of --dry-run and --commit", () => {
    expect(parseApplicationCleanupArgs(argv()).kind).toBe("refused");
    expect(parseApplicationCleanupArgs(argv("--dry-run", "--commit")).kind).toBe("refused");
    expect(parseApplicationCleanupArgs(argv("--dry-run"))).toEqual({
      kind: "ok",
      commit: false,
      endpoint: undefined,
    });
  });

  it("reads --prod and --expect ep-… beside a commit", () => {
    expect(parseApplicationCleanupArgs(argv("--commit", "--prod", "--expect", "ep-abc"))).toEqual({
      kind: "ok",
      commit: true,
      endpoint: "ep-abc",
    });
  });

  it("refuses a missing or repeated --expect, and anything else", () => {
    expect(parseApplicationCleanupArgs(argv("--dry-run", "--expect")).kind).toBe("refused");
    expect(
      parseApplicationCleanupArgs(argv("--dry-run", "--expect", "ep-a", "--expect", "ep-b")).kind,
    ).toBe("refused");
    expect(parseApplicationCleanupArgs(argv("--dry-run", "--force")).kind).toBe("refused");
  });
});
