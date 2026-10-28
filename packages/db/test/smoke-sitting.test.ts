import { describe, expect, it } from "vitest";
import { renderSmokeSitting, type SmokeSittingInput } from "../src/tools/smoke-sitting";

const BASE: SmokeSittingInput = {
  title: "Sex-filter PR",
  date: "2026-10-28",
  prNumber: 223,
  branch: "feat/sex-filter",
  sha: "898b0f55def7cd0d7a94dddf53427b24f221362f",
  migrationNote:
    "Migration kind: NONE - the SQL did change (an IN clause), so this waits for a smoke.",
  pointOfThisSmoke: "The new sex filter runs a plain IN over animals.sex.",
  worktreeSlug: "sex-filter-smoke",
  expectedTotal: 55,
  previousTotal: 54,
  newCheckDescription: "step 44b, the sex filter check",
};

describe("renderSmokeSitting", () => {
  it("never puts a real child branch's own connection string on the production endpoint", () => {
    const text = renderSmokeSitting(BASE);
    expect(text).toContain("PROD_NEON_ENDPOINT");
    expect(text).toContain("Child branch connection string (never production's own)");
    expect(text).toContain("git worktree add --detach");
    expect(text).toContain(BASE.sha);
  });

  it("includes every input field somewhere in the output", () => {
    const text = renderSmokeSitting(BASE);
    for (const value of [
      BASE.title,
      BASE.date,
      String(BASE.prNumber),
      BASE.branch,
      BASE.sha,
      BASE.migrationNote,
      BASE.pointOfThisSmoke,
      BASE.worktreeSlug,
      String(BASE.expectedTotal),
      String(BASE.previousTotal),
      BASE.newCheckDescription,
    ]) {
      expect(text, `missing ${JSON.stringify(value)}`).toContain(value);
    }
  });

  it("the fixed template never says the one thing it exists to prevent", () => {
    expect(renderSmokeSitting(BASE)).not.toMatch(/against\s+production/i);
  });

  /**
   * Mutation: the fixed template is the one guaranteed-safe part; the free-text
   * fields are where the 2026-10-28 mistake could still slip back in. Each of
   * the three free-text fields independently triggers the guard.
   */
  it.each([
    ["title", { ...BASE, title: "Smoke, against production directly" }],
    ["migrationNote", { ...BASE, migrationNote: "Run against Production, directly." }],
    ["pointOfThisSmoke", { ...BASE, pointOfThisSmoke: "Smoke AGAINST   PRODUCTION today." }],
  ] as const)("refuses to render when %s contains the phrase", (_field, input) => {
    expect(() => renderSmokeSitting(input)).toThrow(/against\s+production/i);
  });

  it("the guard is case- and whitespace-insensitive, not a literal-string match", () => {
    expect(() =>
      renderSmokeSitting({ ...BASE, pointOfThisSmoke: "AGAINST\nPRODUCTION" }),
    ).toThrow();
  });

  it("a clean input with no mention of the phrase at all still renders", () => {
    expect(() => renderSmokeSitting(BASE)).not.toThrow();
  });
});
