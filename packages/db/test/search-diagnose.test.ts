import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { placeQueryOf } from "@opika/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AMBIENT_CONNECTION_VARIABLES } from "../src/prod-guard";
import { searchStatement } from "../src/repos/city-search-repo";
import { setupTestDatabase, testDatabaseUrl } from "../src/test-utils/index";
import {
  assertReadOnly,
  branchStatements,
  CATALOG_STATEMENTS,
  connect,
  DIAGNOSE_PROBES,
  type Diagnosis,
  diagnose,
  diagnoseTarget,
  explainStatement,
  formatReport,
  PENDING_LIST_STATEMENT,
  type ReadOnlyRunner,
  searchKeysOf,
  summarisePlan,
  verdictOf,
} from "../src/tools/search-diagnose";

/** Fake endpoints only. Nothing here resolves. */
const PROD_ENDPOINT = "ep-quiet-lake-a1b2c3";
const PROD = "postgresql://u:secret@ep-quiet-lake-a1b2c3-pooler.eu-central-1.aws.neon.tech/neondb";
const CHILD = "postgresql://u:secret@ep-other-hill-d4e5f6-pooler.eu-central-1.aws.neon.tech/neondb";
const LOCAL = "postgres://opika:opika@localhost:5433/opika";

describe("diagnoseTarget (the importer's own decision)", () => {
  const NO_FILE = resolve(tmpdir(), "opika-prod-guard-test-no-such-file.env");
  const env = (endpoint?: string) => ({
    PROD_GUARD_ENV_FILE: NO_FILE,
    ...(endpoint === undefined ? {} : { PROD_NEON_ENDPOINT: endpoint }),
  });
  const CHILD_EP = "ep-other-hill-d4e5f6";

  it("lets a local database through without --expect", () => {
    expect(diagnoseTarget(LOCAL, [], env())).toEqual({ kind: "ok" });
  });

  it("needs --expect on a child branch, and it must be that compute", () => {
    expect(diagnoseTarget(CHILD, [], env(PROD_ENDPOINT)).kind).toBe("refused");
    expect(
      diagnoseTarget(CHILD, ["--expect", "ep-someone-else-000"], env(PROD_ENDPOINT)).kind,
    ).toBe("refused");
    expect(diagnoseTarget(CHILD, ["--expect", CHILD_EP], env(PROD_ENDPOINT))).toEqual({
      kind: "ok",
    });
    expect(diagnoseTarget(CHILD, [`--expect=${CHILD_EP}`], env(PROD_ENDPOINT))).toEqual({
      kind: "ok",
    });
  });

  it("refuses --prod on a child branch and on a local database", () => {
    expect(
      diagnoseTarget(CHILD, ["--prod", "--expect", CHILD_EP], env(PROD_ENDPOINT)),
    ).toMatchObject({
      kind: "refused",
      reason: expect.stringContaining("not production"),
    });
    expect(diagnoseTarget(LOCAL, ["--prod"], env(PROD_ENDPOINT)).kind).toBe("refused");
  });

  it("refuses a Neon target when production is unknown, with or without --prod (fail closed)", () => {
    for (const argv of [
      ["--expect", CHILD_EP],
      ["--prod", "--expect", CHILD_EP],
    ]) {
      const refused = diagnoseTarget(CHILD, argv, env());
      expect(refused.kind).toBe("refused");
      expect(JSON.stringify(refused)).toContain("PROD_NEON_ENDPOINT");
    }
    expect(diagnoseTarget(PROD, ["--prod", "--expect", PROD_ENDPOINT], env()).kind).toBe("refused");
  });

  it("reads production only with --prod, a known endpoint AND the matching --expect", () => {
    expect(diagnoseTarget(PROD, ["--expect", PROD_ENDPOINT], env(PROD_ENDPOINT)).kind).toBe(
      "refused",
    );
    expect(diagnoseTarget(PROD, ["--prod"], env(PROD_ENDPOINT)).kind).toBe("refused");
    expect(diagnoseTarget(PROD, ["--prod", "--expect", CHILD_EP], env(PROD_ENDPOINT)).kind).toBe(
      "refused",
    );
    expect(diagnoseTarget(PROD, ["--prod", "--expect", PROD_ENDPOINT], env(PROD_ENDPOINT))).toEqual(
      { kind: "ok" },
    );
  });

  it("refuses connection settings in the environment, a non-Neon remote host and a bad URL", () => {
    expect(diagnoseTarget(LOCAL, [], { ...env(), PGHOST: "x" }).kind).toBe("refused");
    expect(diagnoseTarget("postgres://u:p@10.0.0.5/db", ["--prod"], env(PROD_ENDPOINT)).kind).toBe(
      "refused",
    );
    expect(diagnoseTarget("not a url", [], env(PROD_ENDPOINT)).kind).toBe("refused");
  });

  it("never echoes the URL or its password", () => {
    for (const url of [PROD, CHILD, "not a url secret"]) {
      expect(JSON.stringify(diagnoseTarget(url, [], env(PROD_ENDPOINT)))).not.toContain("secret");
    }
  });
});

