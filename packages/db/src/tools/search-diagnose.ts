import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { placeQueryOf } from "@opika/domain";
import postgres from "postgres";
import { isNeonHost } from "../client";
import {
  checkProductionWrite,
  databaseTargetLine,
  expectedTargetOf,
  HOST_AMBIGUITY_TEXT,
  productionEndpoint,
} from "../prod-guard";

/**
 * `pnpm --filter @opika/db db:neon-search-diagnose --expect ep-…` (add `--prod` for production):
 * why does the Latin trigram branch of `cities.search` run as a Seq Scan although its GIN index
 * exists? Prints, for the three probes the timing sitting uses, each search branch's
 * `EXPLAIN (ANALYZE, BUFFERS)` with default settings and again with `enable_seqscan = off`, plus
 * the settings, statistics and index state a planner decision rests on.
 *
 * Read-only by construction, three layers: every statement is checked by `assertReadOnly` before
 * it is sent; each batch runs in a `READ ONLY` transaction (the server refuses a write whatever
 * the text says); and the planner setting is `set_config(..., is_local => true)`, gone at the
 * transaction's end. No ANALYZE, no VACUUM, no DDL. `EXPLAIN ANALYZE` runs its SELECT, nothing else.
 *
 * The branch SQL below mirrors the four branches of the UNION in `city-search-repo.ts`
 * (prefix and trigram on each key, ranking columns included); it is spelled out here so the tool
 * works whichever shape the repository's query has when it is run.
 */

export const DIAGNOSE_PROBES: readonly string[] = ["Миколаї", "Бровари", "Мико"];

export type Statement = { text: string; params: readonly string[] };
type Row = Record<string, unknown>;

/** Anything but a read is refused before it is sent; the READ ONLY transaction is the second lock. */
export function assertReadOnly(statement: Statement): void {
  const text = statement.text.trim();
  const explainOnlySelect = /^EXPLAIN \(ANALYZE, BUFFERS\) SELECT\b/.test(text);
  const plainRead = /^(SELECT|SHOW)\b/.test(text);
  const write =
    /\b(INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|CREATE|VACUUM|ANALYZE\s+\w|REINDEX|GRANT|COPY|CALL|DO)\b/i;
  // `ANALYZE` inside the EXPLAIN option list is the one allowed use of the word.
  const checked = explainOnlySelect ? text.replace("EXPLAIN (ANALYZE, BUFFERS)", "EXPLAIN") : text;
  if (!(explainOnlySelect || plainRead) || write.test(checked) || text.includes(";")) {
    throw new Error(
      "search-diagnose only sends SELECT, SHOW and EXPLAIN (ANALYZE, BUFFERS) SELECT",
    );
  }
}

/** The guard: the production write guard's reading (incl. `--prod`), plus `--expect` off-local. */
export type DiagnoseTarget = { kind: "ok" } | { kind: "refused"; reason: string };

export function expectOf(argv: readonly string[]): string | undefined {
  const at = argv.indexOf("--expect");
  if (at > -1) return argv[at + 1];
  return argv.find((a) => a.startsWith("--expect="))?.slice("--expect=".length);
}

export function diagnoseTarget(
  url: string,
  argv: readonly string[],
  prodEndpoint: string | undefined,
  env: Readonly<Record<string, string | undefined>> = process.env,
): DiagnoseTarget {
  const check = checkProductionWrite(url, argv, prodEndpoint, env);
  if (check.kind === "refused") {
    const why =
      check.reason === "ambiguous_host"
        ? `the URL can't be read as exactly one host: ${HOST_AMBIGUITY_TEXT[check.cause]}`
        : check.reason === "ambient_settings"
          ? `connection settings in the environment (${check.variables.join(", ")})`
          : check.reason === "production_without_flag"
            ? "this target is production: pass --prod if that is meant"
            : check.reason === "production_unknown"
              ? "PROD_NEON_ENDPOINT is not set, so the target can't be shown not to be production: set it (ep-… only) or pass --prod for production"
              : check.reason;
    return { kind: "refused", reason: why };
  }
  if (check.reason === "local") return { kind: "ok" };
  const expected = expectedTargetOf(url, expectOf(argv));
  return expected.kind === "ok" ? { kind: "ok" } : expected;
}

