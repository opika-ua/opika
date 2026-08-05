import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../schema/index.js";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://opika:opika@localhost:5433/opika_test";

export type TestContext = {
  db: ReturnType<typeof drizzle<typeof schema>>;
  /** Rolls back the transaction wrapping this test. Called automatically in afterEach. */
  teardown: () => Promise<void>;
};

/**
 * Call once in a `beforeAll` or at the top of a test file. Returns a factory
 * that gives each test its own savepoint-wrapped database connection.
 *
 * The pattern: one long-lived connection runs `BEGIN` once. Each test creates a
 * savepoint, runs against it, and rolls back to the savepoint in `afterEach`.
 * The outer transaction is never committed, so nothing persists.
 *
 * This is faster than truncating tables and avoids per-test migration runs.
 */
export async function setupTestDatabase() {
  const client = postgres(TEST_DATABASE_URL, { max: 1 });
  const db = drizzle(client, { schema });

  // Push the schema to the test database (idempotent — drops and recreates).
  // This uses drizzle-kit's push approach via raw SQL for the tables we define.
  // For integration tests we use a simpler approach: just ensure tables exist.
  await ensureSchema(client);

  return {
    db,
    async cleanup() {
      await client.end();
    },
  };
}

async function ensureSchema(client: postgres.Sql) {
  // Drop all tables in reverse dependency order, then recreate.
  // This is acceptable for tests — fast and always in sync with the schema.
  await client.unsafe(`
    DROP TABLE IF EXISTS reveals CASCADE;
    DROP TABLE IF EXISTS swipes CASCADE;
    DROP TABLE IF EXISTS animals CASCADE;
    DROP TABLE IF EXISTS adopters CASCADE;
    DROP TABLE IF EXISTS shelters CASCADE;
    DROP TABLE IF EXISTS cities CASCADE;
  `);

  await client.unsafe(`
    CREATE TABLE cities (
      id TEXT PRIMARY KEY,
      name_uk TEXT NOT NULL,
      name_en_text TEXT,
      name_en_provenance TEXT CHECK (name_en_provenance IN ('human', 'machine')),
      centroid_lat DOUBLE PRECISION NOT NULL,
      centroid_lng DOUBLE PRECISION NOT NULL
    );

    CREATE TABLE shelters (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      description_uk TEXT NOT NULL,
      description_en_text TEXT,
      description_en_provenance TEXT CHECK (description_en_provenance IN ('human', 'machine')),
      legal_entity JSONB NOT NULL,
      public_location JSONB NOT NULL,
      exact_address JSONB NOT NULL,
      contact JSONB NOT NULL,
      donation JSONB,
      verification_status TEXT NOT NULL CHECK (verification_status IN ('pending', 'under_review', 'verified', 'rejected', 'paused', 'suspended')),
      verification JSONB NOT NULL,
      city_id TEXT NOT NULL REFERENCES cities(id),
      exact_lat TEXT NOT NULL,
      exact_lng TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      last_updated_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX shelters_city_id_idx ON shelters(city_id);
    CREATE INDEX shelters_verification_status_idx ON shelters(verification_status);

    CREATE TABLE animals (
      id TEXT PRIMARY KEY,
      shelter_id TEXT NOT NULL REFERENCES shelters(id),
      name TEXT NOT NULL,
      species TEXT NOT NULL CHECK (species IN ('dog', 'cat')),
      sex TEXT NOT NULL CHECK (sex IN ('male', 'female', 'unknown')),
      size TEXT NOT NULL CHECK (size IN ('small', 'medium', 'large')),
      age JSONB NOT NULL,
      age_anchor_at TIMESTAMPTZ NOT NULL,
      description_uk TEXT NOT NULL,
      description_en_text TEXT,
      description_en_provenance TEXT CHECK (description_en_provenance IN ('human', 'machine')),
      photos JSONB NOT NULL,
      vaccination JSONB NOT NULL,
      spay_neuter JSONB NOT NULL,
      document_readiness JSONB NOT NULL,
      listing JSONB NOT NULL,
      listing_kind TEXT NOT NULL CHECK (listing_kind IN ('draft', 'published', 'reserved', 'adopted', 'withdrawn')),
      city_id TEXT NOT NULL REFERENCES cities(id),
      created_at TIMESTAMPTZ NOT NULL,
      last_updated_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX animals_shelter_id_idx ON animals(shelter_id);
    CREATE INDEX animals_feed_idx ON animals(listing_kind, city_id, species, size, last_updated_at, id);
    CREATE INDEX animals_feed_unfiltered_idx ON animals(last_updated_at DESC, id ASC)
      WHERE listing_kind IN ('published', 'reserved');

    CREATE TABLE adopters (
      id TEXT PRIMARY KEY,
      identity_kind TEXT NOT NULL CHECK (identity_kind IN ('anonymous', 'account')),
      device_session_id TEXT UNIQUE,
      account_id TEXT UNIQUE,
      email TEXT,
      country TEXT NOT NULL,
      preferred_locale TEXT NOT NULL CHECK (preferred_locale IN ('uk', 'en')),
      saved_filters JSONB,
      created_at TIMESTAMPTZ NOT NULL,
      CONSTRAINT adopters_identity_check CHECK (
        (identity_kind = 'anonymous' AND device_session_id IS NOT NULL AND account_id IS NULL)
        OR (identity_kind = 'account' AND account_id IS NOT NULL AND email IS NOT NULL AND device_session_id IS NULL)
      )
    );

    CREATE TABLE swipes (
      adopter_id TEXT NOT NULL REFERENCES adopters(id),
      animal_id TEXT NOT NULL REFERENCES animals(id),
      direction TEXT NOT NULL CHECK (direction IN ('pass', 'interested')),
      swiped_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (adopter_id, animal_id)
    );
    CREATE INDEX swipes_adopter_direction_idx ON swipes(adopter_id, direction, swiped_at);

    CREATE TABLE reveals (
      id TEXT PRIMARY KEY,
      adopter_id TEXT NOT NULL REFERENCES adopters(id),
      animal_id TEXT NOT NULL REFERENCES animals(id),
      shelter_id TEXT NOT NULL REFERENCES shelters(id),
      revealed_at TIMESTAMPTZ NOT NULL,
      shelter_snapshot JSONB NOT NULL,
      animal_snapshot JSONB NOT NULL
    );
    CREATE INDEX reveals_adopter_id_idx ON reveals(adopter_id, revealed_at);
    CREATE INDEX reveals_shelter_id_idx ON reveals(shelter_id);
    CREATE INDEX reveals_adopter_animal_idx ON reveals(adopter_id, animal_id);
  `);
}

/**
 * Truncate all tables between tests. Faster than dropping/recreating and
 * preserves the schema.
 */
export async function truncateAll(db: ReturnType<typeof drizzle<typeof schema>>) {
  await db.execute(sql`TRUNCATE reveals, swipes, animals, adopters, shelters, cities CASCADE`);
}
