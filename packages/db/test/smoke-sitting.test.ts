import { describe, expect, it } from "vitest";
import {
  type ProductionImportSittingInput,
  renderProductionImportSitting,
  renderSmokeSitting,
  type SmokeSittingInput,
} from "../src/tools/smoke-sitting";

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
    expect(text).toContain('$xlsx = "C:\\path\\kodifikator-07-07.xlsx"');
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

describe("renderSmokeSitting with the import and the timings step (nationwide N3)", () => {
  const withTimings = renderSmokeSitting({
    ...BASE,
    settlementImport: {
      download: { url: "https://example.org/k.xlsx", sha256: "abc123" },
      expectedFirstPlan: "FIRST",
      expectedAfterCommit: "COMMIT",
      expectedRerun: "RERUN",
      expectedAfterReseed: "RESEED",
      timings: { expected: "TIMINGS" },
    },
  });
  const at = (needle: string) => withTimings.indexOf(needle);

  it("times after the import and the reseed, before the connection string is removed", () => {
    const timings = at("db:neon-smoke-timings --expect $ep");
    expect(timings).toBeGreaterThan(at("RESEED"));
    expect(at("# Expected: TIMINGS")).toBeGreaterThan(timings);
    expect(at("Remove-Item Env:DATABASE_URL")).toBeGreaterThan(timings);
    expect(withTimings.match(/db:neon-smoke-timings/g)).toHaveLength(2); // the command and the paste-back line
  });

  it("asks for the whole timings output, and a sitting without it is unchanged", () => {
    expect(withTimings).toContain("paste the whole db:neon-smoke-timings output");
    const without = renderSmokeSitting({
      ...BASE,
      settlementImport: {
        download: { url: "https://example.org/k.xlsx", sha256: "abc123" },
        expectedFirstPlan: "FIRST",
        expectedAfterCommit: "COMMIT",
        expectedRerun: "RERUN",
        expectedAfterReseed: "RESEED",
      },
    });
    expect(without).not.toContain("neon-smoke-timings");
  });

  it("still has no production step", () => {
    expect(withTimings).not.toContain("--prod");
  });
});

