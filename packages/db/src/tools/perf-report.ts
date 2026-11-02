import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type CityId,
  EVERYONE_SCOPE,
  type FeedFilters,
  type GalleryScope,
  type GallerySort,
  NO_FILTERS,
  placeQueryOf,
  type ShelterId,
} from "@opika/domain";
import type { Database } from "../client";
import { databaseTargetOf } from "../prod-guard";
import { animalRepo } from "../repos/animal-repo";
import { citySearchRepo } from "../repos/city-search-repo";
import { galleryRepo } from "../repos/gallery-repo";
import { kabinetAnimalRepo } from "../repos/kabinet-animal-repo";
import { shelterRepo } from "../repos/shelter-repo";
import {
  type Call,
  createRecordingDatabase,
  perfTarget,
  scrubbed,
  timelineLines,
  wavesOf,
} from "./perf-support";
import { connect, type ReadOnlyRunner, type Statement } from "./search-diagnose";

/**
 * `pnpm --filter @opika/db db:neon-perf-report --expect ep-…`: strictly read-only. Runs the
 * repository functions the public pages and the kabinet list really call, twice each (cold, warm),
 * recording every statement with the driver the app uses (neon-http on Neon), then runs
 * `EXPLAIN (ANALYZE, BUFFERS)` of each recorded SELECT inside a READ ONLY transaction, twice, to
 * set the database's own execution time against the round trip. Nothing is written: an EXPLAIN is
 * only ever sent for a statement that starts with SELECT or WITH and contains no write keyword
 * (`assertExplainable`), the server's READ ONLY transaction refuses writes anyway, and the repository
 * calls used here are reads. Per-route query counts, timelines and N+1 flags: `neon-perf-routes`
 * in apps/web (it runs the real loaders).
 */

const NOW_SQL_GUARD: Statement = {
  text: "SELECT set_config('statement_timeout', '30000', true)",
  params: [],
};
const q = (text: string): Statement => ({ text, params: [] });

/** Constant catalog and picker reads: the only statements, besides EXPLAINs, this tool may send. */
const CONSTANT: Record<string, Statement> = {
  version: q("SELECT version() AS version"),
  counts: q(
    "SELECT (SELECT count(*) FROM animals) AS animals, (SELECT count(*) FROM shelters) AS shelters, (SELECT count(*) FROM cities) AS cities",
  ),
  busyShelter: q(
    "SELECT shelter_id AS id FROM animals WHERE listing_kind IN ('published', 'reserved') GROUP BY shelter_id ORDER BY count(*) DESC LIMIT 1",
  ),
  emptyShelter: q(
    "SELECT s.id AS id FROM shelters s WHERE NOT EXISTS (SELECT 1 FROM animals a WHERE a.shelter_id = s.id) ORDER BY s.id LIMIT 1",
  ),
  middleAnimal: q(
    "SELECT id FROM animals WHERE listing_kind = 'published' ORDER BY id OFFSET (SELECT count(*) / 2 FROM animals WHERE listing_kind = 'published') LIMIT 1",
  ),
  busyCity: q(
    "SELECT city_id AS id FROM animals WHERE listing_kind IN ('published', 'reserved') GROUP BY city_id ORDER BY count(*) DESC LIMIT 1",
  ),
  statsReset: q("SELECT stats_reset FROM pg_stat_database WHERE datname = current_database()"),
  unusedIndexes: q(
    "SELECT s.relname AS tbl, s.indexrelname AS idx, pg_relation_size(s.indexrelid) / 1024 AS size_kb " +
      "FROM pg_stat_user_indexes s JOIN pg_index i ON i.indexrelid = s.indexrelid " +
      "WHERE s.idx_scan = 0 AND NOT i.indisunique AND NOT i.indisprimary " +
      "AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = s.indexrelid) " +
      "ORDER BY size_kb DESC, s.indexrelname",
  ),
};

