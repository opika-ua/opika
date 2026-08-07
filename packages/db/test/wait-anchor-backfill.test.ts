import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { cityRepo } from "../src/repos/city-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import * as schema from "../src/schema/index";
import { makeCity, makeShelter } from "../src/test-utils/index";

/**
 * The `wait_anchor_at` backfill, tested against data shaped the way the table
 * looked *before* it ran.
 *
 * This cannot ride on `setupTestDatabase()`, which applies every migration and
 * hands back a table that is already correct — a test against that would only
 * prove the current schema exists. What has to be proved is the transformation:
 * rows in the pre-E0 shape (`reserved` carrying `since` and nothing else) go in,
 * and the anchor that comes out is the one that reflects how long each animal
 * has actually been waiting.
 *
 * The specific failure this is aimed at: `listing->>'since'` is present,
 * plausible, and produces a perfectly sortable column — while dating the moment
 * the animal stopped being available. A backfill reading it (or defaulting to
 * `now()`) leaves nothing visibly broken. Only the ordering is wrong, and only
 * against data nobody has independently derived. So every assertion below
 * compares the anchor to an independently derived value rather than to
 * "not null", and the corpus is deliberately built with `since` constant across
 * rows and `created_at` varying — the shape that makes a wrong source look
 * right.
 */

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://opika:opika@localhost:5433/opika_test";

const MIGRATIONS_DIR = resolve(fileURLToPath(import.meta.url), "../../drizzle");

/** The migration under test. */
const BACKFILL_TAG = "0004_tan_romulus";

type JournalEntry = { readonly tag: string };

const client = postgres(TEST_DATABASE_URL, { max: 1 });
const db = drizzle(client, { schema });

afterAll(async () => {
  await client.end();
});

async function migrationTags(): Promise<readonly string[]> {
  const journal = JSON.parse(
    await readFile(resolve(MIGRATIONS_DIR, "meta/_journal.json"), "utf8"),
  ) as { readonly entries: readonly JournalEntry[] };
  return journal.entries.map((entry) => entry.tag);
}

/**
 * Apply one migration file, statement by statement.
 *
 * Drizzle's own migrator is all-or-nothing, which is exactly what this test
 * cannot use: the point is to stop at the state before the backfill, write
 * legacy rows, and only then apply it. The `--> statement-breakpoint` marker is
 * drizzle-kit's own separator and never appears inside a statement — including
 * inside the `DO $$ ... $$` guard, whose semicolons would otherwise split
 * wrongly.
 */
async function applyMigration(tag: string): Promise<void> {
  const sqlText = await readFile(resolve(MIGRATIONS_DIR, `${tag}.sql`), "utf8");
  for (const statement of sqlText.split("--> statement-breakpoint")) {
    if (statement.trim().length > 0) {
      await client.unsafe(statement);
    }
  }
}

/** Drop everything and migrate to the state immediately before the backfill. */
async function resetToPreBackfillState(): Promise<void> {
  await client.unsafe(`
    DROP TABLE IF EXISTS sessions CASCADE;
    DROP TABLE IF EXISTS reveals CASCADE;
    DROP TABLE IF EXISTS swipes CASCADE;
    DROP TABLE IF EXISTS animals CASCADE;
    DROP TABLE IF EXISTS adopters CASCADE;
    DROP TABLE IF EXISTS shelters CASCADE;
    DROP TABLE IF EXISTS cities CASCADE;
    DROP SCHEMA IF EXISTS drizzle CASCADE;
  `);

  const tags = await migrationTags();
  const backfillIndex = tags.indexOf(BACKFILL_TAG);
  // A rename or a squash would otherwise leave this test silently applying
  // every migration and asserting against an already-correct table.
  expect(backfillIndex, `${BACKFILL_TAG} is not in the migration journal`).toBeGreaterThan(-1);

  for (const tag of tags.slice(0, backfillIndex)) {
    await applyMigration(tag);
  }
}

const AGE_ANCHOR = new Date("2024-01-01T00:00:00.000Z");
/** Constant across every reserved row, as it was in the real pre-E0 corpus. */
const RESERVED_SINCE = new Date("2026-08-02T12:00:00.000Z");

type LegacyAnimal = {
  readonly id: string;
  readonly createdAt: Date;
  readonly listingKind: string;
  readonly listing: Record<string, unknown>;
};

/**
 * Insert an animal in the pre-E0 shape via raw SQL.
 *
 * Deliberately not through `animalRepo`: that writes the *current* schema,
 * including the `wait_anchor_at` column this migration is about to add and a
 * `listing` JSONB the current domain type forces to carry `publishedAt`. Going
 * through it would mean testing the backfill against rows that never needed
 * backfilling.
 */
