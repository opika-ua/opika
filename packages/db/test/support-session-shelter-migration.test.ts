import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ShelterId } from "@opika/domain";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cityRepo } from "../src/repos/city-repo";
import { kabinetSupportRepo } from "../src/repos/kabinet-support-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import { authUser, supportSessions } from "../src/schema/auth";
import { shelters } from "../src/schema/shelters";
import { makeCity, makeShelter, setupTestDatabase, truncateAll } from "../src/test-utils/index";

/**
 * 0029 (owner, 2026-11-18, Q4 (B)): a support session outlives its shelter. The row stays (RS-Q0),
 * its shelter link nulled by `ON DELETE SET NULL`; a view still open on it resolves to nothing.
 */

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;
beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());

const NOW = new Date("2026-11-20T10:00:00.000Z");
const OPERATOR = "0ec0ec0e-0000-4000-8000-000000000001";
let shelterId: ShelterId;

beforeEach(async () => {
  await truncateAll(db);
  const city = makeCity();
  await cityRepo(db).insert(city);
  const shelter = makeShelter({
    publicLocation: { ...makeShelter().publicLocation, cityId: city.id } as never,
  });
  await shelterRepo(db).insert(shelter);
  shelterId = shelter.id;
  await db.insert(authUser).values({
    id: OPERATOR,
    name: "Оператор",
    email: "op@example.org",
    emailVerified: true,
    createdAt: NOW,
    updatedAt: NOW,
  });
});

const TOKEN = "token-hash";
const enter = () =>
  kabinetSupportRepo(db).enter({
    id: randomUUID(),
    operatorUserId: OPERATOR,
    shelterId,
    tokenHash: TOKEN,
    now: NOW,
  });

describe("0029: support_sessions.shelter_id is ON DELETE SET NULL", () => {
  it("the migration changes exactly that foreign key, and makes the column nullable", () => {
    const migration = readFileSync(
      fileURLToPath(
        new URL("../drizzle/0029_support_session_shelter_set_null.sql", import.meta.url),
      ),
      "utf8",
    );
    expect(migration).toContain('ALTER COLUMN "shelter_id" DROP NOT NULL');
    expect(migration).toContain("ON DELETE set null");
    expect(migration.match(/ALTER TABLE/g)).toHaveLength(3);
  });

  it("a shelter's deletion keeps its support session, the link nulled", async () => {
    await enter();
    await db.delete(shelters).where(eq(shelters.id, shelterId));
    const rows = await db.select().from(supportSessions);
    expect(rows).toEqual([
      expect.objectContaining({ operatorUserId: OPERATOR, shelterId: null, tokenHash: TOKEN }),
    ]);
  });

  it("an open view of a shelter that is gone resolves to nothing", async () => {
    await enter();
    await db.delete(shelters).where(eq(shelters.id, shelterId));
    expect(
      await kabinetSupportRepo(db).touch({ tokenHash: TOKEN, operatorUserId: OPERATOR, now: NOW }),
    ).toBeNull();
  });

  it("still refuses a shelter id that names no shelter", async () => {
    await expect(
      db.execute(
        sql`INSERT INTO support_sessions (id, operator_user_id, shelter_id, token_hash, started_at, last_seen_at) VALUES (${randomUUID()}, ${OPERATOR}, ${randomUUID()}, 'x', now(), now())`,
      ),
    ).rejects.toThrow();
  });
});
