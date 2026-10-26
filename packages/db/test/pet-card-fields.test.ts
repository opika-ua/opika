import { randomUUID } from "node:crypto";
import {
  type AnimalColour,
  type CityId,
  EVERYONE_SCOPE,
  type ListedAnimal,
  type LocalizedText,
  NO_FILTERS,
  type ShelterAdminId,
  type Temperament,
} from "@opika/domain";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { animalRepo } from "../src/repos/animal-repo";
import { cityRepo } from "../src/repos/city-repo";
import { galleryRepo } from "../src/repos/gallery-repo";
import { isCheckViolation, kabinetAnimalRepo } from "../src/repos/kabinet-animal-repo";
import { animalToRowWithCity } from "../src/repos/mappers";
import { shelterRepo } from "../src/repos/shelter-repo";
import { animals } from "../src/schema/animals";
import {
  makeAnimal,
  makeCity,
  makeDraftAnimal,
  makeShelter,
  setupTestDatabase,
  truncateAll,
} from "../src/test-utils/index";

/**
 * The pet card's temperament, coat colour and medical note at the database
 * (migration 0017): the columns as they were added, the round trip through
 * the repositories (the presets in order, a custom entry last, both
 * languages), and the four CHECKs refusing what the domain refuses.
 *
 * Local Postgres through postgres-js. `temperament_traits` is the schema's
 * first array column and production reads it through neon-http, so the same
 * write and read-back is `neon-smoke.ts` step 43, owed on a real Neon branch
 * before this is called verified.
 */

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());
beforeEach(async () => truncateAll(db));

const NOW = new Date("2026-10-26T12:00:00.000Z");

async function place(): Promise<{ shelterId: ListedAnimal["shelterId"]; cityId: CityId }> {
  const city = makeCity();
  await cityRepo(db).insert(city);
  const shelter = makeShelter({
    publicLocation: { ...makeShelter().publicLocation, cityId: city.id },
  });
  await shelterRepo(db).insert(shelter);
  return { shelterId: shelter.id, cityId: city.id };
}

/** The first error a promise rejects with, or null when it resolves. */
async function failureOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    return null;
  } catch (error) {
    return error;
  }
}

/** The constraint Postgres names on a violation, wherever the driver nests it. */
function violatedConstraint(error: unknown): string | null {
  for (
    let e: unknown = error;
    e !== null && typeof e === "object";
    e = (e as { cause?: unknown }).cause
  ) {
    const name =
      (e as { constraint_name?: unknown; constraint?: unknown }).constraint_name ??
      (e as { constraint?: unknown }).constraint;
    if (typeof name === "string") return name;
  }
  return null;
}

const english = (uk: string, en: string): LocalizedText => ({
  uk,
  en: { text: en, provenance: "human" },
});

const TEMPERAMENT: Temperament = [
  { kind: "preset", trait: "shy" },
  { kind: "preset", trait: "good_with_cats" },
  { kind: "preset", trait: "calm" },
  { kind: "custom", text: english("Боїться грози", "Afraid of thunderstorms") },
];
const CUSTOM_COLOUR: AnimalColour = { kind: "custom", text: english("Димчасте", "Smoky") };
const MEDICAL_NOTES = english("Потребує гіпоалергенного корму.", "Needs hypoallergenic food.");