async function insertLegacyAnimal(
  animal: LegacyAnimal,
  shelterId: string,
  cityId: string,
): Promise<void> {
  const declared = JSON.stringify({
    source: "shelter_declared",
    state: "unknown",
    declaredAt: AGE_ANCHOR.toISOString(),
  });
  await client`
    INSERT INTO animals (
      id, shelter_id, name, species, sex, size,
      age, age_anchor_at, description_uk,
      photos, vaccination, spay_neuter, document_readiness,
      listing, listing_kind, city_id, created_at, last_updated_at
    ) VALUES (
      ${animal.id}, ${shelterId}, ${"Тест"}, ${"dog"}, ${"unknown"}, ${"medium"},
      ${JSON.stringify({ kind: "birth_date", date: AGE_ANCHOR.toISOString(), precision: "year" })}::jsonb,
      ${AGE_ANCHOR.toISOString()}::timestamptz, ${"Опис"},
      ${"[]"}::jsonb,
      ${declared}::jsonb,
      ${declared}::jsonb,
      ${JSON.stringify({ kind: "unknown" })}::jsonb,
      ${JSON.stringify(animal.listing)}::jsonb, ${animal.listingKind}, ${cityId},
      ${animal.createdAt.toISOString()}::timestamptz,
      ${animal.createdAt.toISOString()}::timestamptz
    )`;
}