// ---- statements -------------------------------------------------------------------------------

const SETTINGS = [
  "pg_trgm.similarity_threshold",
  "random_page_cost",
  "seq_page_cost",
  "cpu_tuple_cost",
  "cpu_operator_cost",
  "effective_cache_size",
  "work_mem",
  "shared_buffers",
  "gin_pending_list_limit",
  "enable_seqscan",
  "enable_bitmapscan",
  "jit",
  "default_statistics_target",
] as const;

const SEARCH_INDEXES = [
  "cities_search_name_prefix_idx",
  "cities_search_latin_prefix_idx",
  "cities_search_name_trgm_idx",
  "cities_search_latin_trgm_idx",
] as const;

const RANKING = (cyr: string, cyrLike: string, lat: string, latLike: string) => ({
  exact: `(search_name = ${cyr} OR search_latin = ${lat})::int AS exact`,
  prefix: `(search_name LIKE ${cyrLike} OR search_latin LIKE ${latLike})::int AS prefix`,
  kindRank:
    "CASE kind WHEN 'special_status_city' THEN 0 WHEN 'city' THEN 1 WHEN 'selyshche' THEN 2 ELSE 3 END AS kind_rank",
  similarity: `greatest(similarity(search_name, ${cyr}), similarity(search_latin, ${lat})) AS similarity`,
});

/** The four branches of the search, one EXPLAIN each; $1 Cyrillic key, $2 its prefix, $3 Latin, $4 its prefix. */
export function branchStatements(): { label: string; where: string }[] {
  return [
    { label: "1 prefix, Latin", where: "search_latin LIKE $4" },
    {
      label: "2 trigram, Latin",
      where: "(search_latin % $3 AND similarity(search_latin, $3) >= 0.35)",
    },
    { label: "3 prefix, Cyrillic", where: "search_name LIKE $2" },
    {
      label: "4 trigram, Cyrillic",
      where: "(search_name % $1 AND similarity(search_name, $1) >= 0.35)",
    },
  ];
}

export function explainStatement(where: string, keys: SearchKeys): Statement {
  const r = RANKING("$1", "$2", "$3", "$4");
  return {
    text:
      `EXPLAIN (ANALYZE, BUFFERS) SELECT id, slug, name_uk, kind, ${r.exact}, ${r.prefix}, ${r.kindRank}, (0)::int AS bias, ${r.similarity} ` +
      `FROM cities WHERE retired_in_edition IS NULL AND ${where} ` +
      "ORDER BY exact DESC, prefix DESC, kind_rank, bias DESC, similarity DESC, id LIMIT 50",
    params: [keys.cyrillic, keys.cyrillicLike, keys.latin, keys.latinLike],
  };
}

export type SearchKeys = {
  raw: string;
  cyrillic: string;
  cyrillicLike: string;
  latin: string;
  latinLike: string;
};

export function searchKeysOf(raw: string): SearchKeys | null {
  const query = placeQueryOf(raw);
  if (query.kind !== "ok" || query.cyrillic === null) return null;
  const like = (key: string) => `${key.replace(/[\\%_]/gu, "\\$&")}%`;
  return {
    raw,
    cyrillic: query.cyrillic,
    cyrillicLike: like(query.cyrillic),
    latin: query.latin,
    latinLike: like(query.latin),
  };
}

const GUARD_TIMEOUT: Statement = {
  text: "SELECT set_config('statement_timeout', '30000', true)",
  params: [],
};
const SEQSCAN_OFF: Statement = {
  text: "SELECT set_config('enable_seqscan', 'off', true)",
  params: [],
};

const q = (text: string): Statement => ({ text, params: [] });
const inList = (names: readonly string[]) => names.map((n) => `'${n}'`).join(", ");

