/**
 * The public animal page's document size, for the heaviest realistic animal: ten photos under
 * real-shaped R2 keys, every long field at its cap, registry and shelter-declared medical rows. The
 * fixture is written here, in the disposable harness database, and withdrawn afterwards so no
 * gallery spec sees it (its photos point at the unreachable test CDN).
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
 * UX-1 (2026-11-03): the segment's 404 now has a header, and Next renders that element into the
 * page payload. The full SiteHeader there cost +5.5 KB (78,459 on main, 83,995 with it); the plain
 * `NotFoundHeader` costs +2.1 KB (80,556), so the budget stays at 82,000.
 * #502 (2026-11-13, owner-approved): main measured 81,989; the bundler split this page's own client
 * code into one more chunk (+187 bytes of script references, page content byte-identical), so the
 * budget was 83,000; that seed-key fixture measured 82,176.
 * #504 (2026-11-16, owner): the fixture became realistic (real-length R2 keys, production's image
 * flags, AVIF on) and measured 84,221 in CI at 7993491, so the budget is 85,000. The logo and 176w
 * fixes that followed leave the fixture as it was: its shelter has no logo, and the hero never had
 * a 176w entry (a `100vw` slot starts the srcset at 400w). A live page with a logo saves ~600 bytes.
 * 2026-11-19 (owner): the budget counts content only (`contentBytesOf`), so a bundler re-split no
 * longer trips it. Main measured 84,898 whole and 82,964 as content; the budget is that plus ~1 KB.
 * #538 (2026-11-19): the root 404 stopped serialising the full header into every page; content
 * measured 78,158. The owner set 80,000 so R2 (#535) can land, then main's measure plus ~1 KB.
 */
export const ANIMAL_PAGE_HTML_BUDGET_BYTES = 80_000;

/**
 * The document without its chunk references: the `<script src>` tags and preloads, and the chunk
 * paths inside the flight data. They change with any shared-module edit, not with the page.
 */
export const contentBytesOf = (html: string): number =>
  Buffer.byteLength(
    html
      .replace(/<script src="\/_next\/static\/[^"]*"[^>]*><\/script>/g, "")
      .replace(/<link rel="preload" as="script"[^>]*\/>/g, "")
      .replace(/\/_next\/static\/chunks\/[\w.~-]+\.js/g, ""),
  );

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
  const animalId = randomUUID() as AnimalId;
  const animal = makeAnimal({
    id: animalId,
    shelterId: shelter.id,
    name: "Максимільян-Бровко Довгошерстий",
    // Real-shaped keys, so every photo URL is as long as a real one (R2 base, two UUIDs, variant).
    photos: Array.from({ length: MAX_ANIMAL_PHOTOS }, () => ({
      storageKey: `animals/${animalId}/${randomUUID()}`,
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
    const html = (await response?.text()) ?? "";
    const bytes = contentBytesOf(html);
    expect(
      bytes,
      `/tvaryny/<id> content is ${bytes} bytes (${Buffer.byteLength(html)} whole); the budget is ${ANIMAL_PAGE_HTML_BUDGET_BYTES}`,
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