describe("assertReadOnly (an exact allowlist)", () => {
  const sent = [
    ...Object.values(CATALOG_STATEMENTS),
    PENDING_LIST_STATEMENT,
    { text: "SELECT set_config('enable_seqscan', 'off', true)", params: [] },
    { text: "SELECT set_config('statement_timeout', '30000', true)", params: [] },
    ...DIAGNOSE_PROBES.flatMap((raw) => {
      const keys = searchKeysOf(raw);
      return keys === null ? [] : branchStatements().map((b) => explainStatement(b.where, keys));
    }),
  ];

  it("accepts every statement the tool sends", () => {
    expect(sent.length).toBeGreaterThan(20);
    for (const statement of sent) expect(() => assertReadOnly(statement)).not.toThrow();
  });

  it.each([
    ["a function that writes", "SELECT gin_clean_pending_list('cities_search_latin_trgm_idx')"],
    ["a backend kill", "SELECT pg_terminate_backend(pg_backend_pid())"],
    ["SELECT INTO", "SELECT 1 INTO t"],
    ["a locking read", "SELECT id FROM cities FOR SHARE"],
    ["a locking read for update", "SELECT id FROM cities FOR UPDATE"],
    ["another set_config", "SELECT set_config('default_transaction_read_only', 'off', true)"],
    ["a set_config made non-local", "SELECT set_config('enable_seqscan', 'off', false)"],
    ["an INSERT", "INSERT INTO cities VALUES (1)"],
    ["ANALYZE", "ANALYZE cities"],
    ["VACUUM", "VACUUM cities"],
    ["a second statement", "SELECT 1; DROP TABLE cities"],
    ["EXPLAIN of a delete", "EXPLAIN (ANALYZE, BUFFERS) DELETE FROM cities"],
    ["a CTE delete", "WITH d AS (DELETE FROM cities RETURNING 1) SELECT * FROM d"],
    ["a plain read", "SELECT 1"],
  ])("refuses %s", (_name, text) => {
    expect(() => assertReadOnly({ text, params: [] })).toThrow(/only sends its own/);
  });

  it("matches the text exactly: a trailing comment is a different statement", () => {
    for (const statement of sent) {
      expect(() => assertReadOnly({ ...statement, text: `${statement.text} -- x` })).toThrow();
    }
  });

  it("holds no writing function among the statements it allows", () => {
    const writing =
      /gin_clean_pending_list|pg_terminate_backend|pg_cancel_backend|pg_reload_conf|pg_advisory|nextval|setval|lo_|pg_switch_wal|\bINTO\b|\bFOR (SHARE|UPDATE)\b/i;
    for (const statement of sent) expect(statement.text).not.toMatch(writing);
  });

  it("sends the search keys as parameters, never spliced into the text", () => {
    const keys = searchKeysOf("Миколаї");
    expect(keys).not.toBeNull();
    if (keys === null) return;
    const statement = explainStatement("search_latin LIKE $4", keys);
    expect(statement.params).toEqual([
      keys.cyrillic,
      keys.cyrillicLike,
      keys.latin,
      keys.latinLike,
    ]);
    expect(statement.text).not.toContain(keys.latin);
  });
});

