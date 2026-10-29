import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { count, isNotNull } from "drizzle-orm";
import { createDatabase, type Database } from "../client";
import { migrateTargetCheck, parseMigrateArgs } from "../migrate-args";
import {
  assertProductionWriteAllowed,
  checkProductionWrite,
  databaseTargetLine,
  PROD_FLAG,
  productionEndpoint,
} from "../prod-guard";
import { animals } from "../schema/animals";
import { cities } from "../schema/cities";
import { citySlugAliases } from "../schema/city-slug-aliases";
import { shelters } from "../schema/shelters";

/**
 * `pnpm --filter @opika/db db:city-references [--prod --expect ep-...]`: read-only. Prints how many
 * animals and shelters point at each city that anything points at, and one fingerprint over those
 * (city id, animals, shelters) lines. The settlement import adopts the 8 legacy cities in place and
 * keeps their ids, so the fingerprint run before and after it must be identical: that is the
 * "nothing was re-pointed" check, without printing a row of animal or shelter data.
 */

export type CityReferenceRow = {
  cityId: string;
  slug: string;
  animals: number;
  shelters: number;
};

export type CityReferences = {
  cities: number;
  withCode: number;
  aliases: number;
  referenced: readonly CityReferenceRow[];
};

/** Counts only, grouped in the database. Query-builder shapes, so neon-http and postgres-js agree. */
export async function loadCityReferences(db: Database): Promise<CityReferences> {
  const cityRows = await db.select({ id: cities.id, slug: cities.slug }).from(cities);
  const [withCode] = await db
    .select({ n: count() })
    .from(cities)
    .where(isNotNull(cities.katottgCode));
  const [aliases] = await db.select({ n: count() }).from(citySlugAliases);
  const animalCounts = await db
    .select({ cityId: animals.cityId, n: count() })
    .from(animals)
    .groupBy(animals.cityId);
  const shelterCounts = await db
    .select({ cityId: shelters.cityId, n: count() })
    .from(shelters)
    .groupBy(shelters.cityId);
  const slugOf = new Map(cityRows.map((c) => [c.id as string, c.slug]));
  const byCity = new Map<string, CityReferenceRow>();
  const row = (cityId: string): CityReferenceRow => {
    const existing = byCity.get(cityId);
    if (existing) return existing;
    const created = {
      cityId,
      slug: slugOf.get(cityId) ?? "<no such city>",
      animals: 0,
      shelters: 0,
    };
    byCity.set(cityId, created);
    return created;
  };
  for (const r of animalCounts) row(r.cityId as string).animals = r.n;
  for (const r of shelterCounts) row(r.cityId as string).shelters = r.n;
  return {
    cities: cityRows.length,
    withCode: withCode?.n ?? 0,
    aliases: aliases?.n ?? 0,
    referenced: [...byCity.values()].sort((a, b) => (a.cityId < b.cityId ? -1 : 1)),
  };
}

/**
 * Over the ids and the counts only, not the slugs: the import renames slugs and must not change
 * what points where.
 */
export const referenceFingerprint = (referenced: readonly CityReferenceRow[]): string =>
  createHash("sha256")
    .update(
      [...referenced]
        .sort((a, b) => (a.cityId < b.cityId ? -1 : 1))
        .map((r) => `${r.cityId} animals=${r.animals} shelters=${r.shelters}`)
        .join("\n"),
    )
    .digest("hex");

export function referenceLines(refs: CityReferences): string[] {
  const missing = refs.referenced.filter((r) => r.slug === "<no such city>").length;
  return [
    `Cities: ${refs.cities} (${refs.withCode} with a code, ${refs.cities - refs.withCode} without), ${refs.aliases} slug aliases`,
    `Cities that an animal or a shelter points at: ${refs.referenced.length} (pointing at a city that does not exist: ${missing})`,
    ...refs.referenced.map(
      (r) => `  ${r.cityId}  ${r.slug}: ${r.animals} animals, ${r.shelters} shelters`,
    ),
    `Animals pointing at a city: ${refs.referenced.reduce((sum, r) => sum + r.animals, 0)}; shelters: ${refs.referenced.reduce((sum, r) => sum + r.shelters, 0)}`,
    `Reference fingerprint: ${referenceFingerprint(refs.referenced)}`,
  ];
}

/** Whether the guard reads this target as production with `--prod` given (so `--prod` means something). */
export function targetIsProduction(
  url: string,
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  const prod = productionEndpoint(env);
  if (prod === undefined) return false; // unknown production: nothing can be shown to be it
  const check = checkProductionWrite(url, argv, prod, env);
  return check.kind === "allowed" && check.reason === "production_flagged";
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("ERROR: DATABASE_URL is not set.");
    process.exit(1);
  }
  const args = parseMigrateArgs(process.argv.slice(2));
  if (args.kind === "refused" || args.drizzleArgs.length > 1) {
    console.error("ERROR: usage: db:city-references [--prod] [--expect ep-...]");
    process.exit(1);
  }
  // It reads no animal or shelter row, but it is aimed at production, so production needs --prod.
  assertProductionWriteAllowed(url, process.argv.slice(2), process.env, "read");
  // And --prod on anything else is a mistake to stop, as the importer does.
  if (
    process.argv.includes(PROD_FLAG) &&
    !targetIsProduction(url, process.argv.slice(2), process.env)
  ) {
    console.error("ERROR: --prod was given but this target is not production. Nothing was run.");
    process.exit(1);
  }
  const expected = migrateTargetCheck(url, args.expect);
  if (expected.kind === "refused") {
    console.error(`ERROR: ${expected.reason}. Refusing (not printing the URL).`);
    process.exit(1);
  }
  console.log(databaseTargetLine(url));
  for (const line of referenceLines(await loadCityReferences(createDatabase(url)))) {
    console.log(line);
  }
  process.exit(0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