describe("renderProductionImportSitting (the combined rehearsal + production sitting)", () => {
  const REHEARSAL: SmokeSittingInput = {
    ...BASE,
    prNumber: 282,
    branch: "perf/cities-search-union",
    sha: "5ec7ea3dcf6fce38fbbf1df5c75366bc71c12e16",
    settlementImport: {
      download: { url: "https://example.org/k.xlsx", sha256: "abc123" },
      expectedFirstPlan: "FIRST",
      expectedAfterCommit: "COMMIT",
      expectedRerun: "RERUN",
      expectedAfterReseed: "RESEED",
      timings: { expected: "TIMINGS" },
    },
  };
  const INPUT: ProductionImportSittingInput = {
    title: "Production settlement import",
    date: "2026-10-29",
    rehearsal: REHEARSAL,
    production: {
      prNumber: 290,
      branch: "feat/prod-import-enable",
      sha: "1111111111111111111111111111111111111111",
      worktreeSlug: "prod-import-run",
      download: { url: "https://example.org/k.xlsx", sha256: "abc123" },
      restoreBranchName: "pre-import-restore",
      lastMigrationTag: "0020_nationwide_geography_schema",
      migrationCount: 21,
      expected: {
        beforeReferences: "BEFORE-REFS",
        dryRun: "DRY",
        afterCommit: "AFTER-COMMIT",
        rerun: "AGAIN",
        afterReferences: "AFTER-REFS",
        site: "SITE",
      },
    },
  };
  const text = renderProductionImportSitting(INPUT);
  const at = (needle: string, from = 0) => text.indexOf(needle, from);

  it("names both SHAs up front and runs Part 1 from the rehearsal PR, Part 2 from the import PR", () => {
    const header = text.slice(0, at("PART 1:"));
    expect(header).toContain(REHEARSAL.sha);
    expect(header).toContain(INPUT.production.sha);
    expect(header).toContain("Confirm BOTH SHAs");
    expect(
      at("git worktree add --detach D:\\opika-worktrees\\sex-filter-smoke 5ec7ea3"),
    ).toBeGreaterThan(-1);
    expect(
      at("git worktree add --detach D:\\opika-worktrees\\prod-import-run 1111111"),
    ).toBeGreaterThan(at("PART 2:"));
  });

  it("contains Part 1 exactly as the ordinary child-branch sitting renders it", () => {
    const part1 = renderSmokeSitting(REHEARSAL);
    expect(text).toContain(part1);
    const partOne = text.slice(at("PART 1:"), at("PART 2:"));
    expect(partOne).not.toContain("--prod");
  });

  it("downloads and checks the file, then reads the production string, then pre-flights, in order", () => {
    const part2 = at("PART 2:");
    const order = [
      "Invoke-WebRequest",
      'if ($hash -ne "abc123") { throw "STOP',
      '$env:DATABASE_URL = Read-Secret "PRODUCTION connection string"',
      'throw "STOP: the connection string is not the production endpoint you typed',
      "db:check-hashes",
      "db:city-references --prod --expect $ep",
      "db:import-settlements --prod --expect $ep --file $xlsx\n",
    ].map((needle) => at(needle, part2));
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(text).toContain("all 21 migrations 'match', through 0020_nationwide_geography_schema");
  });

  it("puts a restore point and a typed confirmation between the dry run and the only --commit", () => {
    const part2 = at("PART 2:");
    const dry = at("db:import-settlements --prod --expect $ep --file $xlsx\n", part2);
    const restore = at('if ($named.Trim() -ne "pre-import-restore") { throw', part2);
    const typed = at("if ($typed.Trim().ToLower() -ne $ep) { throw", part2);
    const commit = at("--file $xlsx --commit", part2);
    expect(dry).toBeGreaterThan(-1);
    expect(restore).toBeGreaterThan(dry);
    expect(typed).toBeGreaterThan(restore);
    expect(commit).toBeGreaterThan(typed);
    // The one write in Part 2; Part 1's rehearsal commits to a child branch without --prod.
    const writes = text
      .slice(part2)
      .split("\n")
      .filter((l) => l.startsWith("pnpm") && l.includes("--commit"));
    expect(writes).toEqual([
      "pnpm --filter @opika/db db:import-settlements --prod --expect $ep --file $xlsx --commit",
    ]);
    expect(text.slice(part2).match(/db:import-settlements --prod --expect \$ep/g)).toHaveLength(3);
  });

  it("reruns dry after the commit, then checks references twice and the site, then cleans up", () => {
    const commit = at("--file $xlsx --commit", at("PART 2:"));
    const rerun = at("# Expected: AGAIN");
    const refs = text.lastIndexOf("db:city-references --prod --expect $ep");
    const curl = at("curl.exe", commit);
    const cleanup = at("Remove-Item Env:DATABASE_URL", curl);
    expect(rerun).toBeGreaterThan(commit);
    expect(refs).toBeGreaterThan(rerun);
    expect(text.match(/db:city-references --prod/g)).toHaveLength(2);
    expect(curl).toBeGreaterThan(refs);
    expect(cleanup).toBeGreaterThan(curl);
    expect(text).toContain("# Expected: AFTER-REFS");
    expect(text).toContain("# Expected: SITE");
  });

  it("never prints a secret: the connection string is only read, parsed for its host and removed", () => {
    for (const line of text.split("\n").filter((l) => l.includes("$env:DATABASE_URL"))) {
      expect(line, line).toMatch(/Read-Secret|\[uri\]/);
    }
    expect(text).not.toMatch(/Write-Host \$env|echo \$env|\$env:PROD_NEON_ENDPOINT\s*$/m);
    expect(text).toContain("Remove-Item Env:PROD_NEON_ENDPOINT");
  });

  it("stays unable to say the one thing no sitting may say, and needs an import-shaped rehearsal", () => {
    expect(text).not.toMatch(/against\s+production/i);
    expect(() =>
      renderProductionImportSitting({ ...INPUT, title: "run it against production" }),
    ).toThrow(/against\s+production/i);
    expect(() =>
      renderProductionImportSitting({
        ...INPUT,
        production: { ...INPUT.production, restoreBranchName: "against  production" },
      }),
    ).toThrow(/against\s+production/i);
    expect(() => renderProductionImportSitting({ ...INPUT, rehearsal: BASE })).toThrow(
      /settlementImport/,
    );
  });
});