describe("migration 0017's columns", () => {
  it("adds temperament_traits as a NOT NULL text[] defaulting to empty, and ten nullable texts", async () => {
    const rows = await db.execute<{
      column_name: string;
      is_nullable: string;
      column_default: string | null;
      data_type: string;
    }>(
      sql`SELECT column_name, is_nullable, column_default, data_type FROM information_schema.columns
          WHERE table_name = 'animals' AND (column_name LIKE 'temperament%'
            OR column_name LIKE 'coat_colour%' OR column_name LIKE 'medical_notes%')
          ORDER BY column_name`,
    );
    const nullableText = (column_name: string) => ({
      column_name,
      is_nullable: "YES",
      column_default: null,
      data_type: "text",
    });
    expect(Array.from(rows)).toEqual([
      nullableText("coat_colour"),
      nullableText("coat_colour_custom_en_provenance"),
      nullableText("coat_colour_custom_en_text"),
      nullableText("coat_colour_custom_uk"),
      nullableText("medical_notes_en_provenance"),
      nullableText("medical_notes_en_text"),
      nullableText("medical_notes_uk"),
      nullableText("temperament_custom_en_provenance"),
      nullableText("temperament_custom_en_text"),
      nullableText("temperament_custom_uk"),
      {
        column_name: "temperament_traits",
        is_nullable: "NO",
        column_default: "'{}'::text[]",
        data_type: "ARRAY",
      },
    ]);
  });

  it("indexes temperament (GIN) and colour (btree), both partial on the discoverable kinds", async () => {
    const rows = await db.execute<{ indexname: string; indexdef: string }>(
      sql`SELECT indexname, indexdef FROM pg_indexes
          WHERE tablename = 'animals'
            AND indexname IN ('animals_temperament_traits_idx', 'animals_coat_colour_idx')
          ORDER BY indexname`,
    );
    expect(Array.from(rows)).toEqual([
      {
        indexname: "animals_coat_colour_idx",
        indexdef: expect.stringMatching(
          /USING btree \(coat_colour\) WHERE \(listing_kind = ANY \(ARRAY\['published'::text, 'reserved'::text\]\)\)$/,
        ),
      },
      {
        indexname: "animals_temperament_traits_idx",
        indexdef: expect.stringMatching(
          /USING gin \(temperament_traits\) WHERE \(listing_kind = ANY \(ARRAY\['published'::text, 'reserved'::text\]\)\)$/,
        ),
      },
    ]);
  });

  it("gives a row written without the new columns an empty temperament and nothing else", async () => {
    const { shelterId, cityId } = await place();
    const animal = makeAnimal({ shelterId });
    const {
      temperamentTraits: _traits,
      temperamentCustomUk: _tUk,
      temperamentCustomEnText: _tEn,
      temperamentCustomEnProvenance: _tEnP,
      coatColour: _colour,
      coatColourCustomUk: _cUk,
      coatColourCustomEnText: _cEn,
      coatColourCustomEnProvenance: _cEnP,
      medicalNotesUk: _mUk,
      medicalNotesEnText: _mEn,
      medicalNotesEnProvenance: _mEnP,
      ...beforeMigration
    } = animalToRowWithCity(animal, cityId);
    await db.insert(animals).values(beforeMigration);
    const read = await animalRepo(db).findById(animal.id);
    expect(read?.temperament).toEqual([]);
    expect(read?.colour).toBeNull();
    expect(read?.medicalNotes).toBeNull();
  });
});

describe("the round trip through the repositories", () => {
  it("reads back exactly what was stored: presets in order, the custom entry last, both languages", async () => {
    const { shelterId, cityId } = await place();
    const animal = makeAnimal({
      shelterId,
      temperament: TEMPERAMENT,
      colour: CUSTOM_COLOUR,
      medicalNotes: MEDICAL_NOTES,
    });
    await animalRepo(db).insert(animal, cityId);

    const [row] = await db.select().from(animals).where(eq(animals.id, animal.id));
    expect(row?.temperamentTraits).toEqual(["shy", "good_with_cats", "calm"]);
    expect(row?.temperamentCustomUk).toBe("Боїться грози");
    expect(row?.coatColour).toBeNull();
    expect(row?.coatColourCustomUk).toBe("Димчасте");

    expect(await animalRepo(db).findById(animal.id)).toEqual(animal);
  });

  it("reads a preset colour, a temperament of presets only, and no medical note", async () => {
    const { shelterId, cityId } = await place();
    const animal = makeAnimal({
      shelterId,
      temperament: [
        { kind: "preset", trait: "good_with_dogs" },
        { kind: "preset", trait: "playful" },
      ],
      colour: { kind: "preset", colour: "black_white" },
      medicalNotes: null,
    });
    await animalRepo(db).insert(animal, cityId);
    expect(await animalRepo(db).findById(animal.id)).toEqual(animal);
  });

  it("reads a custom temperament with no presets, and every field unrecorded on a draft", async () => {
    const { shelterId, cityId } = await place();
    const onlyCustom = makeAnimal({
      shelterId,
      temperament: [{ kind: "custom", text: { uk: "Сам обирає людину", en: null } }],
    });
    const draft = makeDraftAnimal({ shelterId });
    await animalRepo(db).insertMany([
      { animal: onlyCustom, cityId },
      { animal: draft, cityId },
    ]);
    expect(await animalRepo(db).findById(onlyCustom.id)).toEqual(onlyCustom);
    const readDraft = await animalRepo(db).findById(draft.id);
    expect(readDraft).toEqual(draft);
    expect(readDraft?.temperament).toEqual([]);
  });

  it("the gallery's explicit column list carries all three", async () => {
    const { shelterId, cityId } = await place();
    const animal = makeAnimal({
      shelterId,
      temperament: TEMPERAMENT,
      colour: { kind: "preset", colour: "ginger" },
      medicalNotes: MEDICAL_NOTES,
    });
    await animalRepo(db).insert(animal, cityId);
    const page = await galleryRepo(db).list({
      filters: NO_FILTERS,
      scope: EVERYONE_SCOPE,
      sort: "freshest",
      page: 1,
      pageSize: 24,
      now: NOW,
    });
    const listed = page.items.find((item) => item.id === animal.id);
    expect(listed?.temperament).toEqual(TEMPERAMENT);
    expect(listed?.colour).toEqual({ kind: "preset", colour: "ginger" });
    expect(listed?.medicalNotes).toEqual(MEDICAL_NOTES);
  });
});

