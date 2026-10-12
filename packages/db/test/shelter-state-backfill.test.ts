import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { cityRepo } from "../src/repos/city-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import * as schema from "../src/schema/index";
import { makeCity, setupTestDatabase } from "../src/test-utils/index";
import { TEST_DATABASE_URL } from "../src/test-utils/setup";
import { insertLegacyShelter } from "./legacy-rows";

/**
 * Migration 0007 (H2 S2b), tested against rows in the shape they had *before*
 * it ran, for the same reason as the other backfill tests: the current schema
 * would only prove the new shape exists, not that old rows were carried into
 * it correctly.
 *
 * The specific failures aimed at: a reshape that rewrites only the top-level
 * `pausedBy` and misses the one inside a suspended shelter's `priorState`
 * (reinstatement would then restore a pause with no actor); and a withdrawal
 * backfill that flattens every code to `other` (H2-13 forbids it, since the
 * codes are real data).
 */

const MIGRATIONS_DIR = resolve(fileURLToPath(import.meta.url), "../../drizzle");
const RESHAPE_TAG = "0007_lean_joshua_kane";

const client = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => {} });
const db = drizzle(client, { schema });

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

async function resetToPreReshapeState(): Promise<void> {
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
  const journal = JSON.parse(
    await readFile(resolve(MIGRATIONS_DIR, "meta/_journal.json"), "utf8"),
  ) as { entries: { tag: string }[] };
  const tags = journal.entries.map((e) => e.tag);
  const index = tags.indexOf(RESHAPE_TAG);
  expect(index, `${RESHAPE_TAG} is not in the migration journal`).toBeGreaterThan(-1);
  for (const tag of tags.slice(0, index)) await applyMigration(tag);
}

