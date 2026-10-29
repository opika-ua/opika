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

  it("a sitting without a migration runs no migration anywhere", () => {
    expect(renderSmokeSitting(BASE)).not.toContain("db:migrate");
  });
});

describe("renderSmokeSitting, for a PR with a migration", () => {
  const TAG = "0019_sessions_adopter_id_index";
  const WITH_MIGRATION: SmokeSittingInput = { ...BASE, migration: { tag: TAG } };
  const text = renderSmokeSitting(WITH_MIGRATION);
  const at = (needle: string) => text.indexOf(needle);

  it("migrates and checks the child branch, then smokes it, then migrates production", () => {
    const childMigrate = at("db:migrate --expect $ep");
    const childHashes = at("db:check-hashes");
    const smoke = at("db:neon-smoke --expect $ep");
    const productionMigrate = at("db:migrate --prod --expect");
    expect(childMigrate).toBeGreaterThan(-1);
    expect(childHashes).toBeGreaterThan(childMigrate);
    expect(smoke).toBeGreaterThan(childHashes);
    expect(productionMigrate).toBeGreaterThan(smoke);
    expect(text.lastIndexOf("db:check-hashes")).toBeGreaterThan(productionMigrate);
    expect(text).toContain(`${TAG} applied`);
  });

  it("runs the smoke once, on the child branch only", () => {
    expect(text.match(/db:neon-smoke/g)).toHaveLength(1);
    expect(at("db:neon-smoke")).toBeLessThan(at("Production connection string"));
  });

  it("keeps the production endpoint id set until the production migration, which needs it", () => {
    expect(text.match(/Remove-Item Env:PROD_NEON_ENDPOINT/g)).toHaveLength(1);
    expect(at("Remove-Item Env:PROD_NEON_ENDPOINT")).toBeGreaterThan(at("db:migrate --prod"));
  });

  it("still refuses the phrase in free text", () => {
    expect(() =>
      renderSmokeSitting({ ...WITH_MIGRATION, migrationNote: "migrate against production" }),
    ).toThrow(/against\s+production/i);
  });
});

describe("renderSmokeSitting with the settlement import (nationwide N2)", () => {
  const text = renderSmokeSitting({
    ...BASE,
    settlementImport: {
      download: { url: "https://example.org/k.xlsx", sha256: "abc123" },
      expectedFirstPlan: "FIRST",
      expectedAfterCommit: "COMMIT",
      expectedRerun: "RERUN",
      expectedAfterReseed: "RESEED",
    },
  });
  const at = (needle: string) => text.indexOf(needle);

  it("smokes first, then imports, then reruns, then reseeds and checks again, in that order", () => {
    const smoke = at("db:neon-smoke --expect $ep");
    const dry = at("db:import-settlements --expect $ep --file $xlsx\n");
    const commit = at("--file $xlsx --commit");
    const seed = at("db:seed --profile=demo --force --db-name=$dbName");
    expect(smoke).toBeGreaterThan(-1);
    expect(dry).toBeGreaterThan(smoke);
    expect(commit).toBeGreaterThan(dry);
    expect(at("# Expected (rerun, dry): RERUN")).toBeGreaterThan(commit);
    expect(seed).toBeGreaterThan(at("RERUN"));
    expect(at("RESEED")).toBeGreaterThan(seed);
  });

  it("has no production step and never passes --prod: the import refuses production", () => {
    expect(text).not.toContain("--prod");
    expect(text).not.toMatch(/against\s+production/i);
    expect(text.match(/db:import-settlements/g)).toHaveLength(4);
    // Everything runs with the child branch's connection string, removed after the last step.
    expect(at("Remove-Item Env:DATABASE_URL")).toBeGreaterThan(at("RESEED"));
  });

  it("downloads the file, compares its sha256 and stops on a difference, before any import", () => {
    expect(text).toContain('Invoke-WebRequest -Uri "https://example.org/k.xlsx"');
    expect(text).toContain("Get-FileHash -Algorithm SHA256");
    expect(text).toContain('if ($hash -ne "abc123") { throw "STOP');
    expect(at("Get-FileHash")).toBeLessThan(at("db:import-settlements"));
    expect(text).toContain('$xlsx = "C:\path\kodifikator-07-07.xlsx"');
    expect(text).toContain('strip the quotes from a "Copy as path" path');
  });

  it("asks for all four import outputs and explains a second-plan count of 1-8", () => {
    expect(text).toContain("ALL FOUR import outputs");
    expect(text).toContain("1-8 means a legacy city's name differs");
  });

  it("leaves a sitting without an import unchanged", () => {
    expect(renderSmokeSitting(BASE)).not.toContain("db:import-settlements");
  });
});
