import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { authPasswordWriteRepo } from "../src/repos/auth-password-write-repo";
import { authAccount, authSession, authUser } from "../src/schema/auth";
import {
  setupTestDatabase,
  statementName,
  steppedDatabase,
  truncateAll,
  writeCredentialPassword,
} from "../src/test-utils/index";

/**
 * PW1-F6's read (`authPasswordWriteRepo`) and the stepped database its interleaving tests and the
 * Neon smoke drive Better Auth through. That Better Auth itself moves both fields on every
 * password write is pinned against Better Auth in `apps/web/src/kabinet/password-flows.test.ts`.
 */

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());
beforeEach(async () => truncateAll(db));

const NOW = new Date("2026-10-20T10:00:00.000Z");
const at = (ms: number) => new Date(NOW.getTime() + ms);
const OLENA = "aaaaaaaa-0000-4000-8000-00000000000a";
const PETRO = "bbbbbbbb-0000-4000-8000-00000000000b";

async function user(id: string, email: string) {
  await db
    .insert(authUser)
    .values({ id, name: "Олена", email, emailVerified: true, createdAt: NOW, updatedAt: NOW });
}

async function account(
  id: string,
  userId: string,
  providerId: string,
  password: string | null,
  updatedAt = NOW,
) {
  await db
    .insert(authAccount)
    .values({ id, accountId: userId, providerId, userId, password, createdAt: NOW, updatedAt });
}

describe("authPasswordWriteRepo.writesByEmail", () => {
  it("nothing for an address nobody has, or a user with no credential", async () => {
    const repo = authPasswordWriteRepo(db);
    expect(await repo.writesByEmail("nobody@example.org")).toEqual([]);
    await user(OLENA, "olena@example.org");
    await account("acc-1", OLENA, "google", null);
    expect(await repo.writesByEmail("olena@example.org")).toEqual([]);
  });

  it("every credential of that user, by id, with its stamp and hash; another user's and other providers' left out", async () => {
    await user(OLENA, "olena@example.org");
    await user(PETRO, "petro@example.org");
    await account("acc-b", OLENA, "credential", "salt-b:key-b", at(2));
    await account("acc-a", OLENA, "credential", "salt-a:key-a", at(1));
    await account("acc-c", OLENA, "google", null);
    await account("acc-p", PETRO, "credential", "salt-p:key-p");
    expect(await authPasswordWriteRepo(db).writesByEmail("olena@example.org")).toEqual([
      { accountId: "acc-a", updatedAt: at(1), hash: "salt-a:key-a" },
      { accountId: "acc-b", updatedAt: at(2), hash: "salt-b:key-b" },
    ]);
  });

  it("the address trimmed and lower-cased, as every kabinet lookup by address", async () => {
    await user(OLENA, "olena@example.org");
    await account("acc-1", OLENA, "credential", "salt:key");
    const writes = await authPasswordWriteRepo(db).writesByEmail("  Olena@Example.ORG ");
    expect(writes.map((w) => w.accountId)).toEqual(["acc-1"]);
  });

  it("a password write shows in both fields: a new stamp and a new hash", async () => {
    await user(OLENA, "olena@example.org");
    await account("acc-1", OLENA, "credential", "salt:old");
    const repo = authPasswordWriteRepo(db);
    const [before] = await repo.writesByEmail("olena@example.org");
    await writeCredentialPassword(db, OLENA, "salt:new", at(60_000));
    const [after] = await repo.writesByEmail("olena@example.org");
    expect(before).toEqual({ accountId: "acc-1", updatedAt: NOW, hash: "salt:old" });
    expect(after).toEqual({ accountId: "acc-1", updatedAt: at(60_000), hash: "salt:new" });
  });
});

describe("steppedDatabase", () => {
  it("records each statement as it starts, with its tables, and changes nothing it runs", async () => {
    const stepped = steppedDatabase(db);
    await user(OLENA, "olena@example.org");
    await stepped.db.insert(authAccount).values({
      id: "acc-1",
      accountId: OLENA,
      providerId: "credential",
      userId: OLENA,
      password: "salt:key",
      createdAt: NOW,
      updatedAt: NOW,
    });
    const writes = await authPasswordWriteRepo(stepped.db).writesByEmail("olena@example.org");
    await stepped.db.delete(authSession);
    expect(writes.map((w) => w.accountId)).toEqual(["acc-1"]);
    expect(stepped.trace.map(statementName)).toEqual([
      "insert:auth_account",
      "select:auth_account+auth_user",
      "delete:auth_session",
    ]);
  });

  it("holds the first matching statement unsent until released, so another one runs in between", async () => {
    await user(OLENA, "olena@example.org");
    const stepped = steppedDatabase(db, {
      holdWhen: (statement) => statementName(statement) === "insert:auth_account",
    });
    const order: string[] = [];
    const held = stepped.db
      .insert(authAccount)
      .values({
        id: "acc-held",
        accountId: OLENA,
        providerId: "credential",
        userId: OLENA,
        password: "salt:held",
        createdAt: NOW,
        updatedAt: NOW,
      })
      .returning()
      .then((rows) => {
        order.push("held insert done");
        return rows;
      });
    const reached = await stepped.hold.reached;
    expect(statementName(reached)).toBe("insert:auth_account");
    // Unsent: the row isn't there, while a statement of someone else's runs and answers.
    expect(await db.select().from(authAccount)).toEqual([]);
    await account("acc-other", OLENA, "credential", "salt:other");
    order.push("other insert done");
    stepped.hold.release();
    expect((await held).map((row) => row.id)).toEqual(["acc-held"]);
    expect(order).toEqual(["other insert done", "held insert done"]);
    // Only the first match is held: the next one goes straight through.
    await stepped.db.insert(authAccount).values({
      id: "acc-after",
      accountId: OLENA,
      providerId: "credential",
      userId: OLENA,
      password: "salt:after",
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect((await db.select().from(authAccount)).length).toBe(3);
    // An insert keeps what it was given, for a row the code under test never hands back.
    expect(stepped.trace.map((statement) => (statement.values as { id?: string }).id)).toEqual([
      "acc-held",
      "acc-after",
    ]);
  });

  it("fails the statements it is told to, unsent, with the error it is given", async () => {
    await user(OLENA, "olena@example.org");
    const dropped = new Error("connection lost");
    const stepped = steppedDatabase(db, {
      failWhen: (statement) =>
        statementName(statement) === "insert:auth_account" ? dropped : undefined,
    });
    await expect(
      stepped.db.insert(authAccount).values({
        id: "acc-1",
        accountId: OLENA,
        providerId: "credential",
        userId: OLENA,
        password: "salt:key",
        createdAt: NOW,
        updatedAt: NOW,
      }),
    ).rejects.toBe(dropped);
    expect(await db.select().from(authAccount)).toEqual([]);
    // Anything else goes through.
    expect(await authPasswordWriteRepo(stepped.db).writesByEmail("olena@example.org")).toEqual([]);
  });
});
