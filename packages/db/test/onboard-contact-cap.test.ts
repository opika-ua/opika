import { CityIdSchema, CONTACT_INPUT_MAX_LENGTH, MAX_ADDITIONAL_CHANNELS } from "@opika/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  buildShelter,
  deterministicId,
  insertOnboardedShelter,
  parseOnboardInput,
} from "../src/onboard-shelter";
import { cityRepo } from "../src/repos/city-repo";
import { shelters } from "../src/schema/shelters";
import { makeCity, setupTestDatabase, truncateAll } from "../src/test-utils/index";

/**
 * `onboard:shelter` must never create a contact the kabinet editor could not save: it parses the
 * file with the editor's own `ShelterContactInputSchema`, and these pin that, with the refusal
 * said in words. "Nothing is written on a refusal" rests on `main` exiting before it builds
 * anything; it is not tested here, since `parseOnboardInput` itself never writes.
 */

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());
beforeEach(async () => truncateAll(db));

const CITY_ID = CityIdSchema.parse(deterministicId("city:contact-cap"));
const phone = { kind: "phone" as const, e164: "+380671234567" };
const form = (n: number) => ({ kind: "form" as const, url: `https://example.org/apply-${n}` });
const other = (n: number) => ({ kind: "email" as const, address: `info${n}@example.org` });

const fileWith = (contact: unknown) => ({
  shelter: {
    idSeed: "contact-cap",
    displayName: "Тестовий притулок",
    descriptionUk: "Опис.",
    legalEntity: { kind: "unregistered_initiative", contactPersonName: "Олена" },
    exactAddress: {
      line1: "вул. Незалежності, 12",
      line2: null,
      postalCode: null,
      cityId: CITY_ID,
      district: null,
      coordinates: { lat: 50.5111, lng: 30.7903 },
    },
    contact,
    donation: null,
    freshnessSentenceUk: "Оновлюємо щотижня.",
    evidence: [
      { kind: "site_visit", visitedOn: "2026-09-01", notes: "Особисто говорив з Оленою." },
      {
        kind: "reference_contact",
        name: "Сусідній притулок",
        channel: { kind: "phone", e164: "+380671111111" },
        relationship: "partner_organisation",
      },
      {
        kind: "reference_contact",
        name: "Ветклініка",
        channel: { kind: "phone", e164: "+380672222222" },
        relationship: "veterinary_clinic",
      },
    ],
  },
  animals: [
    {
      idSeed: "cap-animal",
      name: "Ластівка",
      species: "dog",
      sex: "female",
      size: "medium",
      ageBucket: "adult",
      descriptionUk: "Опис.",
      photos: [{ localPath: "dog-1.jpg" }],
    },
  ],
});

const refusal = (contact: unknown): string => {
  const parsed = parseOnboardInput(fileWith(contact));
  if (parsed.kind !== "refused") throw new Error("expected a refusal");
  return parsed.message;
};

describe("onboard:shelter refuses what the kabinet editor could not save", () => {
  const SEVEN = Array.from({ length: MAX_ADDITIONAL_CHANNELS + 1 }, (_, i) => other(i));
  const cases: { name: string; contact: unknown; says: RegExp }[] = [
    {
      name: "more additional channels than the cap",
      contact: { primary: phone, additional: SEVEN },
      says: new RegExp(`contact.additional holds at most ${MAX_ADDITIONAL_CHANNELS} channels`),
    },
    {
      name: "a form as the primary channel",
      contact: { primary: form(0), additional: [] },
      says: /contact\.primary cannot be an application form/,
    },
    {
      name: "two application forms",
      contact: { primary: phone, additional: [form(1), form(2)] },
      says: /at most one application form/,
    },
    {
      name: "a value past the input length cap",
      contact: {
        primary: phone,
        additional: [
          { kind: "website", url: `https://example.org/${"a".repeat(CONTACT_INPUT_MAX_LENGTH)}` },
        ],
      },
      says: new RegExp(`longer than ${CONTACT_INPUT_MAX_LENGTH} characters`),
    },
  ];

  it.each(cases)("refuses $name, in words", ({ contact, says }) => {
    expect(refusal(contact)).toMatch(says);
  });

  // An unrelated custom issue deeper in the contact (a reserved Instagram name) must not borrow
  // the form or cap sentences.
  it.each([
    ["primary", { primary: { kind: "instagram", handle: "explore" }, additional: [] }],
    ["additional", { primary: phone, additional: [{ kind: "instagram", handle: "explore" }] }],
  ])(
    "says nothing about the form or the cap for a reserved Instagram name in %s",
    (_where, contact) => {
      const message = refusal(contact);
      expect(message).not.toMatch(/application form|holds at most|longer than/);
    },
  );

  it("onboards a legal contact at the cap: four others, Telegram and one form", async () => {
    const additional = [
      ...Array.from({ length: 4 }, (_, i) => other(i)),
      { kind: "telegram" as const, handle: "shelter_help" },
      form(1),
    ];
    expect(additional).toHaveLength(MAX_ADDITIONAL_CHANNELS);
    const parsed = parseOnboardInput(fileWith({ primary: phone, additional }));
    if (parsed.kind !== "ok") throw new Error(`refused: ${parsed.message}`);

    await cityRepo(db).insert(makeCity({ id: CITY_ID, slug: "contact-cap" as never }));
    const shelter = buildShelter(
      parsed.input.shelter,
      new Date("2026-09-06T12:00:00Z"),
      "a".repeat(32),
    );
    const by = {
      moderatorId: deterministicId("moderator:founder-manual-vetting") as never,
      now: new Date("2026-09-06T12:00:00Z"),
    };
    expect(await insertOnboardedShelter(db, shelter, by)).toBe("inserted");

    const [row] = await db.select({ contact: shelters.contact }).from(shelters);
    expect(row?.contact).toEqual({ primary: phone, additional });
  });
});
