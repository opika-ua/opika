import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { makeCity, setupTestDatabase } from "../src/test-utils/index";
import { TEST_DATABASE_URL } from "../src/test-utils/setup";
import { insertLegacyAnimal, insertLegacyCity, insertLegacyShelter } from "./legacy-rows";

/**
 * Migration 0010 (HS-Q9): `animals.first_published_at`, backfilled. The
 * failure aimed at: a once-public listing left unmarked, which a restore to
 * draft would then make deletable, or a draft marked as if it had been public.
 */

const MIGRATIONS_DIR = resolve(fileURLToPath(import.meta.url), "../../drizzle");
const TAG = "0010_clear_bastion";

const client = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => {} });

afterAll(async () => {
  await (await setupTestDatabase()).cleanup();
  await client.end();
});

async function applyMigration(tag: string): Promise<void> {
  const sqlText = await readFile(resolve(MIGRATIONS_DIR, `${tag}.sql`), "utf8");
  for (const statement of sqlText.split("--> statement-breakpoint")) {
    if (statement.trim().length > 0) await client.unsafe(statement);
  }
}

async function resetToPreMigrationState(): Promise<void> {
  await client.unsafe(`
    DROP TABLE IF EXISTS support_sessions CASCADE;
    DROP TABLE IF EXISTS invitation_created_users CASCADE;
    DROP TABLE IF EXISTS shelter_history CASCADE;
    DROP TABLE IF EXISTS super_admins CASCADE;
    DROP TABLE IF EXISTS auth_invitation CASCADE;
    DROP TABLE IF EXISTS auth_member CASCADE;
    DROP TABLE IF EXISTS auth_session CASCADE;
    DROP TABLE IF EXISTS auth_account CASCADE;
    DROP TABLE IF EXISTS auth_verification CASCADE;
    DROP TABLE IF EXISTS auth_organization CASCADE;
    DROP TABLE IF EXISTS auth_user CASCADE;
    DROP TABLE IF EXISTS sessions CASCADE; DROP TABLE IF EXISTS reveals CASCADE;
    DROP TABLE IF EXISTS swipes CASCADE; DROP TABLE IF EXISTS animals CASCADE;
    DROP TABLE IF EXISTS adopters CASCADE; DROP TABLE IF EXISTS shelters CASCADE;
    DROP TABLE IF EXISTS cities CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE;
  `);
  const journal = JSON.parse(
    await readFile(resolve(MIGRATIONS_DIR, "meta/_journal.json"), "utf8"),
  ) as { entries: { tag: string }[] };
  const tags = journal.entries.map((e) => e.tag);
  const index = tags.indexOf(TAG);
  expect(index, `${TAG} is not in the migration journal`).toBeGreaterThan(-1);
  for (const tag of tags.slice(0, index)) await applyMigration(tag);
}

const AT = "2026-06-01T12:00:00.000Z";
const SHELTER = "51000000-0000-4000-8000-000000000001";
const aid = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

async function seedShelter(): Promise<string> {
  const city = makeCity();
  await insertLegacyCity(client, city);
  await insertLegacyShelter(client, { id: SHELTER, cityId: city.id });
  return city.id;
}

describe("0010 first_published_at", () => {
  beforeEach(async () => {
    await resetToPreMigrationState();
  });

  it("marks published and reserved from publishedAt, adopted and withdrawn from their own instant, and no draft", async () => {
    const cityId = await seedShelter();
    const PUBLISHED = "2026-03-01T12:00:00.000Z";
    const rows = [
      {
        id: aid(1),
        listingKind: "published",
        listing: { kind: "published", publishedAt: PUBLISHED, confirmedAt: AT, undoable: null },
      },
      {
        id: aid(2),
        listingKind: "reserved",
        listing: {
          kind: "reserved",
          since: AT,
          publishedAt: PUBLISHED,
          confirmedAt: AT,
          undoable: null,
        },
      },
      { id: aid(3), listingKind: "draft", listing: { kind: "draft" } },
      { id: aid(4), listingKind: "adopted", listing: { kind: "adopted", adoptedAt: AT } },
      {
        id: aid(5),
        listingKind: "withdrawn",
        listing: {
          kind: "withdrawn",
          withdrawnAt: AT,
          reason: { code: "listing_error", note: null },
        },
      },
    ];
    for (const row of rows)
      await insertLegacyAnimal(client, { ...row, shelterId: SHELTER, cityId });

    await applyMigration(TAG);

    const result = (await client`
      SELECT id, first_published_at AS f FROM animals ORDER BY id`) as unknown as {
      id: string;
      f: Date | string | null;
    }[];
    expect(result.map((r) => [r.id, r.f === null ? null : new Date(r.f).toISOString()])).toEqual([
      [aid(1), PUBLISHED],
      [aid(2), PUBLISHED],
      [aid(3), null],
      [aid(4), AT],
      [aid(5), AT],
    ]);
  });

  it("aborts if a non-draft listing can't be marked", async () => {
    const cityId = await seedShelter();
    // A published listing missing the publishedAt the backfill reads.
    await insertLegacyAnimal(client, {
      id: aid(1),
      shelterId: SHELTER,
      cityId,
      listingKind: "published",
      listing: { kind: "published", confirmedAt: AT, undoable: null },
    });
    await expect(applyMigration(TAG)).rejects.toThrow(/first_published_at backfill is wrong/);
  });
});