/** Ten reserved rows whose `created_at` values are all different. */
function legacyReservedCorpus(): readonly LegacyAnimal[] {
  return Array.from({ length: 10 }, (_, i) => ({
    id: `a0000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    // Spread across ten months, so an ordering derived from these is
    // distinguishable from any ordering derived from a constant — and
    // deliberately *descending* with the id, so it is also distinguishable from
    // the id tiebreak the ordering falls back to when every anchor is equal.
    createdAt: new Date(Date.UTC(2025, 9 + (9 - i), 1, 12, 0, 0)),
    listingKind: "reserved",
    // The pre-E0 shape: no `publishedAt` anywhere, and `since` identical on
    // every row.
    listing: { kind: "reserved", since: RESERVED_SINCE.toISOString() },
  }));
}

async function seedFixtureShelter(): Promise<{ shelterId: string; cityId: string }> {
  const city = makeCity();
  await cityRepo(db).insert(city);
  const shelter = makeShelter();
  await shelterRepo(db).insert({
    ...shelter,
    publicLocation: { ...shelter.publicLocation, cityId: city.id },
  });
  return { shelterId: shelter.id, cityId: city.id };
}

/**
 * Every instant arrives as an ISO string, cast in SQL rather than left to the
 * driver's type handling, so an assertion compares two values of the same kind
 * whatever the driver decides to hand back.
 */
type AnchorRow = {
  readonly id: string;
  readonly wait_anchor_at: string | null;
  readonly created_at: string;
  readonly published_at: string | null;
  readonly since: string | null;
};

const epoch = (value: string | null | undefined): number | null =>
  value == null ? null : new Date(value).getTime();

async function anchorRows(): Promise<readonly AnchorRow[]> {
  return (await client`
    SELECT id,
           to_char(wait_anchor_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS wait_anchor_at,
           to_char(created_at     AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
           listing->>'publishedAt' AS published_at,
           listing->>'since'       AS since
    FROM animals
    ORDER BY id`) as unknown as readonly AnchorRow[];
}

describe("0004 wait_anchor_at backfill", () => {
  beforeEach(async () => {
    await resetToPreBackfillState();
  });

  it("anchors legacy reserved rows to created_at, not to the reservation instant", async () => {
    const { shelterId, cityId } = await seedFixtureShelter();
    const corpus = legacyReservedCorpus();
    for (const animal of corpus) {
      await insertLegacyAnimal(animal, shelterId, cityId);
    }

    await applyMigration(BACKFILL_TAG);

    const rows = await anchorRows();
    expect(rows, "the corpus must be non-empty or every assertion below is vacuous").toHaveLength(
      corpus.length,
    );

    const disagreeing = rows.filter((row) => epoch(row.wait_anchor_at) !== epoch(row.created_at));
    expect(disagreeing.map((row) => row.id)).toEqual([]);

    // The specific wrong source, named. `since` is constant here, so a backfill
    // reading it would collapse ten distinct anchors into one.
    const distinctAnchors = new Set(rows.map((row) => row.wait_anchor_at));
    expect(distinctAnchors.size).toBe(corpus.length);

    // ...and a `now()` default would put every anchor after the reservation.
    for (const row of rows) {
      expect(epoch(row.since)).toBe(RESERVED_SINCE.getTime());
      expect(epoch(row.wait_anchor_at)).toBeLessThan(RESERVED_SINCE.getTime());
    }
  });

  it("orders legacy reserved rows by how long they have actually waited", async () => {
    const { shelterId, cityId } = await seedFixtureShelter();
    const corpus = legacyReservedCorpus();
    for (const animal of corpus) {
      await insertLegacyAnimal(animal, shelterId, cityId);
    }

    await applyMigration(BACKFILL_TAG);

    const ordered = (await client`
      SELECT id FROM animals
      WHERE listing_kind IN ('published', 'reserved')
      ORDER BY wait_anchor_at ASC NULLS LAST, id ASC`) as unknown as readonly { id: string }[];

    const expected = [...corpus]
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((animal) => animal.id);

    // The assertion the column exists for. Any constant source — `since`,
    // `now()` — degenerates this to an ordering by id alone.
    expect(ordered.map((row) => row.id)).toEqual(expected);
    expect(ordered.map((row) => row.id)).not.toEqual([...expected].sort());
  });

  it("writes publishedAt into the listing JSONB, in the format the reader revives", async () => {
    const { shelterId, cityId } = await seedFixtureShelter();
    const corpus = legacyReservedCorpus();
    for (const animal of corpus) {
      await insertLegacyAnimal(animal, shelterId, cityId);
    }

    await applyMigration(BACKFILL_TAG);

    const rows = await anchorRows();
    for (const row of rows) {
      // `rowToAnimal` hands this JSONB straight to `AnimalListingState` with no
      // Zod parse, so a missing or unrevivable `publishedAt` would be
      // `undefined` at runtime on a type that declares it required — and would
      // typecheck perfectly.
      expect(row.published_at, `${row.id} has no publishedAt in its listing`).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
      expect(epoch(row.published_at)).toBe(epoch(row.created_at));
      // The reservation instant is preserved, not overwritten.
      expect(row.since).toBe(RESERVED_SINCE.toISOString());
    }
  });

  it("anchors published rows to their own publishedAt and leaves the rest null", async () => {
    const { shelterId, cityId } = await seedFixtureShelter();
    const publishedAt = new Date(Date.UTC(2026, 0, 15, 9, 30, 0));
    const publishedRow: LegacyAnimal = {
      id: "b0000000-0000-4000-8000-000000000001",
      createdAt: new Date(Date.UTC(2025, 11, 1, 12, 0, 0)),
      listingKind: "published",
      listing: { kind: "published", publishedAt: publishedAt.toISOString() },
    };
    const undiscoverable: readonly LegacyAnimal[] = [
      {
        id: "b0000000-0000-4000-8000-000000000002",
        createdAt: new Date(Date.UTC(2025, 11, 2, 12, 0, 0)),
        listingKind: "draft",
        listing: { kind: "draft" },
      },
      {
        id: "b0000000-0000-4000-8000-000000000003",
        createdAt: new Date(Date.UTC(2025, 11, 3, 12, 0, 0)),
        listingKind: "adopted",
        listing: { kind: "adopted", adoptedAt: publishedAt.toISOString() },
      },
      {
        id: "b0000000-0000-4000-8000-000000000004",
        createdAt: new Date(Date.UTC(2025, 11, 4, 12, 0, 0)),
        listingKind: "withdrawn",
        listing: {
          kind: "withdrawn",
          withdrawnAt: publishedAt.toISOString(),
          reason: "transferred",
        },
      },
    ];
    for (const animal of [publishedRow, ...undiscoverable]) {
      await insertLegacyAnimal(animal, shelterId, cityId);
    }

    await applyMigration(BACKFILL_TAG);

    const byId = new Map((await anchorRows()).map((row) => [row.id, row]));

    // A published row's answer was always in the JSONB; the backfill must lift
    // it, not substitute created_at the way the reserved rows require.
    expect(epoch(byId.get(publishedRow.id)?.wait_anchor_at)).toBe(publishedAt.getTime());
    expect(epoch(byId.get(publishedRow.id)?.wait_anchor_at)).not.toBe(
      publishedRow.createdAt.getTime(),
    );

    // Nothing an adopter cannot see gets an anchor: a value there would exist
    // only to be misread, and `waitAnchorOf` returns null for these kinds.
    for (const animal of undiscoverable) {
      expect(byId.get(animal.id)?.wait_anchor_at, `${animal.listingKind} was given an anchor`).toBe(
        null,
      );
    }
  });

  it("aborts rather than shipping a discoverable row with no anchor", async () => {
    const { shelterId, cityId } = await seedFixtureShelter();
    // A published row whose JSONB never carried `publishedAt` — the one legacy
    // corruption the backfill has no source for. Without the migration's own
    // guard this would migrate "successfully" and leave a discoverable animal
    // that sorts last forever under longest-waiting.
    await insertLegacyAnimal(
      {
        id: "c0000000-0000-4000-8000-000000000001",
        createdAt: new Date(Date.UTC(2026, 0, 1, 12, 0, 0)),
        listingKind: "published",
        listing: { kind: "published" },
      },
      shelterId,
      cityId,
    );

    await expect(applyMigration(BACKFILL_TAG)).rejects.toThrow(/wait_anchor_at backfill is wrong/);
  });
});
