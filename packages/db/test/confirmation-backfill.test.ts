import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AnimalId } from "@opika/domain";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { animalRepo } from "../src/repos/animal-repo";
import { cityRepo } from "../src/repos/city-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import * as schema from "../src/schema/index";
import { makeCity, makeShelter, setupTestDatabase } from "../src/test-utils/index";

/**
 * The `last_confirmed_at` backfill (H2-3, H2-14), tested against rows shaped
 * the way the table looked *before* it ran — same technique and the same
 * reason as `wait-anchor-backfill.test.ts`: `setupTestDatabase()` hands back a
 * table that is already correct, which would prove only that the schema
 * exists.
 *
 * The specific wrong sources this is aimed at, each of which produces a
 * perfectly sortable column and nothing visibly broken:
 * - `created_at` — the answer this replaced (H2-14). Every row below is
 *   created well before it was last updated, so a `created_at` backfill
 *   disagrees on every row.
 * - `publishedAt` — plausible, and wrong wherever an animal was updated after
 *   publishing.
 * - `now()` — would make the whole corpus read "confirmed today".
 */

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://opika:opika@localhost:5433/opika_test";

const MIGRATIONS_DIR = resolve(fileURLToPath(import.meta.url), "../../drizzle");

/** The migration under test. */
const BACKFILL_TAG = "0006_perpetual_thunderbolt";

const client = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => {} });
const db = drizzle(client, { schema });

afterAll(async () => {
  // See `wait-anchor-backfill.test.ts`: raw-SQL migration bypasses drizzle's
  // own bookkeeping, so restore it for whichever test file runs next.
  await (await setupTestDatabase()).cleanup();
  await client.end();
});

async function migrationTags(): Promise<readonly string[]> {
  const journal = JSON.parse(
    await readFile(resolve(MIGRATIONS_DIR, "meta/_journal.json"), "utf8"),
  ) as { readonly entries: readonly { readonly tag: string }[] };
  return journal.entries.map((entry) => entry.tag);
}

/** One migration file, statement by statement (drizzle-kit's own separator). */
async function applyMigration(tag: string): Promise<void> {
  const sqlText = await readFile(resolve(MIGRATIONS_DIR, `${tag}.sql`), "utf8");
  for (const statement of sqlText.split("--> statement-breakpoint")) {
    if (statement.trim().length > 0) {
      await client.unsafe(statement);
    }
  }
}

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
  // A rename or a squash would otherwise apply every migration and assert
  // against an already-correct table.
  expect(backfillIndex, `${BACKFILL_TAG} is not in the migration journal`).toBeGreaterThan(-1);
  for (const tag of tags.slice(0, backfillIndex)) {
    await applyMigration(tag);
  }
}

const AGE_ANCHOR = new Date("2024-01-01T00:00:00.000Z");
const day = (n: number): Date => new Date(Date.UTC(2026, 5, n, 12, 0, 0));

type LegacyAnimal = {
  readonly id: string;
  readonly createdAt: Date;
  readonly lastUpdatedAt: Date;
  readonly listingKind: string;
  readonly listing: Record<string, unknown>;
};

/** The pre-0006 shape, via raw SQL — `animalRepo` would write the new column. */
async function insertLegacyAnimal(a: LegacyAnimal, shelterId: string, cityId: string) {
  const declared = JSON.stringify({
    source: "shelter_declared",
    state: "unknown",
    declaredAt: AGE_ANCHOR.toISOString(),
  });
  const publishedAt = a.listing.publishedAt;
  await client`
    INSERT INTO animals (
      id, shelter_id, name, species, sex, size,
      age, age_anchor_at, wait_anchor_at, description_uk,
      photos, vaccination, spay_neuter, document_readiness,
      listing, listing_kind, city_id, created_at, last_updated_at
    ) VALUES (
      ${a.id}, ${shelterId}, ${"Тест"}, ${"dog"}, ${"unknown"}, ${"medium"},
      ${JSON.stringify({ kind: "birth_date", date: AGE_ANCHOR.toISOString(), precision: "year" })}::jsonb,
      ${AGE_ANCHOR.toISOString()}::timestamptz,
      ${typeof publishedAt === "string" ? publishedAt : null}::timestamptz,
      ${"Опис"},
      ${"[]"}::jsonb, ${declared}::jsonb, ${declared}::jsonb,
      ${JSON.stringify({ kind: "unknown" })}::jsonb,
      ${JSON.stringify(a.listing)}::jsonb, ${a.listingKind}, ${cityId},
      ${a.createdAt.toISOString()}::timestamptz,
      ${a.lastUpdatedAt.toISOString()}::timestamptz
    )`;
}