const MOD_A = "aaaaaaaa-0000-4000-8000-000000000001";
const MOD_B = "aaaaaaaa-0000-4000-8000-000000000002";
const AT = "2026-06-01T12:00:00.000Z";
const sid = (n: number) => `51000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const aid = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** An animal row in the pre-0007 shape (string withdrawal reason), via raw SQL. */
async function insertLegacyAnimal(
  id: string,
  shelterId: string,
  cityId: string,
  listing: unknown,
  kind: string,
) {
  const declared = JSON.stringify({ source: "shelter_declared", state: "unknown", declaredAt: AT });
  await client`
    INSERT INTO animals (
      id, shelter_id, name, species, sex, size, age, age_anchor_at, description_uk,
      photos, vaccination, spay_neuter, document_readiness, listing, listing_kind,
      city_id, created_at, last_updated_at
    ) VALUES (
      ${id}, ${shelterId}, ${"Тест"}, ${"dog"}, ${"unknown"}, ${"medium"},
      ${JSON.stringify({ kind: "birth_date", date: AT, precision: "year" })}::text::jsonb,
      ${AT}::timestamptz, ${"Опис"}, ${"[]"}::text::jsonb, ${declared}::text::jsonb, ${declared}::text::jsonb,
      ${JSON.stringify({ kind: "unknown" })}::text::jsonb, ${JSON.stringify(listing)}::text::jsonb, ${kind},
      ${cityId}, ${AT}::timestamptz, ${AT}::timestamptz
    )`;
}

const EVIDENCE = { items: [], submittedAt: AT };

describe("0007 shelter-state reshape", () => {
  beforeEach(async () => {
    await resetToPreReshapeState();
  });

  it("turns every pausedBy into a moderator actor, including the one inside a suspended shelter's priorState", async () => {
    const city = makeCity();
    await cityRepo(db).insert(city);
    await insertLegacyShelter(client, {
      id: sid(1),
      cityId: city.id,
      verification: {
        status: "paused",
        verifiedAt: AT,
        verifiedBy: MOD_A,
        pausedAt: AT,
        pausedBy: MOD_A,
        reason: { code: "seasonal_closure", note: null },
        evidence: EVIDENCE,
      },
      status: "paused",
    });
    await insertLegacyShelter(client, {
      id: sid(2),
      cityId: city.id,
      verification: {
        status: "suspended",
        suspendedAt: AT,
        suspendedBy: MOD_A,
        reason: { code: "unresponsive", note: null },
        priorState: {
          status: "paused",
          verifiedAt: AT,
          verifiedBy: MOD_A,
          pausedAt: AT,
          pausedBy: MOD_B,
          reason: { code: "relocation", note: null },
        },
        evidence: EVIDENCE,
      },
      status: "suspended",
    });
    const verified = { status: "verified", verifiedAt: AT, verifiedBy: MOD_A, evidence: EVIDENCE };
    await insertLegacyShelter(client, { id: sid(3), cityId: city.id, verification: verified });

    await applyMigration(RESHAPE_TAG);

    const paused = await shelterRepo(db).findById(sid(1) as never);
    const suspended = await shelterRepo(db).findById(sid(2) as never);
    const untouched = await shelterRepo(db).findById(sid(3) as never);
    expect(paused?.verification).toMatchObject({
      status: "paused",
      pausedBy: { kind: "moderator", moderatorId: MOD_A },
    });
    // Each keeps its *own* moderator: MOD_B here, not the suspender's MOD_A.
    expect(suspended?.verification).toMatchObject({
      status: "suspended",
      priorState: { status: "paused", pausedBy: { kind: "moderator", moderatorId: MOD_B } },
    });
    expect(untouched?.verification).toMatchObject({ status: "verified", verifiedBy: MOD_A });
    // The new column exists and starts empty.
    expect(paused?.pendingDonation).toBeNull();
  });

  /** H2-13: each row keeps its own code; flattening to "other" would destroy real data. */
  it("wraps each withdrawal reason as { code, note: null }, keeping its own code", async () => {
    const city = makeCity();
    await cityRepo(db).insert(city);
    await insertLegacyShelter(client, {
      id: sid(1),
      cityId: city.id,
      verification: { status: "verified", verifiedAt: AT, verifiedBy: MOD_A, evidence: EVIDENCE },
      status: "verified",
    });
    const codes = [
      "adopted_elsewhere",
      "transferred",
      "deceased",
      "listing_error",
      "other",
    ] as const;
    for (const [i, code] of codes.entries()) {
      await insertLegacyAnimal(
        aid(i),
        sid(1),
        city.id,
        { kind: "withdrawn", withdrawnAt: AT, reason: code },
        "withdrawn",
      );
    }
    await insertLegacyAnimal(aid(10), sid(1), city.id, { kind: "draft" }, "draft");

    await applyMigration(RESHAPE_TAG);

    const rows = (await client`
      SELECT id, listing->'reason' AS reason, listing_kind FROM animals ORDER BY id`) as unknown as {
      id: string;
      reason: unknown;
      listing_kind: string;
    }[];
    expect(rows.filter((r) => r.listing_kind === "withdrawn").map((r) => r.reason)).toEqual(
      codes.map((code) => ({ code, note: null })),
    );
    expect(rows.find((r) => r.listing_kind === "draft")?.reason ?? null).toBeNull();
  });

  it("leaves a row already in the new shape exactly as it is", async () => {
    const city = makeCity();
    await cityRepo(db).insert(city);
    await insertLegacyShelter(client, {
      id: sid(1),
      cityId: city.id,
      verification: { status: "verified", verifiedAt: AT, verifiedBy: MOD_A, evidence: EVIDENCE },
      status: "verified",
    });
    const already = { code: "other", note: "Забрали родичі" };
    await insertLegacyAnimal(
      aid(1),
      sid(1),
      city.id,
      { kind: "withdrawn", withdrawnAt: AT, reason: already },
      "withdrawn",
    );

    await applyMigration(RESHAPE_TAG);

    const [row] = (await client`SELECT listing->'reason' AS reason FROM animals`) as unknown as {
      reason: unknown;
    }[];
    expect(row?.reason).toEqual(already);
  });

  /** NULL NOT IN (...) is NULL, so without COALESCE a code-less reason would pass the guard. */
  it("aborts on a withdrawal reason with no code key or a null code", async () => {
    const city = makeCity();
    await cityRepo(db).insert(city);
    await insertLegacyShelter(client, { id: sid(1), cityId: city.id });
    await insertLegacyAnimal(
      aid(1),
      sid(1),
      city.id,
      { kind: "withdrawn", withdrawnAt: AT, reason: { note: "x" } },
      "withdrawn",
    );
    await insertLegacyAnimal(
      aid(2),
      sid(1),
      city.id,
      { kind: "withdrawn", withdrawnAt: AT, reason: { code: null, note: null } },
      "withdrawn",
    );

    await expect(applyMigration(RESHAPE_TAG)).rejects.toThrow(
      /2 withdrawn rows with an unknown code/,
    );
  });

  it("aborts on a withdrawal code the domain doesn't know", async () => {
    const city = makeCity();
    await cityRepo(db).insert(city);
    await insertLegacyShelter(client, {
      id: sid(1),
      cityId: city.id,
      verification: { status: "verified", verifiedAt: AT, verifiedBy: MOD_A, evidence: EVIDENCE },
      status: "verified",
    });
    await insertLegacyAnimal(
      aid(1),
      sid(1),
      city.id,
      { kind: "withdrawn", withdrawnAt: AT, reason: "lost_interest" },
      "withdrawn",
    );

    await expect(applyMigration(RESHAPE_TAG)).rejects.toThrow(
      /1 withdrawn rows with an unknown code/,
    );
  });
});
