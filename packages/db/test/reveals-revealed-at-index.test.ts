import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { revealRepo } from "../src/repos/reveal-repo";
import * as schema from "../src/schema/index";
import { setupTestDatabase } from "../src/test-utils/index";
import { TEST_DATABASE_URL } from "../src/test-utils/setup";

/**
 * Migration 0031: the 90-day clean-up selects reveals by `revealed_at` alone; the one index with
 * that column leads on `adopter_id`, so without this one the batch was a full scan.
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

describe("reveals_revealed_at_idx", () => {
  it("serves deleteExpired's revealed_at range", async () => {
    captured.length = 0;
    await revealRepo(db).deleteExpired(new Date("2026-11-20T03:00:00.000Z"));
    const statement = captured.find((c) => c.query.includes('delete from "reveals"'));
    if (!statement) throw new Error("deleteExpired's statement was not captured");

    const plan = await planOf(statement.query, statement.parameters);
    expect(plan, plan).toMatch(/Index (Only )?Scan using reveals_revealed_at_idx on reveals/);
    expect(plan, plan).toMatch(/Index Cond: \(revealed_at < /);
  });

  it("is keyed on revealed_at alone", async () => {
    const [row] = await client<{ cols: string[] }[]>`
      SELECT array_agg(a.attname::text ORDER BY k.ord) AS cols
      FROM pg_index i
      JOIN pg_class c ON c.oid = i.indexrelid
      CROSS JOIN LATERAL unnest(i.indkey::int2[]) WITH ORDINALITY AS k(attnum, ord)
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
      WHERE c.relname = 'reveals_revealed_at_idx'`;
    expect(row?.cols).toEqual(["revealed_at"]);
  });
});