describe("summarisePlan", () => {
  const seq = [
    "Limit  (cost=944.61..944.62 rows=1 width=148) (actual time=28.276..28.281 rows=50 loops=1)",
    "  Buffers: shared hit=737",
    "  ->  Seq Scan on cities  (cost=0.00..944.60 rows=1 width=148) (actual time=0.049..27.487 rows=1994 loops=1)",
    "Planning Time: 0.533 ms",
    "Execution Time: 28.309 ms",
  ];
  const bitmap = [
    "  ->  Bitmap Heap Scan on cities  (cost=1525.89..2308.07 rows=747 width=67) (actual time=3.703..9.119 rows=1994 loops=1)",
    "        ->  Bitmap Index Scan on cities_search_latin_trgm_idx  (cost=0.00..1525.70 rows=2242 width=0) (actual time=3.630..3.631 rows=2831 loops=1)",
    "Execution Time: 9.947 ms",
  ];

  it("names a Seq Scan and its time", () => {
    const s = summarisePlan(seq);
    expect(s.nodes).toEqual(["Seq Scan cities cost 944.60 est 1 rows, actual 27.487 ms 1994 rows"]);
    expect(s.executionMs).toBe(28.309);
    expect(s.topBuffers).toBe("Buffers: shared hit=737");
  });

  it("names the index of a Bitmap Index Scan", () => {
    const s = summarisePlan(bitmap);
    expect(s.nodes).toHaveLength(2);
    expect(s.nodes[1]).toContain("Bitmap Index Scan cities_search_latin_trgm_idx");
    expect(s.executionMs).toBe(9.947);
  });

  it("copes with a plan it cannot read", () => {
    expect(summarisePlan(["something else"])).toEqual({
      nodes: [],
      executionMs: null,
      topBuffers: "",
    });
  });
});

describe("formatReport", () => {
  const empty: Diagnosis = { catalog: {}, pending: null, probes: [] };

  it("says so when indexes are missing and the table was never analyzed", () => {
    const text = formatReport(empty, false).join("\n");
    expect(text).toContain("MISSING: fewer than four search indexes found");
    expect(text).toContain("never analyzed");
    expect(text).toContain("pgstattuple is not installed");
  });

  it("prints the pending list when it can be read", () => {
    const text = formatReport(
      { ...empty, pending: { pending_pages: 339, pending_tuples: 11849 } },
      false,
    );
    expect(text.join("\n")).toContain("339 pages, 11849 tuples");
  });
});

describe("diagnose, with a recording runner", () => {
  it("sends only reads, each batch time-limited first, the seqscan switch only in the second plan batch", async () => {
    const batches: string[][] = [];
    const run: ReadOnlyRunner = async (statements) => {
      for (const s of statements) assertReadOnly(s);
      batches.push(statements.map((s) => s.text));
      return statements.map((s) =>
        s.text.startsWith("EXPLAIN") ? [{ "QUERY PLAN": "Execution Time: 1.0 ms" }] : [],
      );
    };
    const result = await diagnose(run);
    const flat = batches.flat();
    expect(batches.every((b) => b[0]?.includes("statement_timeout"))).toBe(true);
    expect(flat.filter((t) => t.includes("set_config('enable_seqscan"))).toHaveLength(1);
    const seqscanBatch = batches.find((b) =>
      b.some((t) => t.includes("set_config('enable_seqscan")),
    );
    expect(seqscanBatch?.[1]).toContain("set_config('enable_seqscan', 'off', true)");
    expect(flat.filter((t) => t.startsWith("EXPLAIN"))).toHaveLength(2 * 3 * 4);
    expect(result.probes).toHaveLength(3);
    expect(result.probes[0]?.branches[1]?.plans.seqscan_off).toEqual(["Execution Time: 1.0 ms"]);
  });
});

describe("against the local test database", () => {
  let cleanup: () => Promise<void>;
  let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
  beforeAll(async () => {
    ({ db, cleanup } = await setupTestDatabase());
  });
  afterAll(async () => cleanup?.());

  it("reports the four search indexes valid and a plan for every branch of every probe", async () => {
    const result = await diagnose(connect(testDatabaseUrl("test")));
    expect(result.catalog.indexes).toHaveLength(4);
    expect(result.catalog.indexes?.every((r) => r.indisvalid === true)).toBe(true);
    for (const probe of result.probes) {
      expect(probe.branches).toHaveLength(4);
      for (const b of probe.branches) {
        expect(b.plans.default.join("\n")).toContain("Execution Time");
        expect(b.plans.seqscan_off.join("\n")).toContain("Execution Time");
      }
    }
    expect(formatReport(result, true).join("\n")).toContain("branch 2 full plan, default");
  });

  it("the server refuses a write sent through connect(), whatever the validator would say", async () => {
    // The validator is switched off on purpose: this proves the READ ONLY transaction, the second
    // lock. Dropping "read only" from connect() lets these statements through and turns it red.
    const unchecked = connect(testDatabaseUrl("test"), () => undefined);
    await expect(unchecked([{ text: "CREATE TEMP TABLE t (a int)", params: [] }])).rejects.toThrow(
      /read-only/,
    );
    await expect(
      unchecked([{ text: "SELECT id FROM cities FOR SHARE", params: [] }]),
    ).rejects.toThrow(/read-only/);
  });

  it("the branch conditions are the ones city-search-repo's UNION runs", () => {
    // Drift would make the diagnosis describe a query nobody runs.
    const query = placeQueryOf("Миколаї");
    if (query.kind !== "ok") throw new Error("probe too short");
    const repoSql = normalised(searchStatement(db, query, { regionBias: null }, true).toSQL().sql);
    const mine = branchStatements().map((b) => normalised(b.where));
    expect(mine).toHaveLength(4);
    for (const where of mine) expect(repoSql).toContain(where);
    expect(repoSql.match(/ limit /g)?.length).toBeGreaterThanOrEqual(5);
  });
});

