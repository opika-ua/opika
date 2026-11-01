/**
 * The public animal page's document size, for the heaviest realistic animal: ten photos, every long
 * field at its cap, registry and shelter-declared medical rows. The fixture is written here, in the
 * disposable harness database, and withdrawn afterwards so no gallery spec sees it.
 */

import { randomUUID } from "node:crypto";
import { createDatabase } from "@opika/db";
import { animalRepo, shelterRepo } from "@opika/db/repos";
import { shelters } from "@opika/db/schema";
import { assertDisposableTestDatabase, makeAnimal, testDatabaseUrl } from "@opika/db/test";
import {
  ANIMAL_DESCRIPTION_MAX_CHARACTERS,
  type AnimalId,
  COAT_COLOUR_CUSTOM_MAX_CHARACTERS,
  MAX_ANIMAL_PHOTOS,
  MEDICAL_NOTES_MAX_CHARACTERS,
  type ShelterId,
  TEMPERAMENT_CUSTOM_MAX_CHARACTERS,
} from "@opika/domain";
import { expect, test } from "@playwright/test";
import { useClientAddressPerRepetition } from "./harness";

const HARNESS_DATABASE_URL = assertDisposableTestDatabase(testDatabaseUrl("harness"));

/**
 * Measured 70,853 bytes (raw HTML, production build, 2026-10-31) for the animal below; the budget
 * is that plus 15%, rounded up to the next 1,000. Ordinary seeded animals are about 51-54 KB.
 */
export const ANIMAL_PAGE_HTML_BUDGET_BYTES = 82_000;

const SENTENCE = "Лагідний, грайливий песик, який дуже любить прогулянки та людей. ";
const textOf = (characters: number): string =>
  SENTENCE.repeat(Math.ceil(characters / SENTENCE.length)).slice(0, characters);

test.beforeEach(async ({ page }, testInfo) => {
  await useClientAddressPerRepetition(page, testInfo);
});

test("the heaviest realistic animal page stays within its HTML budget", async ({ page }) => {
  test.setTimeout(120_000);
  const db = createDatabase(HARNESS_DATABASE_URL);
  const [row] = await db.select({ id: shelters.id }).from(shelters).limit(1);
  if (row === undefined) throw new Error("no seeded shelter");
  const shelter = await shelterRepo(db).findById(row.id as ShelterId);
  if (shelter === null) throw new Error("the shelter isn't stored");

  const now = new Date();
  const animal = makeAnimal({
    id: randomUUID() as AnimalId,
    shelterId: shelter.id,
    name: "Максимільян-Бровко Довгошерстий",
    photos: Array.from({ length: MAX_ANIMAL_PHOTOS }, (_, index) => ({
      storageKey: `seed-photos/dog-${(index % 3) + 1}.jpg`,
      width: 1200,
      height: 1500,
      alt: null,
    })),
    description: {
      uk: textOf(ANIMAL_DESCRIPTION_MAX_CHARACTERS),
      en: { text: textOf(ANIMAL_DESCRIPTION_MAX_CHARACTERS), provenance: "machine" },
    },
    medicalNotes: { uk: textOf(MEDICAL_NOTES_MAX_CHARACTERS), en: null },
    temperament: [
      { kind: "preset", trait: "playful" },
      { kind: "custom", text: { uk: textOf(TEMPERAMENT_CUSTOM_MAX_CHARACTERS), en: null } },
    ],
    colour: { kind: "custom", text: { uk: textOf(COAT_COLOUR_CUSTOM_MAX_CHARACTERS), en: null } },
    coatLength: "long",
    vaccination: {
      source: "registry",
      state: "confirmed",
      registryRef: "reg-0000000000",
      verifiedAt: now,
    },
    spayNeuter: { source: "shelter_declared", state: "in_progress", declaredAt: now },
    listing: { kind: "published", publishedAt: now, confirmedAt: now, undoable: null },
  });
  await animalRepo(db).insert(animal, shelter.publicLocation.cityId);

  try {
    const response = await page.goto(`/tvaryny/${animal.id}`, { waitUntil: "load" });
    expect(response?.status()).toBe(200);
    const bytes = Buffer.byteLength((await response?.text()) ?? "");
    expect(
      bytes,
      `/tvaryny/<id> HTML is ${bytes} bytes; the budget is ${ANIMAL_PAGE_HTML_BUDGET_BYTES}`,
    ).toBeLessThan(ANIMAL_PAGE_HTML_BUDGET_BYTES);
  } finally {
    // No delete on the repo; a withdrawn animal is in no gallery.
    await animalRepo(db).update(
      {
        ...animal,
        listing: {
          kind: "withdrawn",
          withdrawnAt: new Date(),
          reason: { code: "listing_error", note: null },
        },
      },
      shelter.publicLocation.cityId,
    );
  }
});
