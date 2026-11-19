import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applicationsRepo } from "../src/repos/applications-repo";
import { cityRepo } from "../src/repos/city-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import {
  makeCity,
  makeShelter as makeShelterAnywhere,
  setupTestDatabase,
  truncateAll,
} from "../src/test-utils/index";

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());
let cityId: string;
beforeEach(async () => {
  await truncateAll(db);
  const city = makeCity();
  await cityRepo(db).insert(city);
  cityId = city.id;
});

const NOW = new Date("2026-11-20T10:00:00.000Z");
const makeShelter = (overrides: Parameters<typeof makeShelterAnywhere>[0] = {}) =>
  makeShelterAnywhere({
    publicLocation: { ...makeShelterAnywhere().publicLocation, cityId } as never,
    ...overrides,
  });
const application = () =>
  makeShelter({
    verification: {
      status: "application",
      appliedAt: NOW,
      evidence: { items: [], submittedAt: NOW },
    },
    contact: null,
  });

/** The constraint a refused statement names, wherever the driver wraps it. */
async function refusal(statement: Promise<unknown>): Promise<string> {
  try {
    await statement;
  } catch (error) {
    let e: unknown = error;
    for (let depth = 0; depth < 5 && e !== null && typeof e === "object"; depth += 1) {
      const pg = e as { constraint_name?: unknown; constraint?: unknown; cause?: unknown };
      const named = pg.constraint_name ?? pg.constraint;
      if (typeof named === "string") return named;
      e = pg.cause;
    }
    throw error;
  }
  throw new Error("the statement was accepted");
}

describe("0030: only a self-registered shelter may have no contact", () => {
  it("a self-registered application with no contact is stored, and reads back with none", async () => {
    const shelter = application();
    await shelterRepo(db).insert(shelter);
    expect((await shelterRepo(db).findById(shelter.id))?.contact).toBeNull();
    const [row] = await applicationsRepo(db).pending();
    expect(row?.contact).toBeNull();
  });

  it("an operator-created shelter with no contact is refused by shelters_contact_check", async () => {
    expect(await refusal(shelterRepo(db).insert(makeShelter({ contact: null })))).toBe(
      "shelters_contact_check",
    );
  });
});
