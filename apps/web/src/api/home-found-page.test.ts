import { animalRepo, cityRepo, galleryRepo, shelterRepo } from "@opika/db/repos";
import {
  type AnimalFixtureOverrides,
  makeAnimal,
  makeCity,
  makeDraftAnimal,
  makeShelter,
} from "@opika/db/test";
import { type AnimalListingState, NO_FILTERS, type ShelterVerification } from "@opika/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestHarness, type TestHarness } from "./test-harness";

/**
 * «Уже вдома» (owner, 2026-11-24): `animals.byId` answers an adoption less than 90 days old with
 * the `home_found` view; every other non-discoverable card is the same NOT_FOUND as before, and
 * the gallery, the sitemap, the saved list and the reveal keep excluding adopted animals.
 */

let h: TestHarness;
beforeAll(async () => {
  h = await createTestHarness();
});
afterAll(async () => h.cleanup());
beforeEach(async () => h.truncate());

const DAY = 86_400_000;
const NOW = new Date("2026-08-01T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const PHOTO = { storageKey: "animals/home/one", width: 800, height: 1000, alt: null };
const UNKNOWN_ID = "99999999-9999-4999-8999-999999999999";

const adopted = (at: Date): AnimalListingState => ({ kind: "adopted", adoptedAt: at });

async function seed(animalOverrides: AnimalFixtureOverrides, verification?: ShelterVerification) {
  const city = makeCity();
  await cityRepo(h.db).insert(city);
  const base = makeShelter();
  const shelter = makeShelter({
    premises: { kind: "address", address: { ...base.premises.address, cityId: city.id } },
    ...(verification && { verification }),
  });
  await shelterRepo(h.db).insert(shelter);
  const animal = makeAnimal({
    shelterId: shelter.id,
    name: "Рижик",
    species: "cat",
    photos: [PHOTO],
    ...animalOverrides,
  });
  await animalRepo(h.db).insert(animal, city.id);
  return { shelter, animal, city };
}

const byId = (animalId: string, now = NOW) => h.call("animals.byId", { animalId }, { now });

describe("animals.byId: each listing kind", () => {
  it("published and reserved answer the listed page, as before", async () => {
    const { animal: published } = await seed({});
    const { animal: reserved } = await seed({
      listing: {
        kind: "reserved",
        since: ago(DAY),
        publishedAt: ago(9 * DAY),
        confirmedAt: ago(DAY),
        undoable: null,
      },
    });
    for (const id of [published.id, reserved.id]) {
      const res = await byId(id);
      expect(res.status).toBe(200);
      expect((res.body as { kind: string }).kind).toBe("listed");
    }
  });

  it("an adoption 10 days old answers home_found: name, species, photo and shelter name only", async () => {
    const { animal, shelter, city } = await seed({ listing: adopted(ago(10 * DAY)) });
    const res = await byId(animal.id);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      kind: "home_found",
      name: "Рижик",
      species: "cat",
      primaryPhoto: PHOTO,
      shelterName: shelter.displayName,
    });
    // Deny by default: no contact, address, city pin, reveal or listing date travels.
    expect(Object.keys(res.body as object).sort()).toEqual([
      "kind",
      "name",
      "primaryPhoto",
      "shelterName",
      "species",
    ]);
    for (const leaked of [
      "+380501234567",
      "вул. Тестова",
      city.id,
      shelter.id,
      animal.id,
      "publicLocation",
      ago(10 * DAY).toISOString(),
    ]) {
      expect(res.raw).not.toContain(leaked);
    }
  });

  it("89 days 23 hours after the adoption still shows; exactly 90 days and after are NOT_FOUND", async () => {
    const adoptedAt = ago(0);
    const { animal } = await seed({ listing: adopted(adoptedAt) });
    const at = (ms: number) => new Date(adoptedAt.getTime() + ms);
    expect((await byId(animal.id, at(89 * DAY + 23 * 3_600_000))).status).toBe(200);
    const unknown = await byId(UNKNOWN_ID, at(90 * DAY));
    for (const ms of [90 * DAY, 91 * DAY]) {
      const gone = await byId(animal.id, at(ms));
      expect([gone.status, gone.body]).toEqual([unknown.status, unknown.body]);
    }
    expect(unknown.status).toBe(404);
  });

  it.each([
    [
      "withdrawn",
      {
        listing: {
          kind: "withdrawn",
          withdrawnAt: ago(DAY),
          reason: { code: "other", note: null },
        },
      },
    ],
    ["never served, then adopted", { listing: adopted(ago(DAY)), everServedAt: null }],
  ] as const)("a %s card is NOT_FOUND exactly like an unknown id", async (_name, overrides) => {
    const { animal } = await seed(overrides as AnimalFixtureOverrides);
    const [res, unknown] = [await byId(animal.id), await byId(UNKNOWN_ID)];
    expect([res.status, res.body]).toEqual([unknown.status, unknown.body]);
  });

  it("a draft is NOT_FOUND", async () => {
    const city = makeCity();
    await cityRepo(h.db).insert(city);
    const shelter = makeShelter({
      premises: {
        kind: "address",
        address: { ...makeShelter().premises.address, cityId: city.id },
      },
    });
    await shelterRepo(h.db).insert(shelter);
    const draft = makeDraftAnimal({ shelterId: shelter.id });
    await animalRepo(h.db).insert(draft, city.id);
    expect((await byId(draft.id)).status).toBe(404);
  });

  it("an adoption under a suspended shelter is NOT_FOUND (no shelter name for a hidden shelter)", async () => {
    const at = ago(DAY);
    const verified = { verifiedAt: at, verifiedBy: UNKNOWN_ID as never };
    const { animal } = await seed(
      { listing: adopted(ago(DAY)) },
      {
        status: "suspended",
        suspendedAt: at,
        suspendedBy: UNKNOWN_ID as never,
        reason: { code: "unresponsive", note: null },
        priorState: { status: "verified", ...verified },
        evidence: { items: [], submittedAt: at },
      },
    );
    expect((await byId(animal.id)).status).toBe(404);
  });
});

describe("what stays excluded for a recently adopted animal", () => {
  it("the gallery, the sitemap, the saved list and the reveal", async () => {
    const { animal: listed } = await seed({});
    const { animal } = await seed({ listing: adopted(ago(DAY)) });
    expect((await byId(animal.id)).status).toBe(200);

    const gallery = await h.call(
      "gallery.list",
      { filters: NO_FILTERS, sort: "freshest", page: 1, pageSize: 24, scope: { kind: "everyone" } },
      { now: NOW },
    );
    const ids = (gallery.body as { items: { id: string }[] }).items.map((item) => item.id);
    expect(ids).toEqual([listed.id]);

    const sitemap = await galleryRepo(h.db).sitemapRows({ now: NOW });
    expect(sitemap.map((row) => row.id)).toEqual([listed.id]);

    const saved = await h.call("animals.cardsByIds", { animalIds: [animal.id] }, { now: NOW });
    expect((saved.body as { items: { kind: string }[] }).items.map((item) => item.kind)).toEqual([
      "unavailable",
    ]);

    const session = await h.call("session.bootstrap", {});
    const cookie = h.extractSessionCookie(session.headers);
    if (!cookie) throw new Error("no session cookie");
    const reveal = await h.call("animals.reveal", { animalId: animal.id }, { cookie, now: NOW });
    expect([reveal.status, (reveal.body as { code: string }).code]).toEqual([
      404,
      "ANIMAL_NOT_AVAILABLE",
    ]);
  });
});