describe("writeEditIf and the pet card fields", () => {
  const editedLine = (animalId: string) => ({
    id: randomUUID(),
    entry: {
      kind: "animal_edited" as const,
      at: NOW,
      actor: {
        kind: "shelter_admin" as const,
        shelterAdminId: "33333333-3333-4333-8333-333333333333" as ShelterAdminId,
      },
      animalId: animalId as never,
      animalName: "Ластівка",
      fields: ["temperament" as const, "colour" as const, "medicalNotes" as const],
    },
  });

  it("records all three on a published animal, then clears them, with no draft condition", async () => {
    const { shelterId, cityId } = await place();
    const listed = makeAnimal({ shelterId });
    await animalRepo(db).insert(listed, cityId);
    const repo = kabinetAnimalRepo(db);

    const recorded = {
      ...listed,
      temperament: TEMPERAMENT,
      colour: CUSTOM_COLOUR,
      medicalNotes: MEDICAL_NOTES,
    };
    expect(await repo.writeEditIf(recorded, cityId, 0, editedLine(listed.id))).toEqual({
      kind: "ok",
    });
    expect(await animalRepo(db).findById(listed.id)).toMatchObject({
      temperament: TEMPERAMENT,
      colour: CUSTOM_COLOUR,
      medicalNotes: MEDICAL_NOTES,
    });

    // A custom colour replaced by a preset clears the custom columns in the
    // same write: the one-kind CHECK would refuse the row otherwise.
    const cleared = {
      ...recorded,
      temperament: [],
      colour: { kind: "preset" as const, colour: "tabby" as const },
      medicalNotes: null,
      version: 1,
    };
    expect(await repo.writeEditIf(cleared, cityId, 1, editedLine(listed.id))).toEqual({
      kind: "ok",
    });
    const after = await animalRepo(db).findById(listed.id);
    expect(after).toMatchObject({
      temperament: [],
      colour: { kind: "preset", colour: "tabby" },
      medicalNotes: null,
    });
    expect(after?.listing.kind).toBe("published");
  });
});

/**
 * The database refuses the rows the domain refuses, whatever wrote them:
 * each CHECK is crossed on its own, and named in the refusal.
 */
describe("migration 0017's CHECKs (23514)", () => {
  const rowOf = async () => {
    const { shelterId, cityId } = await place();
    return animalToRowWithCity(makeAnimal({ shelterId }), cityId);
  };

  it("a preset colour and a custom one on the same row", async () => {
    const row = {
      ...(await rowOf()),
      coatColour: "black" as const,
      coatColourCustomUk: "Димчасте",
    };
    const error = await failureOf(db.insert(animals).values(row));
    expect(isCheckViolation(error)).toBe(true);
    expect(violatedConstraint(error)).toBe("animals_coat_colour_one_kind_check");
  });

  it("each of the preset and the custom colour alone goes in", async () => {
    const preset = { ...(await rowOf()), coatColour: "black" as const };
    const custom = { ...(await rowOf()), coatColourCustomUk: "Димчасте" };
    expect(await failureOf(db.insert(animals).values(preset))).toBeNull();
    expect(await failureOf(db.insert(animals).values(custom))).toBeNull();
  });

  it.each([
    [
      "temperamentCustomEnText",
      "temperamentCustomEnProvenance",
      "animals_temperament_custom_en_check",
    ],
    [
      "coatColourCustomEnText",
      "coatColourCustomEnProvenance",
      "animals_coat_colour_custom_en_check",
    ],
    ["medicalNotesEnText", "medicalNotesEnProvenance", "animals_medical_notes_en_check"],
  ] as const)("an English %s with no Ukrainian", async (text, provenance, constraint) => {
    const row = { ...(await rowOf()), [text]: "Calm", [provenance]: "human" as const };
    const error = await failureOf(db.insert(animals).values(row));
    expect(isCheckViolation(error)).toBe(true);
    expect(violatedConstraint(error)).toBe(constraint);
  });

  it("a later write can't put the two colours together either", async () => {
    const row = { ...(await rowOf()), coatColour: "white" as const };
    await db.insert(animals).values(row);
    const error = await failureOf(
      db.update(animals).set({ coatColourCustomUk: "Сніжне" }).where(eq(animals.id, row.id)),
    );
    expect(violatedConstraint(error)).toBe("animals_coat_colour_one_kind_check");
  });
});