const EXPLAIN_HEAD = /^EXPLAIN \(ANALYZE, BUFFERS\) \(*\s*(SELECT|WITH)\b/i;
const WRITE_WORDS =
  /\b(insert|update|delete|merge|truncate|alter|create|drop|grant|nextval|setval|set_config|pg_terminate_backend|pg_cancel_backend|into)\b|for\s+(update|share|no key update|key share)/i;

/** Only the constant reads, the statement-timeout guard and EXPLAINs of plain SELECTs may leave this tool. */
export function assertExplainable(statement: Statement): void {
  if (statement.text === NOW_SQL_GUARD.text) return;
  if (Object.values(CONSTANT).some((c) => c.text === statement.text)) return;
  if (EXPLAIN_HEAD.test(statement.text) && !WRITE_WORDS.test(statement.text)) return;
  throw new Error("neon-perf-report only sends constant reads and EXPLAINs of SELECTs");
}

// ---- plans ------------------------------------------------------------------------------------

export type PlanSummary = {
  nodes: string[];
  planningMs: number | null;
  executionMs: number | null;
  buffers: string;
  seqScans: number;
};

/** Node lines with the cost estimate dropped, plus planning and execution time and the first Buffers line. */
export function summarisePlan(lines: readonly string[], maxNodes = 7): PlanSummary {
  const all = lines
    .filter((l) => /\(cost=/.test(l))
    .map((l) =>
      l
        .replace(/\(cost=[^)]*\)\s*/, "")
        .replace(/\s+/g, " ")
        .trimEnd(),
    );
  const nodes = all.slice(0, maxNodes).map((l) => (l.length > 118 ? `${l.slice(0, 117)}~` : l));
  if (all.length > maxNodes) nodes.push(`... ${all.length - maxNodes} more nodes`);
  const num = (re: RegExp) => {
    const m = lines.map((l) => re.exec(l)?.[1]).find((v) => v !== undefined);
    return m === undefined ? null : Number(m);
  };
  return {
    nodes,
    planningMs: num(/Planning Time: ([\d.]+) ms/),
    executionMs: num(/Execution Time: ([\d.]+) ms/),
    buffers: lines.find((l) => /^\s*Buffers:/.test(l))?.trim() ?? "",
    seqScans: lines.filter((l) => /Seq Scan/.test(l)).length,
  };
}

const planLines = (rows: readonly Record<string, unknown>[]): string[] =>
  rows.map((r) => String(Object.values(r)[0]));

// ---- scenarios --------------------------------------------------------------------------------

export type Picked = {
  busyShelter: ShelterId | null;
  emptyShelter: ShelterId | null;
  animalId: string | null;
  cityId: CityId | null;
};

type Scenario = {
  label: string;
  /** null: needs data the branch doesn't have. */
  run: ((db: Database, now: Date) => Promise<unknown>) | null;
};

const list = (
  db: Database,
  now: Date,
  filters: FeedFilters,
  sort: GallerySort,
  scope: GalleryScope = EVERYONE_SCOPE,
) => galleryRepo(db).list({ filters, scope, sort, page: 1, pageSize: 24, now });

export function scenariosOf(picked: Picked): Scenario[] {
  const { busyShelter, animalId, cityId } = picked;
  const shelterScope = (id: ShelterId): GalleryScope => ({ kind: "shelter", shelterId: id });
  const search = async (db: Database, raw: string) => {
    const query = placeQueryOf(raw);
    if (query.kind === "ok") await citySearchRepo(db).search(query, { regionBias: null });
  };
  return [
    {
      label: "gallery.list, unfiltered, freshest",
      run: (db, now) => list(db, now, NO_FILTERS, "freshest"),
    },
    {
      label: "gallery.list, one city",
      run: cityId
        ? (db, now) =>
            list(
              db,
              now,
              { ...NO_FILTERS, cities: { kind: "oneOf", values: [cityId] } },
              "freshest",
            )
        : null,
    },
    {
      label: "gallery.list, species=dog + size=medium",
      run: (db, now) =>
        list(
          db,
          now,
          {
            ...NO_FILTERS,
            species: { kind: "oneOf", values: ["dog"] },
            sizes: { kind: "oneOf", values: ["medium"] },
          },
          "freshest",
        ),
    },
    {
      label: "gallery.list, unfiltered, longest waiting",
      run: (db, now) => list(db, now, NO_FILTERS, "longest_waiting"),
    },
    {
      label: "gallery.facetCounts, no filters",
      run: (db, now) => galleryRepo(db).facetCounts({ filters: NO_FILTERS, now }),
    },
    {
      label: "animal detail: findById + shelter + neighbours",
      run:
        animalId && busyShelter
          ? async (db, now) => {
              const animal = await animalRepo(db).findById(animalId as never);
              if (animal) await shelterRepo(db).findById(animal.shelterId);
              await galleryRepo(db).neighbours({
                animalId: animalId as never,
                filters: NO_FILTERS,
                scope: EVERYONE_SCOPE,
                sort: "freshest",
                now,
              });
            }
          : null,
    },
    {
      label: "shelter page: scoped list + facetCounts (busiest shelter)",
      run: busyShelter
        ? async (db, now) => {
            const scope = shelterScope(busyShelter);
            await list(db, now, NO_FILTERS, "freshest", scope);
            await galleryRepo(db).facetCounts({ filters: NO_FILTERS, now, scope });
          }
        : null,
    },
    { label: "city search: «Бров» (prefix)", run: (db) => search(db, "Бров") },
    { label: "city search: «Миколаї» (repeated name)", run: (db) => search(db, "Миколаї") },
    {
      label: "kabinet K2 list: listPage + countsByKind + staleCount",
      run: busyShelter
        ? async (db, now) => {
            const repo = kabinetAnimalRepo(db);
            await Promise.all([
              repo.listPage({
                shelterId: busyShelter,
                filter: { kind: "all" },
                after: null,
                limit: 20,
              }),
              repo.countsByKind(busyShelter),
              repo.staleCount(busyShelter, new Date(now.getTime() - 30 * 86_400_000)),
            ]);
          }
        : null,
    },
  ];
}

// ---- running ----------------------------------------------------------------------------------

const ms = (n: number | null) => (n === null ? "?" : (Math.round(n * 10) / 10).toString());
const keyOf = (c: Pick<Call, "sql" | "params">) => JSON.stringify([c.sql, c.params]);

const firstValue = (rows: readonly Record<string, unknown>[] | undefined): string | null => {
  const v = rows?.[0] ? Object.values(rows[0])[0] : undefined;
  return v === undefined || v === null ? null : String(v);
};

async function explain(run: ReadOnlyRunner, call: Pick<Call, "sql" | "params">) {
  const statement: Statement = {
    text: `EXPLAIN (ANALYZE, BUFFERS) ${call.sql}`,
    params: call.params as readonly string[],
  };
  const rows = await run([NOW_SQL_GUARD, statement]);
  return summarisePlan(planLines(rows[1] ?? []));
}

export async function runReport(url: string, log: (line: string) => void): Promise<void> {
  const run = connect(url, assertExplainable);
  const read = async (key: keyof typeof CONSTANT) =>
    (await run([NOW_SQL_GUARD, CONSTANT[key] as Statement]))[1] ?? [];

  const target = databaseTargetOf(url);
  log(`Endpoint: ${target.kind === "neon" ? target.endpoint : target.kind}`);
  log(String(firstValue(await read("version")) ?? "").replace(/ on .*/, ""));
  const counts = (await read("counts"))[0] ?? {};
  log(`Rows: animals ${counts.animals}, shelters ${counts.shelters}, cities ${counts.cities}`);

  const picked: Picked = {
    busyShelter: firstValue(await read("busyShelter")) as ShelterId | null,
    emptyShelter: firstValue(await read("emptyShelter")) as ShelterId | null,
    animalId: firstValue(await read("middleAnimal")),
    cityId: firstValue(await read("busyCity")) as CityId | null,
  };
  if (!picked.animalId)
    log("NOTE: no published animals on this branch; seed first (db:neon-perf-seed).");

  const recorder = createRecordingDatabase(url);
  const now = new Date();
  try {
    for (const scenario of scenariosOf(picked)) {
      log("");
      log(`== ${scenario.label}`);
      if (!scenario.run) {
        log("   skipped: the branch has no data for it");
        continue;
      }
      const runs: { total: number; calls: Call[] }[] = [];
      for (let pass = 0; pass < 2; pass++) {
        recorder.reset();
        const started = performance.now();
        await scenario.run(recorder.db, now);
        runs.push({
          total: performance.now() - started,
          calls: recorder.calls.map((c) => ({ ...c })),
        });
      }
      const [cold, warm] = runs as [(typeof runs)[number], (typeof runs)[number]];
      log(
        `   round trip: cold ${ms(cold.total)} ms | warm ${ms(warm.total)} ms | ` +
          `${warm.calls.length} DB calls in ${wavesOf(warm.calls).length} sequential wave(s)`,
      );
      for (const line of timelineLines(warm.calls)) log(`  ${line}`);

      // Each distinct SELECT once: its own plan, twice (the first run is the colder one).
      const distinct = [...new Map(warm.calls.map((c) => [keyOf(c), c])).values()].filter((c) =>
        /^[\s(]*(select|with)\b/i.test(c.sql),
      );
      const coldBy = new Map(cold.calls.map((c) => [keyOf(c), c.end - c.start]));
      let shown = 0;
      for (const call of distinct) {
        try {
          const first = await explain(run, call);
          const second = await explain(run, call);
          const rt = (c: number | undefined, w: number) => `${ms(c ?? null)}/${ms(w)}`;
          log(
            `   [${distinct.indexOf(call) + 1}] round trip cold/warm ${rt(coldBy.get(keyOf(call)), call.end - call.start)} ms; ` +
              `DB execution cold/warm ${ms(first.executionMs)}/${ms(second.executionMs)} ms, planning ${ms(second.planningMs)} ms` +
              `${second.seqScans > 0 ? `, SEQ SCAN x${second.seqScans}` : ""}`,
          );
          if (shown++ < 2) {
            for (const node of second.nodes) log(`       ${node}`);
            if (second.buffers) log(`       ${second.buffers}`);
          }
        } catch (error) {
          log(
            `   [${distinct.indexOf(call) + 1}] explain failed: ${error instanceof Error ? error.message.split("\n")[0] : "error"}`,
          );
        }
      }
    }
  } finally {
    await recorder.close();
  }

  log("");
  log("== unused indexes (idx_scan = 0, not unique/primary/constraint-backing)");
  const reset = firstValue(await read("statsReset"));
  log(
    `   WARNING: statistics were last reset ${reset ?? "(unknown)"}. A fresh or restored branch starts at 0, so "unused" means nothing until real traffic has run.`,
  );
  const unused = await read("unusedIndexes");
  if (unused.length === 0) log("   none");
  for (const row of unused.slice(0, 40)) log(`   ${row.tbl}.${row.idx}  ${row.size_kb} kB`);
  if (unused.length > 40) log(`   ... ${unused.length - 40} more`);
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("ERROR: DATABASE_URL is not set.");
    process.exit(1);
  }
  const target = perfTarget(url, process.argv.slice(2));
  if (target.kind === "refused") {
    console.error(`REFUSED: ${target.reason}. Nothing was run.`);
    process.exit(1);
  }
  console.log(
    "Read-only: SELECT and EXPLAIN ANALYZE of SELECT inside READ ONLY transactions. Writes nothing.",
  );
  try {
    await runReport(url, (line) => console.log(scrubbed(line)));
  } catch (error) {
    console.error(
      scrubbed(`Report failed: ${error instanceof Error ? error.message.split("\n")[0] : "error"}`),
    );
    process.exitCode = 1;
  }
  process.exit(process.exitCode ?? 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
