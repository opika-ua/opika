import { animalRepo, cityRepo, shelterRepo } from "@opika/db/repos";
import { makeAnimal, makeCity, makeShelter } from "@opika/db/test";
import type { Shelter, ShelterLegalEntity, ShelterVerification } from "@opika/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestHarness, type TestHarness } from "./test-harness";

/**
 * Owner, 2026-11-24: every public answer names the organisation's word, derived from its legal
 * form on the server, and nothing else of the form. An unregistered initiative is «initiative»; a
 * registered form, or none chosen yet (D1), is «shelter». Fictional names only.
 */
let h: TestHarness;
beforeAll(async () => {
  h = await createTestHarness();
});
afterAll(async () => {
  await h.cleanup();
});
beforeEach(async () => {
  await h.truncate();
});

// The harness's default clock.
const NOW = new Date("2026-08-01T12:00:00Z");
const AT = new Date("2026-07-01T00:00:00Z");
const MOD = "00000000-0000-4000-8000-000000000000" as never;
const EVIDENCE = { items: [], submittedAt: AT };
const PERSON = "Вигадана Особа";
const INITIATIVE: ShelterLegalEntity = {
  kind: "unregistered_initiative",
  contactPersonName: PERSON,
};
const VERIFIED = {
  status: "verified",
  verifiedAt: AT,
  verifiedBy: MOD,
  evidence: EVIDENCE,
} as const;
const PAUSED = {
  status: "paused",
  verifiedAt: AT,
  verifiedBy: MOD,
  pausedAt: AT,
  pausedBy: { kind: "moderator", moderatorId: MOD },
  reason: { code: "relocation", note: null },
  evidence: EVIDENCE,
} as const;

type Form = "initiative" | "ngo" | "none";

async function seed(form: Form, verification: ShelterVerification = VERIFIED) {
  const city = makeCity();
  await cityRepo(h.db).insert(city);
  const base = makeShelter({
    displayName: "Хвости в пошуку",
    verification,
    premises: {
      kind: "address",
      address: {
        line1: "вул. Тестова 1",
        line2: null,
        postalCode: "01001",
        cityId: city.id,
        district: null,
        coordinates: { lat: 50.45, lng: 30.52 },
      },
    },
  });
  // A form is required from verification on, so the null form is an early-listed pending shelter.
  const shelter: Shelter =
    form === "initiative"
      ? { ...base, legalEntity: INITIATIVE }
      : form === "ngo"
        ? base
        : {
            ...base,
            legalEntity: null,
            verification: { status: "pending", submittedAt: AT, evidence: EVIDENCE },
            earlyListingSince: new Date(NOW.getTime() - 86_400_000),
          };
  await shelterRepo(h.db).insert(shelter);
  const animal = makeAnimal({ shelterId: shelter.id, name: "Ластівка" });
  await animalRepo(h.db).insert(animal, city.id);
  return { shelter, animal };
}

async function cookie(): Promise<string> {
  const res = await h.call("session.bootstrap", {});
  const value = h.extractSessionCookie(res.headers);
  if (!value) throw new Error("no session cookie");
  return value;
}

const body = (res: { body: unknown }) => res.body as Record<string, unknown>;
/** No form data beyond the word: not the kind, the contact person, the legal name or the code. */
const expectNoLegalData = (raw: string) => {
  expect(raw).not.toContain("legalEntity");
  expect(raw).not.toContain("unregistered_initiative");
  expect(raw).not.toContain("registered_ngo");
  expect(raw).not.toContain(PERSON);
  expect(raw).not.toContain("ТОВ Тест");
  expect(raw).not.toContain("12345678");
};

const CASES = [
  ["initiative", "initiative"],
  ["ngo", "shelter"],
  ["none", "shelter"],
] as const;

describe("the public answers carry the organisation word and no other legal data", () => {
  it.each(CASES)("shelters.byId: %s form is %s", async (form, word) => {
    const { shelter } = await seed(form);
    const res = await h.call("shelters.byId", { shelterId: shelter.id });
    expect(res.status).toBe(200);
    expect(body(res).organisationWord).toBe(word);
    expectNoLegalData(res.raw);
  });

  it.each(CASES)("animals.byId: %s form is %s", async (form, word) => {
    const { animal } = await seed(form);
    const res = await h.call("animals.byId", { animalId: animal.id });
    const shelter = (body(res).animal as { shelter: { organisationWord: string } }).shelter;
    expect(shelter.organisationWord).toBe(word);
    expectNoLegalData(res.raw);
  });

  it.each(CASES)("gallery.list: %s form is %s", async (form, word) => {
    await seed(form);
    const res = await h.call("gallery.list", {
      filters: {
        regions: { kind: "any" },
        cities: { kind: "any" },
        species: { kind: "any" },
        sexes: { kind: "any" },
        sizes: { kind: "any" },
        ages: { kind: "any" },
      },
      sort: "freshest",
      page: 1,
      pageSize: 24,
      scope: { kind: "everyone" },
    });
    const items = body(res).items as { shelter: { organisationWord: string } }[];
    expect(items.map((item) => item.shelter.organisationWord)).toEqual([word]);
    expectNoLegalData(res.raw);
  });

  it.each(CASES)("animals.cardsByIds (a card): %s form is %s", async (form, word) => {
    const { animal } = await seed(form);
    const res = await h.call("animals.cardsByIds", { animalIds: [animal.id] });
    const [item] = body(res).items as { card: { shelter: { organisationWord: string } } }[];
    expect(item?.card.shelter.organisationWord).toBe(word);
    expectNoLegalData(res.raw);
  });

  it.each([
    ["initiative", "initiative"],
    ["ngo", "shelter"],
  ] as const)("animals.cardsByIds (paused line): %s form is %s", async (form, word) => {
    const { animal } = await seed(form, PAUSED);
    const res = await h.call("animals.cardsByIds", { animalIds: [animal.id] });
    expect(body(res).items).toEqual([
      { kind: "paused", animalId: animal.id, name: animal.name, organisationWord: word },
    ]);
    expectNoLegalData(res.raw);
  });

  it.each(CASES)("animals.reveal and reveals.listMine: %s form is %s", async (form, word) => {
    const session = await cookie();
    const { animal } = await seed(form);
    const res = await h.call("animals.reveal", { animalId: animal.id }, { cookie: session });
    expect(res.status).toBe(200);
    expect(body(res).organisationWord).toBe(word);
    expectNoLegalData(res.raw);

    const mine = await h.call("reveals.listMine", { cursor: null, limit: 20 }, { cookie: session });
    const items = body(mine).items as { organisationWord: string }[];
    expect(items.map((item) => item.organisationWord)).toEqual([word]);
    expectNoLegalData(mine.raw);
  });
});
