import { randomUUID } from "node:crypto";
import { placeQueryOf, type RegionId } from "@opika/domain";
import type { Database } from "../src/client";
import { REGION_BY_CODE } from "../src/geography/regions-data";
import { cityRepo } from "../src/repos/city-repo";
import { citySearchRepo, cyrillicTrigramsAvailable } from "../src/repos/city-search-repo";
import { makeCity } from "../src/test-utils/index";

type Outcome = { name: string; ok: boolean; detail: string };

/**
 * Nationwide track N2: the checks for `cities.search`'s query, appended after the geography
 * steps (`neon-smoke.ts` calls this from `main`; no earlier step is edited). Every statement is a
 * query-builder shape, never a raw `db.execute`, because neon-http and postgres-js return
 * different raw result shapes. Fixture rows use names no real settlement has, carry no code (the
 * importer leaves such rows alone) and stay on the child branch, which is thrown away.
 */
export async function runSearchSmoke(db: Database): Promise<Outcome[]> {
  const out: Outcome[] = [];
  const check = (name: string, ok: boolean, detail: string) => out.push({ name, ok, detail });
  const search = async (
    raw: string,
    options: { cyrillicTrigrams?: boolean; regionBias?: RegionId | null } = {},
  ) => {
    const query = placeQueryOf(raw);
    if (query.kind !== "ok") throw new Error(`${raw} is too short`);
    return citySearchRepo(db).search(query, { regionBias: options.regionBias ?? null, ...options });
  };
  const named = (uk: string, en: string, regionCode = "UA32") =>
    makeCity({
      id: randomUUID() as never,
      regionId: REGION_BY_CODE.get(regionCode)?.id as RegionId,
      name: { uk, en: { text: en, provenance: "human" } },
    });

  const trigrams = await cyrillicTrigramsAvailable(db);
  check(
    "search probes whether Cyrillic trigrams exist (decides the Cyrillic typo branch)",
    typeof trigrams === "boolean",
    trigrams
      ? "Cyrillic trigrams available: typo tolerance on both keys"
      : "Cyrillic trigrams EMPTY: typo tolerance falls back to the Latin key",
  );

  const exact = named("Смокова", "Smokova");
  const prefix = named("Смоковата", "Smokovata");
  const typo = named("Смоково", "Smokovo");
  await cityRepo(db).insertMissing([exact, prefix, typo]);
  const ranked = (await search("Смокова")).map((r) => r.nameUk);
  check(
    "ranking: exact, then prefix, then trigram",
    JSON.stringify(ranked) === JSON.stringify(["Смокова", "Смоковата", "Смоково"]),
    ranked.join(" > "),
  );

  const latin = (await search("smokova")).map((r) => r.nameUk);
  check("a Latin spelling finds the Cyrillic name", latin[0] === "Смокова", latin.join(", "));

  const lookalike = named("Смокіївка", "Smokiivka");
  await cityRepo(db).insertMissing([lookalike]);
  const fallback = (await search("Смокиївка", { cyrillicTrigrams: false })).map((r) => r.nameUk);
  check(
    "with Cyrillic trigrams off, a Cyrillic typo is still found through the Latin key",
    fallback.includes("Смокіївка"),
    fallback.join(", "),
  );

  const crimean = named("Смококримськ", "Smokokrymsk", "UA01");
  await cityRepo(db).insertMissing([crimean]);
  const hidden = await search("Смококримськ");
  check(
    "a settlement in Crimea is stored but never returned",
    hidden.length === 0 && (await cityRepo(db).findById(crimean.id)) !== null,
    `returned ${hidden.length}`,
  );

  const started = performance.now();
  const timed = await search("Смок");
  const elapsed = Math.round(performance.now() - started);
  check(
    "a prefix search returns at most 20 rows (timing reported, not asserted)",
    timed.length <= 20,
    `${timed.length} rows in ${elapsed} ms`,
  );

  return out;
}
