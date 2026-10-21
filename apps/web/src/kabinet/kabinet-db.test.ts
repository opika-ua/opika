import { inspect } from "node:util";
import type { Database } from "@opika/db";
import { failingDriverDatabase, postgresError, setupTestDatabase } from "@opika/db/test";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { CleanedQueryError } from "./clean-query-errors";
import { kabinetDb } from "./kabinet-db";

/**
 * F8-F1 (the review of 78c888f, note 1): `kabinetDb()` is the cleaned handle. `api/db`'s `getDb`
 * is pointed at a database whose driver refuses every statement with an error that names a
 * value, so the served code path, `kabinetDb()` itself, is what's under test.
 */
const SECRET = "olena@example.org";
let served: Database | undefined;
vi.mock("../api/db", () => ({
  getDb: () => {
    if (served === undefined) throw new Error("the test database is not set up");
    return served;
  },
}));

let cleanup: () => Promise<void>;
beforeAll(async () => {
  const setup = await setupTestDatabase();
  cleanup = setup.cleanup;
  served = failingDriverDatabase(setup.db, () =>
    postgresError({ message: `bad value "${SECRET}"`, code: "XX000", detail: SECRET }),
  );
});
afterAll(async () => cleanup?.());

describe("kabinetDb()", () => {
  it("a failing read rejects with a CleanedQueryError: no message, query or params", async () => {
    let thrown: unknown;
    try {
      // The value rides as a parameter, as an address or a token would.
      await kabinetDb().query.authUser.findFirst({
        where: (user, { eq }) => eq(user.email, SECRET),
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(CleanedQueryError);
    const error = thrown as CleanedQueryError;
    expect([error.message, error.code]).toEqual(["", "XX000"]);
    for (const dropped of ["query", "params", "detail"]) {
      expect([dropped, Object.hasOwn(error, dropped)]).toEqual([dropped, false]);
    }
    const shown = inspect(error, { depth: 8, showHidden: true });
    expect([shown.includes(SECRET), /params:|Failed query/i.test(shown)]).toEqual([false, false]);
  });

  it("is one handle per process", () => {
    expect(kabinetDb()).toBe(kabinetDb());
  });
});