/** The real CLI, spawned, with the network disabled in the child: refusals come before any connection. */
describe("the CLI refuses before it connects", () => {
  const PKG = resolve(fileURLToPath(import.meta.url), "../..");
  const NO_ENV_FILE = resolve(tmpdir(), "opika-prod-guard-test-no-such-file.env");
  const INHERITED_ENV = Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) => !(AMBIENT_CONNECTION_VARIABLES as readonly string[]).includes(name.toUpperCase()),
    ),
  );
  const run = (args: readonly string[], url: string, endpoint?: string) =>
    spawnSync(
      "npx",
      ["tsx", "--import", "./test/no-network.mjs", "src/tools/search-diagnose.ts", ...args],
      {
        cwd: PKG,
        encoding: "utf8",
        shell: process.platform === "win32",
        env: {
          ...INHERITED_ENV,
          DATABASE_URL: url,
          ...(endpoint === undefined ? {} : { PROD_NEON_ENDPOINT: endpoint }),
          PROD_GUARD_ENV_FILE: NO_ENV_FILE,
        },
        timeout: 60_000,
      },
    );

  it.each([
    ["production without --prod", PROD, ["--expect", PROD_ENDPOINT], PROD_ENDPOINT],
    ["a child branch without --expect", CHILD, [], PROD_ENDPOINT],
    [
      "a Neon target with production unknown",
      CHILD,
      ["--expect", "ep-other-hill-d4e5f6"],
      undefined,
    ],
  ])("%s", { timeout: 90_000 }, (_name, url, args, endpoint) => {
    const result = run(args, url, endpoint);
    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain("REFUSED");
    expect(result.stderr).toContain("Nothing was run");
    expect(`${result.stdout}${result.stderr}`).not.toContain("secret");
    expect(result.stdout).not.toContain("Target:");
  });
});

describe("verdictOf", () => {
  it("names a Seq Scan and an index use in one word", () => {
    const seq = summarisePlan([
      "  ->  Seq Scan on cities  (cost=0.00..944.60 rows=1 width=148) (actual time=0.049..27.487 rows=1994 loops=1)",
      "Execution Time: 28.3 ms",
    ]);
    const idx = summarisePlan([
      "  ->  Bitmap Heap Scan on cities  (cost=1.00..2.00 rows=7 width=67) (actual time=0.1..0.2 rows=9 loops=1)",
      "        ->  Bitmap Index Scan on cities_search_latin_trgm_idx  (cost=0.00..1.00 rows=2 width=0) (actual time=0.1..0.1 rows=2 loops=1)",
      "Execution Time: 4.5 ms",
    ]);
    expect(verdictOf(seq)).toBe("SEQ SCAN (28.3 ms)");
    expect(verdictOf(idx)).toBe("USES INDEX cities_search_latin_trgm_idx (4.5 ms)");
  });

  it("puts the analyze state and the branch 2 verdict before the settings", () => {
    const text = formatReport({ catalog: {}, pending: null, probes: [] }, false).join("\n");
    expect(text.indexOf("statistics first")).toBeLessThan(text.indexOf("VERDICT"));
    expect(text.indexOf("VERDICT")).toBeLessThan(text.indexOf("--- settings"));
  });
});

/** Quoting, parameter numbers and case differ between the two spellings; the conditions do not. */
function normalised(sqlText: string): string {
  return sqlText
    .replaceAll('"cities".', "")
    .replaceAll('"', "")
    .replace(/\$\d+/g, "?")
    .replace(/\s+/g, " ")
    .toLowerCase();
}