export const CATALOG_STATEMENTS: Record<string, Statement> = {
  version: q("SELECT version() AS version"),
  settings: q(
    `SELECT name, setting, unit, source FROM pg_settings WHERE name IN (${inList(SETTINGS)}) ORDER BY name`,
  ),
  table: q(
    "SELECT s.n_live_tup, s.n_dead_tup, s.n_mod_since_analyze, s.n_ins_since_vacuum, " +
      "s.last_analyze, s.last_autoanalyze, s.last_vacuum, s.last_autovacuum, " +
      "c.reltuples::bigint AS reltuples, c.relpages, (SELECT count(*) FROM cities) AS actual_rows " +
      "FROM pg_stat_user_tables s JOIN pg_class c ON c.oid = s.relid WHERE s.relname = 'cities' AND s.schemaname = 'public'",
  ),
  indexes: q(
    "SELECT c.relname AS index, c.reltuples::bigint AS reltuples, c.relpages, " +
      "pg_relation_size(c.oid) / 1024 AS size_kb, i.indisvalid, i.indisready, " +
      "coalesce(array_to_string(c.reloptions, ','), '') AS options " +
      `FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid WHERE c.relname IN (${inList(SEARCH_INDEXES)}) ORDER BY c.relname`,
  ),
  stats: q(
    "SELECT attname, n_distinct, correlation, null_frac, avg_width FROM pg_stats " +
      "WHERE schemaname = 'public' AND tablename = 'cities' AND attname IN ('search_latin', 'search_name') ORDER BY attname",
  ),
  extensions: q(
    "SELECT extname FROM pg_extension WHERE extname IN ('pg_trgm', 'pgstattuple') ORDER BY extname",
  ),
  cyrillicTrigrams: q("SELECT cardinality(show_trgm('миколаївка')) AS trigrams"),
};

/** Only when `pgstattuple` is installed: the GIN pending list, which a bulk insert leaves unmerged. */
export const PENDING_LIST_STATEMENT = q(
  "SELECT pending_pages, pending_tuples FROM pgstatginindex('cities_search_latin_trgm_idx')",
);

// ---- plans ------------------------------------------------------------------------------------

export type PlanSummary = { nodes: string[]; executionMs: number | null; topBuffers: string };

