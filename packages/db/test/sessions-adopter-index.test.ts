import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adopterRepo } from "../src/repos/adopter-repo";
import * as schema from "../src/schema/index";
import { setupTestDatabase } from "../src/test-utils/index";
import { TEST_DATABASE_URL } from "../src/test-utils/setup";

/**
 * Migration 0019: `deleteOrphaned` reads sessions by adopter alone, in its NOT EXISTS and in each
 * delete's foreign-key check; without an index both were full scans (50 deletes, 51 scans).
 */

const captured: { query: string; parameters: readonly unknown[] }[] = [];
const client = postgres(TEST_DATABASE_URL, {
  max: 1,
  onnotice: () => {},
  debug: (_connection, query, parameters) => {
    captured.push({ query, parameters });
  },
});
const db = drizzle(client, { schema });

beforeAll(async () => {
  const setup = await setupTestDatabase();
  await setup.cleanup();
});
afterAll(async () => client.end());

async function planOf(query: string, parameters: readonly unknown[]): Promise<string> {
  return client.begin(async (tx) => {
    for (const off of ["seqscan", "bitmapscan", "hashjoin", "mergejoin"]) {
      await tx.unsafe(`SET LOCAL enable_${off} = off`);
    }
    const rows = await tx.unsafe(`EXPLAIN (COSTS OFF) ${query}`, [...parameters] as never[]);
    return Array.from(rows as Iterable<Record<string, unknown>>)
      .map((row) => row["QUERY PLAN"])
      .join("\n");
  });
}

describe("sessions_adopter_id_idx", () => {
  it("serves the foreign-key check each deleted adopter runs on sessions", async () => {
    // The statement ri_triggers.c builds for a NO ACTION key on delete of the referenced row.
    const plan = await planOf(
      `SELECT 1 FROM ONLY "public"."sessions" x WHERE $1::text OPERATOR(pg_catalog.=) "adopter_id" FOR KEY SHARE OF x`,
      ["an-adopter"],
    );
    expect(plan, plan).toMatch(/Index (Only )?Scan using sessions_adopter_id_idx on sessions x/);
    expect(plan, plan).toContain("Index Cond: (adopter_id = 'an-adopter'::text)");
  });

  // A full scan of a wrongly led index still prints `Index Cond` above, so the key is checked here.
  it("is keyed on adopter_id alone, so the per-request last-seen touch stays a HOT update", async () => {
    const [row] = await client<{ cols: string[] }[]>`
      SELECT array_agg(a.attname::text ORDER BY k.ord) AS cols
      FROM pg_index i
      JOIN pg_class c ON c.oid = i.indexrelid
      CROSS JOIN LATERAL unnest(i.indkey::int2[]) WITH ORDINALITY AS k(attnum, ord)
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
      WHERE c.relname = 'sessions_adopter_id_idx'`;
    expect(row?.cols).toEqual(["adopter_id"]);
  });

  it("serves deleteOrphaned's own NOT EXISTS on sessions", async () => {
    captured.length = 0;
    await adopterRepo(db).deleteOrphaned(new Date("2026-10-29T12:00:00.000Z"));
    const statement = captured.find((c) => c.query.includes('delete from "adopters"'));
    if (!statement) throw new Error("deleteOrphaned's statement was not captured");

    const plan = await planOf(statement.query, statement.parameters);
    expect(plan, plan).toMatch(/Index (Only )?Scan using sessions_adopter_id_idx on sessions/);
    expect(plan, plan).not.toMatch(/Seq Scan on sessions/);
  });
});