const id = (n: number): string => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/**
 * Six published rows, each created on day 1, published on a different day,
 * and last updated a different number of days after publishing — so
 * `created_at`, `publishedAt` and `last_updated_at` are three different
 * values on every row, and a backfill reading the wrong one disagrees.
 */
const PUBLISHED: readonly LegacyAnimal[] = Array.from({ length: 6 }, (_, i) => ({
  id: id(i),
  createdAt: day(1),
  lastUpdatedAt: day(10 + ((i * 5) % 6)),
  listingKind: "published",
  listing: { kind: "published", publishedAt: day(2 + i).toISOString() },
}));

const RESERVED: LegacyAnimal = {
  id: id(10),
  createdAt: day(1),
  lastUpdatedAt: day(14),
  listingKind: "reserved",
  listing: { kind: "reserved", since: day(20).toISOString(), publishedAt: day(3).toISOString() },
};

/** The H2-14 guard's case: updated before it was published (only reachable in hand-edited data). */
const UPDATED_BEFORE_PUBLISHED: LegacyAnimal = {
  id: id(20),
  createdAt: day(1),
  lastUpdatedAt: day(4),
  listingKind: "published",
  listing: { kind: "published", publishedAt: day(9).toISOString() },
};

const INVISIBLE: readonly LegacyAnimal[] = [
  {
    id: id(30),
    createdAt: day(1),
    lastUpdatedAt: day(5),
    listingKind: "draft",
    listing: { kind: "draft" },
  },
  {
    id: id(31),
    createdAt: day(1),
    lastUpdatedAt: day(5),
    listingKind: "adopted",
    listing: { kind: "adopted", adoptedAt: day(6).toISOString() },
  },
  {
    id: id(32),
    createdAt: day(1),
    lastUpdatedAt: day(5),
    listingKind: "withdrawn",
    listing: { kind: "withdrawn", withdrawnAt: day(6).toISOString(), reason: "deceased" },
  },
];

async function seed(rows: readonly LegacyAnimal[]): Promise<void> {
  const city = makeCity();
  await cityRepo(db).insert(city);
  const shelter = makeShelter();
  await shelterRepo(db).insert({
    ...shelter,
    publicLocation: { ...shelter.publicLocation, cityId: city.id },
  });
  for (const row of rows) await insertLegacyAnimal(row, shelter.id, city.id);
}

type ConfirmationRow = {
  readonly id: string;
  readonly column: string | null;
  readonly json: string | null;
};

async function confirmationRows(): Promise<ReadonlyMap<string, ConfirmationRow>> {
  const rows = (await client`
    SELECT id,
           to_char(last_confirmed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS column,
           listing->>'confirmedAt' AS json
    FROM animals`) as unknown as readonly ConfirmationRow[];
  return new Map(rows.map((row) => [row.id, row]));
}