const NODE =
  /(Seq Scan|Bitmap Heap Scan|Bitmap Index Scan|Index Only Scan|Index Scan)(?: using (\S+))?(?: on (\S+))?\s+\(cost=([\d.]+)\.\.([\d.]+) rows=(\d+).*?actual time=([\d.]+)\.\.([\d.]+) rows=(\d+)/;

/** The scan nodes with estimated cost and actual time, the execution time and the first Buffers line. */
export function summarisePlan(lines: readonly string[]): PlanSummary {
  const nodes: string[] = [];
  for (const line of lines) {
    const m = NODE.exec(line);
    if (m) {
      const target = m[2] ?? m[3] ?? "";
      nodes.push(
        `${m[1]}${target ? ` ${target}` : ""} cost ${m[5]} est ${m[6]} rows, actual ${m[8]} ms ${m[9]} rows`,
      );
    }
  }
  const exec = lines.map((l) => /Execution Time: ([\d.]+) ms/.exec(l)?.[1]).find((v) => v);
  const buffers = lines.find((l) => /^\s*Buffers:/.test(l))?.trim() ?? "";
  return { nodes, executionMs: exec === undefined ? null : Number(exec), topBuffers: buffers };
}

const planLines = (rows: readonly Row[]): string[] => rows.map((r) => String(Object.values(r)[0]));

// ---- running ----------------------------------------------------------------------------------

/** One READ ONLY transaction per call; the results are the statements' rows, in order. */
export type ReadOnlyRunner = (statements: readonly Statement[]) => Promise<Row[][]>;

export function connect(url: string): ReadOnlyRunner {
  if (isNeonHost(url)) {
    const sql = neon(url);
    return async (statements) => {
      for (const s of statements) assertReadOnly(s);
      const results = await sql.transaction(
        (txn) => statements.map((s) => txn.query(s.text, [...s.params])),
        { readOnly: true },
      );
      return results as Row[][];
    };
  }
  const sql = postgres(url, { max: 1 });
  return async (statements) => {
    for (const s of statements) assertReadOnly(s);
    const out = await sql.begin("read only", async (tx) => {
      const rows: Row[][] = [];
      for (const s of statements) rows.push([...(await tx.unsafe(s.text, [...s.params]))] as Row[]);
      return rows;
    });
    return out;
  };
}

export type Variant = "default" | "seqscan_off";

export type Diagnosis = {
  catalog: Record<string, Row[]>;
  pending: Row | null;
  probes: {
    raw: string;
    branches: { label: string; plans: Record<Variant, string[]> }[];
  }[];
};

export async function diagnose(run: ReadOnlyRunner): Promise<Diagnosis> {
  const names = Object.keys(CATALOG_STATEMENTS);
  const catalogRows = await run([
    GUARD_TIMEOUT,
    ...names.map((n) => CATALOG_STATEMENTS[n] as Statement),
  ]);
  const catalog = Object.fromEntries(names.map((n, i) => [n, catalogRows[i + 1] ?? []]));

  let pending: Row | null = null;
  if (catalog.extensions?.some((r) => r.extname === "pgstattuple")) {
    pending = (await run([GUARD_TIMEOUT, PENDING_LIST_STATEMENT]))[1]?.[0] ?? null;
  }

  const probes = DIAGNOSE_PROBES.flatMap((raw) => {
    const keys = searchKeysOf(raw);
    return keys === null ? [] : [keys];
  });
  const branches = branchStatements();
  const explains = probes.flatMap((keys) => branches.map((b) => explainStatement(b.where, keys)));
  const asDefault = await run([GUARD_TIMEOUT, ...explains]);
  const noSeqscan = await run([GUARD_TIMEOUT, SEQSCAN_OFF, ...explains]);

  return {
    catalog,
    pending,
    probes: probes.map((keys, p) => ({
      raw: keys.raw,
      branches: branches.map((b, i) => ({
        label: b.label,
        plans: {
          default: planLines(asDefault[1 + p * branches.length + i] ?? []),
          seqscan_off: planLines(noSeqscan[2 + p * branches.length + i] ?? []),
        },
      })),
    })),
  };
}

// ---- formatting -------------------------------------------------------------------------------

const cell = (v: unknown) => (v === null || v === undefined ? "-" : String(v));
const when = (v: unknown) => (v instanceof Date ? v.toISOString() : cell(v));

/** One word for a reader in a hurry: the planner's choice under default settings. */
export function verdictOf(plan: PlanSummary): string {
  const text = plan.nodes.join(" | ");
  const ms = plan.executionMs === null ? "?" : `${plan.executionMs} ms`;
  if (text.includes("Seq Scan")) return `SEQ SCAN (${ms})`;
  const index = /(?:Bitmap Index Scan|Index Scan|Index Only Scan) (\S+)/.exec(text)?.[1];
  return index ? `USES INDEX ${index} (${ms})` : `UNKNOWN PLAN (${ms})`;
}

export function formatReport(d: Diagnosis, full: boolean): string[] {
  const out: string[] = [];
  const one = (name: string) => d.catalog[name]?.[0];
  const t = one("table");
  out.push("--- cities: statistics first (was it analyzed since the import?)");
  if (t) {
    out.push(
      `rows: actual ${cell(t.actual_rows)}, n_live_tup ${cell(t.n_live_tup)}, reltuples ${cell(t.reltuples)}, relpages ${cell(t.relpages)}, dead ${cell(t.n_dead_tup)}`,
      `modified since analyze: ${cell(t.n_mod_since_analyze)}, inserted since vacuum: ${cell(t.n_ins_since_vacuum)}`,
      `last_analyze ${when(t.last_analyze)} | last_autoanalyze ${when(t.last_autoanalyze)}`,
      `last_vacuum ${when(t.last_vacuum)} | last_autovacuum ${when(t.last_autovacuum)}`,
    );
  } else out.push("no statistics row for cities");

  out.push(
    "",
    "--- VERDICT: does the Latin trigram branch (2) use cities_search_latin_trgm_idx, default settings?",
  );
  for (const probe of d.probes) {
    const two = probe.branches.find((x) => x.label.startsWith("2"));
    out.push(
      `${JSON.stringify(probe.raw)}: ${two ? verdictOf(summarisePlan(two.plans.default)) : "no plan"}`,
    );
  }
  out.push("", String(one("version")?.version ?? "").replace(/ on .*/, ""));
  const ext = (d.catalog.extensions ?? []).map((r) => r.extname).join(", ");
  out.push(
    `extensions: ${ext || "none of pg_trgm/pgstattuple"}; cyrillic trigrams per word: ${cell(one("cyrillicTrigrams")?.trigrams)}`,
  );

  out.push(
    "",
    "--- settings (Neon's cost settings cannot be reproduced locally; these are the real ones)",
  );
  for (const r of d.catalog.settings ?? [])
    out.push(
      `${cell(r.name)} = ${cell(r.setting)}${r.unit ? ` ${r.unit}` : ""} [${cell(r.source)}]`,
    );

  out.push("", "--- search indexes (valid/ready, size, reloptions)");
  for (const r of d.catalog.indexes ?? [])
    out.push(
      `${cell(r.index)}: valid ${cell(r.indisvalid)} ready ${cell(r.indisready)}, ${cell(r.size_kb)} kB, reltuples ${cell(r.reltuples)}${r.options ? `, options ${cell(r.options)}` : ""}`,
    );
  if ((d.catalog.indexes ?? []).length !== 4)
    out.push("MISSING: fewer than four search indexes found");
  out.push(
    d.pending
      ? `GIN pending list (latin trigram): ${cell(d.pending.pending_pages)} pages, ${cell(d.pending.pending_tuples)} tuples (0 = merged)`
      : "GIN pending list: not readable (pgstattuple is not installed); read the Bitmap Index Scan Buffers below",
  );

  out.push("", "--- pg_stats");
  for (const r of d.catalog.stats ?? [])
    out.push(
      `${cell(r.attname)}: n_distinct ${cell(r.n_distinct)}, correlation ${cell(r.correlation)}, null_frac ${cell(r.null_frac)}, avg_width ${cell(r.avg_width)}`,
    );
  if ((d.catalog.stats ?? []).length === 0)
    out.push("no pg_stats rows: the table was never analyzed");

  for (const probe of d.probes) {
    out.push(
      "",
      `--- probe ${JSON.stringify(probe.raw)}: per branch, default | enable_seqscan=off`,
    );
    for (const b of probe.branches) {
      const a = summarisePlan(b.plans.default);
      const o = summarisePlan(b.plans.seqscan_off);
      const show = (s: PlanSummary) =>
        `${s.executionMs ?? "?"} ms [${s.nodes.join("; ") || "no scan node"}] ${s.topBuffers}`;
      out.push(`${b.label}: ${verdictOf(a)}`, `  default: ${show(a)}`, `  seqscan off: ${show(o)}`);
    }
    if (full) {
      for (const b of probe.branches.filter((x) => x.label.startsWith("2"))) {
        out.push("", `branch 2 full plan, default:`, ...b.plans.default);
        out.push("", `branch 2 full plan, seqscan off:`, ...b.plans.seqscan_off);
      }
    }
  }
  return out;
}

// ---- CLI --------------------------------------------------------------------------------------

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("ERROR: DATABASE_URL is not set.");
    process.exit(1);
  }
  const target = diagnoseTarget(url, process.argv, productionEndpoint());
  if (target.kind === "refused") {
    console.error(`REFUSED: ${target.reason}. Nothing was run.`);
    process.exit(1);
  }
  console.log(databaseTargetLine(url));
  console.log(
    "Read-only: SELECT / SHOW / EXPLAIN ANALYZE inside READ ONLY transactions. Writes nothing.",
  );
  const report = await diagnose(connect(url));
  for (const line of formatReport(report, process.argv.includes("--full"))) console.log(line);
  process.exit(0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
