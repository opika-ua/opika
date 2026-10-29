import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EVERYONE_SCOPE, type FeedFilters, NO_FILTERS, placeQueryOf } from "@opika/domain";
import { and, desc, sql } from "drizzle-orm";
import { createDatabase, type Database } from "../src/client";
import { KYIV_OBLAST_REGION_ID } from "../src/geography/regions-data";
import { productionEndpoint } from "../src/prod-guard";
import { executeRows } from "../src/raw-rows";
import {
  citySearchRepo,
  cyrillicTrigramsAvailable,
  searchStatement,
} from "../src/repos/city-search-repo";
import { buildFeedPredicate } from "../src/repos/feed-predicate";
import { galleryRepo } from "../src/repos/gallery-repo";
import { animals } from "../src/schema/animals";
import { smokeTarget } from "../src/test-utils/smoke-target";

/**
 * `pnpm --filter @opika/db db:neon-smoke-timings --expect ep-…`: the timed part of the nationwide
 * sitting, run on a child branch AFTER the settlement import (the 8 seeded cities alone say
 * nothing about a 29.7k-row table). It prints, and asserts nothing: 20 `cities.search` probes
 * with rows and milliseconds, three `EXPLAIN (ANALYZE, BUFFERS)` plans of the search statement
 * and one of the oblast predicate, and a few timed gallery reads (the facet scan is timed, not explained). Whoever runs the
 * sitting reads the plans and the numbers; nothing here decides pass or fail, because a latency
 * figure measured once on a shared child branch is not a limit (standing constraints).
 *
 * Read-only: no row is written. `EXPLAIN ANALYZE` does run the statement, so each is a normal read.
 * The raw `EXPLAIN` goes through `executeRows`, the one reader that knows both drivers' shapes.
 */

/** Twenty things an operator or a person types, across the shapes the search has to survive. */
export const SEARCH_PROBES: readonly string[] = [
  "Київ", // exact, a special-status city
  "Бровари", // exact, seeded
  "бровари", // lower case
  "БРОВАРИ", // upper case
  "Бров", // short prefix
  "Миколаївка", // 100+ same-named villages
  "Миколаї", // prefix of the above
  "Іванівка", // the most repeated name
  "Мик", // three letters: the widest prefix
  "Ірпінь", // a letter outside the ASCII-like set
  "Ірпінь ", // trailing space
  "Біла Церква", // two words
  "біла-церква", // hyphen for the space
  "Кам'янське", // ASCII apostrophe
  "Камʼянське", // U+02BC, the repo's own
  "м. Львів", // kind prefix
  "с. Гора", // village prefix
  "Lviv", // Latin
  "Mykolaivka", // Latin, repeated name
  "Бровари2", // a typo-shaped string with a digit
];

type Log = (line: string) => void;

const msSince = (started: number): number => Math.round((performance.now() - started) * 10) / 10;

/** `EXPLAIN (ANALYZE, BUFFERS)` of a built, unexecuted statement, as the plan's text lines. */
async function planOf(db: Database, statement: { getSQL(): ReturnType<typeof sql> }) {
  const rows = await executeRows<Record<string, unknown>>(
    db,
    sql`EXPLAIN (ANALYZE, BUFFERS) ${statement.getSQL()}`,
  );
  return rows.map((row) => String(Object.values(row)[0]));
}

export async function runTimings(db: Database, log: Log): Promise<void> {
  const cyrillic = await cyrillicTrigramsAvailable(db);
  log(`Cyrillic trigrams available: ${cyrillic}`);
  const search = citySearchRepo(db);

  // One untimed call so the first probe does not pay the connection and the plan cache.
  const warm = placeQueryOf("Бровари");
  if (warm.kind === "ok") await search.search(warm, { regionBias: null });

  log("");
  log("--- 20 search probes (cities.search's query) ---");
  for (const raw of SEARCH_PROBES) {
    const query = placeQueryOf(raw);
    if (query.kind !== "ok") {
      log(`${JSON.stringify(raw)}: too short, not run`);
      continue;
    }
    const started = performance.now();
    const rows = await search.search(query, { regionBias: null });
    log(`${JSON.stringify(raw)}: ${rows.length} rows in ${msSince(started)} ms`);
  }

  log("");
  log("--- EXPLAIN (ANALYZE, BUFFERS): the search statement ---");
  for (const raw of ["Миколаї", "Бровари", "Мико"]) {
    const query = placeQueryOf(raw);
    if (query.kind !== "ok") continue;
    log(`# ${JSON.stringify(raw)}`);
    for (const line of await planOf(
      db,
      searchStatement(db, query, { regionBias: null }, cyrillic),
    )) {
      log(line);
    }
  }

  const now = new Date();
  const oblast: FeedFilters = {
    ...NO_FILTERS,
    regions: { kind: "oneOf", values: [KYIV_OBLAST_REGION_ID] },
  };

  log("");
  log("--- EXPLAIN (ANALYZE, BUFFERS): the oblast predicate, one page of the feed ---");
  const pageQuery = db
    .select({ id: animals.id })
    .from(animals)
    .where(and(...buildFeedPredicate(oblast, now)))
    .orderBy(desc(animals.lastConfirmedAt), animals.id)
    .limit(24);
  for (const line of await planOf(db, pageQuery)) log(line);

  log("");
  log("--- timed gallery reads ---");
  const gallery = galleryRepo(db);
  const timed = async (label: string, run: () => Promise<unknown>) => {
    const started = performance.now();
    await run();
    log(`${label}: ${msSince(started)} ms`);
  };
  await timed("gallery.list, one oblast", () =>
    gallery.list({
      filters: oblast,
      scope: EVERYONE_SCOPE,
      sort: "freshest",
      page: 1,
      pageSize: 24,
      now,
    }),
  );
  await timed("gallery.facetCounts, no filters", () =>
    gallery.facetCounts({ filters: NO_FILTERS, now }),
  );
  await timed("gallery.facetCounts, one oblast", () =>
    gallery.facetCounts({ filters: oblast, now }),
  );
  const counts = await gallery.facetCounts({ filters: NO_FILTERS, now });
  log(
    `facet payload rows: ${counts.cities.length} cities with animals, ${counts.regions.length} oblasts (the contract carries one label per city)`,
  );
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("ERROR: DATABASE_URL is not set.");
    process.exit(1);
  }
  const at = process.argv.indexOf("--expect");
  const target = smokeTarget(url, at > -1 ? process.argv[at + 1] : undefined, productionEndpoint());
  if (target.kind === "refused") {
    console.error(`REFUSED: ${target.reason}. Nothing was run.`);
    process.exit(1);
  }
  console.log(`Target host: ${target.host}`);
  await runTimings(createDatabase(url), (line) => console.log(line));
  process.exit(0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