describe("0006 last_confirmed_at backfill", () => {
  beforeEach(async () => {
    await resetToPreBackfillState();
  });

  it("confirms each published row at its last update — not its creation, publication or now", async () => {
    await seed(PUBLISHED);
    await applyMigration(BACKFILL_TAG);
    const rows = await confirmationRows();

    expect(rows.size, "an empty corpus would make every assertion vacuous").toBe(PUBLISHED.length);
    for (const animal of PUBLISHED) {
      const row = rows.get(animal.id);
      const expected = animal.lastUpdatedAt.toISOString();
      expect(row?.json, `${animal.id} listing.confirmedAt`).toBe(expected);
      expect(row?.column, `${animal.id} last_confirmed_at`).toBe(expected);
      // The wrong sources, named.
      expect(row?.json).not.toBe(animal.createdAt.toISOString());
      expect(row?.json).not.toBe(animal.listing.publishedAt);
    }
    // ...and `now()` would collapse six distinct values into one.
    expect(new Set([...rows.values()].map((row) => row.column)).size).toBe(PUBLISHED.length);
  });

  it("confirms a reserved row at its last update and leaves since/publishedAt untouched", async () => {
    await seed([RESERVED]);
    await applyMigration(BACKFILL_TAG);

    const [row] = (await client`
      SELECT listing->>'confirmedAt' AS confirmed, listing->>'since' AS since,
             listing->>'publishedAt' AS published
      FROM animals WHERE id = ${RESERVED.id}`) as unknown as {
      confirmed: string;
      since: string;
      published: string;
    }[];
    expect(row).toEqual({
      confirmed: RESERVED.lastUpdatedAt.toISOString(),
      since: RESERVED.listing.since,
      published: RESERVED.listing.publishedAt,
    });
  });

  /** H2-14's guard: never confirmed before published; such rows take publishedAt, and are reported. */
  it("confirms a row updated before it was published at publishedAt instead, and reports the count", async () => {
    await seed([...PUBLISHED, UPDATED_BEFORE_PUBLISHED]);

    const notices: string[] = [];
    const noticing = postgres(TEST_DATABASE_URL, {
      max: 1,
      onnotice: (notice) => notices.push(String(notice.message)),
    });
    try {
      const sqlText = await readFile(resolve(MIGRATIONS_DIR, `${BACKFILL_TAG}.sql`), "utf8");
      for (const statement of sqlText.split("--> statement-breakpoint")) {
        if (statement.trim().length > 0) await noticing.unsafe(statement);
      }
    } finally {
      await noticing.end();
    }

    const row = (await confirmationRows()).get(UPDATED_BEFORE_PUBLISHED.id);
    expect(row?.column).toBe(UPDATED_BEFORE_PUBLISHED.listing.publishedAt);
    expect(notices).toContain(
      "last_confirmed_at backfill: 1 row(s) had last_updated_at before publishedAt and are confirmed at publishedAt instead",
    );
  });

  it("leaves draft, adopted and withdrawn rows unconfirmed", async () => {
    await seed(INVISIBLE);
    await applyMigration(BACKFILL_TAG);
    const rows = await confirmationRows();

    expect(rows.size).toBe(INVISIBLE.length);
    for (const animal of INVISIBLE) {
      expect(rows.get(animal.id), animal.listingKind).toEqual({
        id: animal.id,
        column: null,
        json: null,
      });
    }
  });

  /**
   * The abort guard, branch by branch. Each case is a pre-0006 row in a
   * shape the backfill doesn't anticipate, and the migration must refuse to
   * leave it behind silently. A guard no test triggers is documentation.
   */
  describe("aborts rather than leaving a row it can't stand behind", () => {
    it("refuses a discoverable row whose listing already carries confirmedAt: null", async () => {
      // `listing->'confirmedAt'` is JSON null here, not SQL NULL, so the
      // backfill skips it and the column comes out empty: the `missing` branch.
      await seed([
        {
          ...(PUBLISHED[0] as LegacyAnimal),
          listing: { ...(PUBLISHED[0] as LegacyAnimal).listing, confirmedAt: null },
        },
      ]);
      await expect(applyMigration(BACKFILL_TAG)).rejects.toThrow(/1 discoverable rows unconfirmed/);
    });

    it("refuses a non-discoverable row that already carries a confirmation", async () => {
      await seed([
        {
          ...(INVISIBLE[0] as LegacyAnimal),
          listing: { kind: "draft", confirmedAt: day(5).toISOString() },
        },
      ]);
      await expect(applyMigration(BACKFILL_TAG)).rejects.toThrow(
        /1 non-discoverable rows carrying a confirmation/,
      );
    });

    it("refuses a row whose existing confirmedAt predates its publication", async () => {
      // Pre-set (so the backfill leaves it), and earlier than publishedAt.
      await seed([
        {
          ...(PUBLISHED[0] as LegacyAnimal),
          listing: {
            ...(PUBLISHED[0] as LegacyAnimal).listing,
            confirmedAt: day(1).toISOString(),
          },
        },
      ]);
      await expect(applyMigration(BACKFILL_TAG)).rejects.toThrow(/1 confirmed before publishedAt/);
    });
  });

  /**
   * `rowToAnimal` hands the JSONB straight to `AnimalListingState` with no
   * Zod parse, so a `confirmedAt` the reader can't revive into a Date would be
   * a string at runtime on a type that says Date — and would typecheck.
   */
  it("writes confirmedAt in the format the reader revives into a Date", async () => {
    await seed([PUBLISHED[0] as LegacyAnimal]);
    await applyMigration(BACKFILL_TAG);

    const animal = await animalRepo(db).findById((PUBLISHED[0] as LegacyAnimal).id as AnimalId);
    const listing = animal?.listing;
    expect(listing?.kind).toBe("published");
    const confirmedAt = listing?.kind === "published" ? listing.confirmedAt : undefined;
    expect(confirmedAt).toBeInstanceOf(Date);
    expect(confirmedAt?.toISOString()).toBe(
      (PUBLISHED[0] as LegacyAnimal).lastUpdatedAt.toISOString(),
    );
  });
});
