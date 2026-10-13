import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTestDatabase } from "../src/test-utils/index";
import { TEST_DATABASE_URL } from "../src/test-utils/setup";

/**
 * HS-Q6 (Oleksii): pin `shelter_history`'s columns exactly — "no adopter,
 * reveal or swipe data ever". Read from the migrated database's own catalog,
 * not from the Drizzle schema object, so a hand-edited migration that adds a
 * column the schema file doesn't declare is caught too.
 *
 * The entry JSON's own shape is pinned separately, over the domain union
 * (`packages/domain/src/shelters/history-no-engagement.test.ts`).
 */

let cleanup: () => Promise<void>;
const client = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => {} });

beforeAll(async () => {
  cleanup = (await setupTestDatabase()).cleanup;
});

afterAll(async () => {
  await client.end();
  await cleanup?.();
});

const columnsOf = async (table: string) =>
  (
    await client<{ column_name: string; data_type: string; is_nullable: string }[]>`
      SELECT column_name, data_type, is_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${table}
      ORDER BY column_name`
  ).map((c) => `${c.column_name} ${c.data_type} ${c.is_nullable === "NO" ? "not null" : "null"}`);

describe("shelter_history", () => {
  it("has exactly its five columns, all required", async () => {
    expect(await columnsOf("shelter_history")).toEqual([
      "at timestamp with time zone not null",
      "entry jsonb not null",
      "id text not null",
      "kind text not null",
      "shelter_id text not null",
    ]);
  });

  it("references no adopter, reveal or swipe table", async () => {
    const targets = await client<{ target: string }[]>`
      SELECT ccu.table_name AS target
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name
      WHERE tc.table_name = 'shelter_history' AND tc.constraint_type = 'FOREIGN KEY'`;
    expect(targets.map((t) => t.target)).toEqual(["shelters"]);
  });
});

describe("super_admins", () => {
  /** Kept this narrow on purpose: a grant is a fact about a user and a time span, nothing else. */
  it("has exactly an id, a user, and when the grant started and ended", async () => {
    expect(await columnsOf("super_admins")).toEqual([
      "granted_at timestamp with time zone not null",
      "id text not null",
      "revoked_at timestamp with time zone null",
      "user_id text not null",
    ]);
  });

  /** HS-T2: at most one active grant per user; a re-grant after a revoke is a new row. */
  it("refuses a second active grant, and allows a re-grant once revoked", async () => {
    const at = new Date("2026-10-13T00:00:00.000Z");
    await client`INSERT INTO auth_user (id, name, email, email_verified, created_at, updated_at)
      VALUES ('su', 'S', 's@example.org', true, ${at}, ${at})`;
    await client`INSERT INTO super_admins (id, user_id, granted_at) VALUES ('g1', 'su', ${at})`;
    await expect(
      client`INSERT INTO super_admins (id, user_id, granted_at) VALUES ('g2', 'su', ${at})`,
    ).rejects.toThrow(/super_admins_active_user_unique/);
    await client`UPDATE super_admins SET revoked_at = ${at} WHERE id = 'g1'`;
    await client`INSERT INTO super_admins (id, user_id, granted_at) VALUES ('g3', 'su', ${at})`;
    const rows = await client`SELECT id FROM super_admins WHERE user_id = 'su' ORDER BY id`;
    expect(rows.map((r) => r.id)).toEqual(["g1", "g3"]);
  });

  /** HS-T2: "never deletes". A user with grant history can't be deleted out from under it. */
  it("keeps a grant's user: deleting the user is refused", async () => {
    await expect(client`DELETE FROM auth_user WHERE id = 'su'`).rejects.toThrow(
      /super_admins_user_id_auth_user_id_fk/,
    );
  });
});

describe("auth_member", () => {
  /** One shelter per admin (proposal §2): the database refuses a second membership. */
  it("refuses a second membership for the same user", async () => {
    const at = new Date("2026-10-13T00:00:00.000Z");
    await client`INSERT INTO auth_user (id, name, email, email_verified, created_at, updated_at)
      VALUES ('u1', 'A', 'a@example.org', true, ${at}, ${at})`;
    for (const org of ["o1", "o2"]) {
      await client`INSERT INTO auth_organization (id, name, slug, created_at)
        VALUES (${org}, ${org}, ${org}, ${at})`;
    }
    await client`INSERT INTO auth_member (id, organization_id, user_id, role, created_at)
      VALUES ('m1', 'o1', 'u1', 'owner', ${at})`;
    await expect(
      client`INSERT INTO auth_member (id, organization_id, user_id, role, created_at)
        VALUES ('m2', 'o2', 'u1', 'owner', ${at})`,
    ).rejects.toThrow(/auth_member_user_id_unique/);
  });
});
