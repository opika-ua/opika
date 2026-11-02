import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { seedPerf } from "@opika/db/perf-seed";
import { setupTestDatabase, testDatabaseUrl } from "@opika/db/test";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ROUTES, routeBlock, runRoutes } from "../../scripts/neon-perf-routes";

/** The route report, against the local test database seeded with the performance corpus. */
const DB_PACKAGE = resolve(fileURLToPath(import.meta.url), "../../../../../packages/db");

describe("neon-perf-routes", () => {
  let cleanup: () => Promise<void>;
  let url: string;
  beforeAll(async () => {
    const setup = await setupTestDatabase();
    cleanup = setup.cleanup;
    vi.spyOn(console, "log").mockImplementation(() => {});
    await seedPerf(setup.db);
    url = process.env.TEST_DATABASE_URL ?? testDatabaseUrl("test");
  }, 180_000);
  afterAll(async () => cleanup?.());

  it("runs every route against the seeded branch with counts, timelines and notes", {
    timeout: 180_000,
  }, async () => {
    const lines: string[] = [];
    await runRoutes(url, (l) => lines.push(l));
    const text = lines.join("\n");
    for (const route of ROUTES) expect(text).toContain(`== ${route.label}`);
    expect(text).not.toContain("skipped");
    expect(text).toMatch(/DB calls: \d+ \| sequential waves/);
    expect(text).toContain("wave 1");
    expect(text).toContain("note:");
    // The animal page: the animal with its shelter in one statement, then the shelter view and the city.
    expect(text).toMatch(/\/tvaryny\/\[animalId\][\s\S]*?DB calls: 3/);
    expect(text).not.toMatch(/postgres(ql)?:\/\//);
    expect(lines.length).toBeLessThan(400);
  });

  it("keeps every public route within its round-trip budget (a regression back to N sequential waves fails)", {
    timeout: 180_000,
  }, async () => {
    // Each statement is held back 100 ms, so the wall time is decided by what depends on what, not by
    // how fast the local database answers: N sequential waves cost about N x 80 ms. (The wave count
    // alone can merge a wave of one branch into the overlapping wave of another, as in the overlay.)
    const latencyMs = 100;
    const costs = await runRoutes(url, () => {}, { latencyMs });
    const budgets: [string, number][] = [
      ["/tvaryny (gallery, unfiltered)", 1],
      ["/tvaryny?misto=<busiest city>", 2],
      ["/tvaryny/[animalId] (animal page)", 2],
      ["/tvaryny/@preview/[animalId] (gallery overlay)", 2],
      ["/prytulky/[shelterId] (busiest shelter)", 2],
      // No match adds one count after the page, and the shelter's own city one more.
      ["/prytulky/[shelterId] (shelter with no animals)", 3],
      ["animals.cardsByIds (/zberezheni, 12 saved cards)", 1],
      ["/sitemap.xml (every public animal)", 1],
    ];
    for (const [label, budget] of budgets) {
      const cost = costs.get(label);
      expect(cost, label).toBeTruthy();
      expect(cost?.waves, label).toBeLessThanOrEqual(budget);
      expect(cost?.wallMs, label).toBeLessThan((budget + 0.9) * latencyMs);
    }
    // The saved cards are one statement, the animal page three: not one per lookup.
    expect(costs.get("animals.cardsByIds (/zberezheni, 12 saved cards)")?.calls).toBe(1);
    expect(costs.get("/tvaryny/[animalId] (animal page)")?.calls).toBe(3);
  });

  it("flags a repeated statement and a duplicate read in a synthetic route", () => {
    const route = { ...(ROUTES[0] as (typeof ROUTES)[number]), notes: [] };
    const call = (i: number, sql: string, params: unknown[]) => ({
      sql,
      params,
      start: i * 10,
      end: i * 10 + 5,
    });
    const block = routeBlock(
      route,
      [
        call(0, 'select * from "cities" where "id" = $1', ["a"]),
        call(1, 'select * from "cities" where "id" = $1', ["b"]),
        call(2, 'select * from "cities" where "id" = $1', ["c"]),
        call(3, 'select * from "shelters" where "id" = $1', ["s"]),
        call(4, 'select * from "shelters" where "id" = $1', ["s"]),
      ],
      50,
    ).join("\n");
    expect(block).toContain("N+1 SUSPECT: SELECT cities issued 3 times");
    expect(block).toContain("DUPLICATE READ: SELECT shelters x2");
    expect(block).toContain("sequential waves (critical path, in round trips): 5");
  });

  it("refuses production before connecting, with no secret in the output", {
    timeout: 120_000,
  }, () => {
    for (const args of [
      ["--expect", "ep-quiet-lake-a1b2c3"],
      ["--prod", "--expect", "ep-quiet-lake-a1b2c3"],
    ]) {
      const result = spawnSync(
        "npx",
        [
          "tsx",
          "--import",
          "./test/no-network.mjs",
          "../../apps/web/scripts/neon-perf-routes.ts",
          ...args,
        ],
        {
          cwd: DB_PACKAGE,
          encoding: "utf8",
          shell: process.platform === "win32",
          env: {
            NODE_ENV: "test",
            ...Object.fromEntries(
              Object.entries(process.env).filter(([k]) => !/^(PG|PROD_NEON_ENDPOINT$)/i.test(k)),
            ),
            DATABASE_URL:
              "postgresql://u:secret@ep-quiet-lake-a1b2c3.eu-central-1.aws.neon.tech/neondb",
            PROD_NEON_ENDPOINT: "ep-quiet-lake-a1b2c3",
            PROD_GUARD_ENV_FILE: resolve(tmpdir(), "opika-prod-guard-test-no-such-file.env"),
          },
          timeout: 90_000,
        },
      );
      expect(result.status, result.stderr).toBe(1);
      expect(result.stderr).toContain("REFUSED");
      if (!args.includes("--prod")) expect(result.stderr).toContain("PRODUCTION");
      expect(`${result.stdout}${result.stderr}`).not.toMatch(/secret|postgres(ql)?:\/\//);
    }
  });
});
