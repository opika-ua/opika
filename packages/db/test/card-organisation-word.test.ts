import { randomUUID } from "node:crypto";
import {
  type CityId,
  EVERYONE_SCOPE,
  type ModeratorId,
  NO_FILTERS,
  type Shelter,
} from "@opika/domain";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { animalRepo } from "../src/repos/animal-repo";
import { cardShelterColumns } from "../src/repos/card-places";
import { cityRepo } from "../src/repos/city-repo";
import { galleryRepo } from "../src/repos/gallery-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import { shelters } from "../src/schema/shelters";
import { makeAnimal, makeCity, makeShelter, setupTestDatabase } from "../src/test-utils/index";

/**
 * The card's shelter columns carry `legal_entity->>'kind'` mapped to the public word (owner,
 * 2026-11-24): an unregistered initiative is «ініціатива», a registered form and a form not
 * chosen yet (D1) stay «притулок». Fictional names only.
 */
let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

const NOW = new Date("2026-11-24T12:00:00.000Z");
const AT = new Date("2026-08-05T00:00:00.000Z");
const MOD = randomUUID() as ModeratorId;
const VERIFIED = {
  status: "verified",
  verifiedAt: AT,
  verifiedBy: MOD,
  evidence: { items: [], submittedAt: AT },
} as const;

const ids = { initiative: "", ngo: "", noForm: "" };

async function seed(shelter: Shelter, cityId: CityId, name: string): Promise<string> {
  await shelterRepo(db).insert(shelter);
  const animal = makeAnimal({ shelterId: shelter.id, name });
  await animalRepo(db).insert(animal, cityId);
  return animal.id;
}

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
  const city = makeCity();
  await cityRepo(db).insert(city);
  const at = (shelter: Shelter): Shelter => ({
    ...shelter,
    publicLocation: { ...shelter.publicLocation, cityId: city.id },
  });
  ids.initiative = await seed(
    at(
      makeShelter({
        displayName: "Хвости в пошуку",
        legalEntity: { kind: "unregistered_initiative", contactPersonName: "Вигадана Особа" },
        verification: VERIFIED,
      }),
    ),
    city.id,
    "Ініціативна",
  );
  ids.ngo = await seed(at(makeShelter({ verification: VERIFIED })), city.id, "Притулкова");
  // A form is required from verification on (a CHECK), so the null form is a pending shelter's.
  ids.noForm = await seed(
    at({
      ...makeShelter({
        verification: { status: "pending", submittedAt: AT, evidence: VERIFIED.evidence },
      }),
      legalEntity: null,
    }),
    city.id,
    "Безформна",
  );
}, 120_000);
afterAll(async () => cleanup?.());

const EXPECTED = [
  ["initiative", "initiative"],
  ["ngo", "shelter"],
  ["noForm", "shelter"],
] as const;

describe("the card query's organisation word", () => {
  it.each(EXPECTED)("findWithShelterById: %s is a %s", async (key, word) => {
    const row = await animalRepo(db).findWithShelterById(ids[key] as never, NOW);
    expect(row?.shelter?.organisationWord).toBe(word);
  });

  it("findCardsByIds names each shelter's word", async () => {
    const rows = await animalRepo(db).findCardsByIds(
      EXPECTED.map(([key]) => ids[key] as never),
      NOW,
    );
    const byAnimal = new Map(
      rows.map((row) => [row.animal.id as string, row.shelter?.organisationWord]),
    );
    for (const [key, word] of EXPECTED) expect(byAnimal.get(ids[key])).toBe(word);
  });

  // `->'kind'` would pass the rows above too: both drivers parse a jsonb string, but SQL that
  // compares the column, or a driver that doesn't parse, would see it JSON-quoted.
  it("reads the form as text, not jsonb", async () => {
    const rows = await db
      .select({ type: sql<string>`pg_typeof(${cardShelterColumns.legalEntityKind})::text` })
      .from(shelters)
      .limit(1);
    expect(rows.map((row) => row.type)).toEqual(["text"]);
  });

  it("listCards names each listed shelter's word, and no other legal field", async () => {
    const page = await galleryRepo(db).listCards({
      filters: NO_FILTERS,
      scope: EVERYONE_SCOPE,
      sort: "freshest",
      page: 1,
      pageSize: 24,
      now: NOW,
    });
    const byAnimal = new Map(page.items.map((item) => [item.animal.id as string, item.shelter]));
    expect(byAnimal.get(ids.initiative)?.organisationWord).toBe("initiative");
    expect(byAnimal.get(ids.ngo)?.organisationWord).toBe("shelter");
    expect(JSON.stringify(page.items)).not.toContain("Вигадана Особа");
    expect(JSON.stringify(page.items)).not.toContain("unregistered_initiative");
  });
});
