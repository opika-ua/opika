import type { KabinetAnimalView, RegistryShelterView } from "@opika/contracts";
import { animalRepo, cityRepo, galleryRepo, shelterRepo } from "@opika/db/repos";
import { animals, shelterHistory } from "@opika/db/schema";
import {
  makeAnimal,
  makeCity,
  makeDraftAnimal,
  makeShelter,
  setupTestDatabase,
  truncateAll,
} from "@opika/db/test";
import {
  type Animal,
  animalLocationOf,
  type CityId,
  EVERYONE_SCOPE,
  effectiveCityId,
  exactAddressOf,
  type ModeratorId,
  NO_FILTERS,
  type Shelter,
  type ShelterAdminId,
  testOnlyLocationPolicy,
} from "@opika/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { inMemoryRateLimiter } from "../api/rate-limit";
import { fromRpcBody, toRpcBody } from "../api/test-harness";
import { SHELTER_WRITE_POLICY } from "./access";
import type { KabinetPrincipal } from "./actor";
import { capturingInvitationSender } from "./email-senders";
import { capturingPasswordMail } from "./password-mail";
import { handleKabinetRpc } from "./rpc-route";
import { roomyCitySearch } from "./test-city-search";
import { TEST_SESSION_COOKIE } from "./test-session-cookie";

/**
 * «Де зараз тварина» (P0-5) through the served router: `public_location` says where the animal is
 * and `city_id` stays the effective city the gallery filters on, so no gallery query changes.
 */

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());

const NOW = new Date("2026-11-18T10:00:00.000Z");
const ADMIN = "33333333-3333-4333-8333-333333333333" as ShelterAdminId;
const OPERATOR = "0ec0ec0e-0000-4000-8000-000000000001" as ModeratorId;
const policy = testOnlyLocationPolicy(process.env.NODE_ENV, "animal-location-test");
let shelter: Shelter;
let shelterCity: CityId;
let fosterCity: CityId;
let movedCity: CityId;

beforeEach(async () => {
  await truncateAll(db);
  const [a, b, c] = [makeCity(), makeCity(), makeCity()];
  for (const city of [a, b, c]) await cityRepo(db).insert(city);
  shelterCity = a.id;
  fosterCity = b.id;
  movedCity = c.id;
  shelter = makeShelter({ publicLocation: { ...makeShelter().publicLocation, cityId: a.id } });
  await shelterRepo(db).insert(shelter);
});

const limiters = {
  perUser: inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 10_000 }),
  perIp: inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 10_000 }),
};

async function call<T>(
  path: string,
  input: unknown,
  principal: KabinetPrincipal = {
    kind: "shelter_admin",
    shelterAdminId: ADMIN,
    shelterId: shelter.id,
  },
): Promise<{ status: number; body: T }> {
  const request = new Request(`http://localhost/api/kabinet/${path.replaceAll(".", "/")}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost",
      cookie: TEST_SESSION_COOKIE,
    },
    body: JSON.stringify(toRpcBody(input)),
  });
  const response = await handleKabinetRpc(request, {
    availability: {
      kind: "available",
      passwordMail: capturingPasswordMail(),
      sender: { send: async () => {} },
      invites: capturingInvitationSender(),
      secret: "x",
      baseURL: "http://localhost",
    },
    limiters,
    ip: "203.0.113.1",
    resolve: async () => ({
      principal,
      userId: "user-admin",
      db,
      cursorSecret: "test-cursor-secret",
    }),
    now: NOW,
    newId: () => crypto.randomUUID(),
    operatorDisplayName: "Олексій",
    locationPolicy: policy,
    production: false,
    shelterWrites: SHELTER_WRITE_POLICY,
    citySearch: roomyCitySearch(),
    transactionalMail: null,
  });
  const text = await response.text();
  return { status: response.status, body: (text ? fromRpcBody(JSON.parse(text)) : null) as T };
}

async function listed(overrides: Parameters<typeof makeAnimal>[0] = {}): Promise<Animal> {
  const animal = makeAnimal({ shelterId: shelter.id, ...overrides });
  await animalRepo(db).insert(animal, shelterCity);
  return animal;
}

const row = async (id: string) =>
  (await db.select().from(animals)).find((r) => r.id === id) ?? null;

const locate = (animal: Animal, location: unknown, expectedVersion = animal.version) =>
  call<KabinetAnimalView>("shelter.animals.update", {
    animalId: animal.id,
    expectedVersion,
    patch: { location },
  });

/** Gallery ids under one city filter, read the way `/tvaryny?misto=` reads them. */
const galleryIn = async (cityId: CityId) =>
  (
    await galleryRepo(db).list({
      filters: { ...NO_FILTERS, cities: { kind: "oneOf", values: [cityId] } },
      scope: EVERYONE_SCOPE,
      sort: "freshest",
      page: 1,
      pageSize: 24,
      now: NOW,
    })
  ).items.map((item) => item.id);

describe("shelter.animals.update with a location", () => {
  it("own_city: a city-precision location and the effective city, recorded as a location edit", async () => {
    const animal = await listed();
    const result = await locate(animal, { kind: "own_city", cityId: fosterCity });
    expect(result.status).toBe(200);
    expect(result.body.location).toEqual({ kind: "own_city", cityId: fosterCity });
    expect(await row(animal.id)).toMatchObject({
      publicLocation: { precision: "city", cityId: fosterCity, district: null },
      cityId: fosterCity,
      version: animal.version + 1,
    });
    const lines = await db.select({ entry: shelterHistory.entry }).from(shelterHistory);
    expect(lines.map((line) => line.entry)).toEqual([
      expect.objectContaining({ kind: "animal_edited", animalId: animal.id, fields: ["location"] }),
    ]);
  });

  it("shelter_city: clears the location and takes the shelter's city again", async () => {
    const animal = await listed();
    await locate(animal, { kind: "own_city", cityId: fosterCity });
    const back = await locate(animal, { kind: "shelter_city" }, animal.version + 1);
    expect(back.status).toBe(200);
    expect(back.body.location).toEqual({ kind: "shelter_city" });
    expect(await row(animal.id)).toMatchObject({ publicLocation: null, cityId: shelterCity });
  });

  it("the same location again writes nothing", async () => {
    const animal = await listed();
    const same = await locate(animal, { kind: "shelter_city" });
    expect(same.status).toBe(200);
    expect((await row(animal.id))?.version).toBe(animal.version);
  });

  it("a draft takes a location too", async () => {
    const draft = makeDraftAnimal({ shelterId: shelter.id });
    await animalRepo(db).insert(draft, shelterCity);
    const result = await locate(draft, { kind: "own_city", cityId: fosterCity });
    expect(result.status).toBe(200);
    expect((await row(draft.id))?.cityId).toBe(fosterCity);
  });

  it("an unknown city is a bad request and changes nothing", async () => {
    const animal = await listed();
    const result = await locate(animal, { kind: "own_city", cityId: crypto.randomUUID() });
    expect(result.status).toBe(400);
    expect(await row(animal.id)).toMatchObject({ publicLocation: null, cityId: shelterCity });
  });

  it("an edit that leaves the location alone keeps an own city", async () => {
    const animal = await listed();
    await locate(animal, { kind: "own_city", cityId: fosterCity });
    const renamed = await call<KabinetAnimalView>("shelter.animals.update", {
      animalId: animal.id,
      expectedVersion: animal.version + 1,
      patch: { name: "Нове імʼя" },
    });
    expect(renamed.status).toBe(200);
    expect(await row(animal.id)).toMatchObject({ cityId: fosterCity, name: "Нове імʼя" });
  });
});

describe("the gallery reads the effective city (no query change)", () => {
  it("an own_city animal filters under its own city, not the shelter's", async () => {
    const away = await listed();
    const home = await listed();
    await locate(away, { kind: "own_city", cityId: fosterCity });
    expect(await galleryIn(fosterCity)).toEqual([away.id]);
    expect(await galleryIn(shelterCity)).toEqual([home.id]);
  });
});

describe("a shelter city change (the operator's path) moves only the animals that follow it", () => {
  it("the shelter_city animal moves, the own_city one stays, each at its effectiveCityId", async () => {
    const follows = await listed();
    const away = await listed();
    await locate(away, { kind: "own_city", cityId: fosterCity });
    const address = exactAddressOf(shelter.premises);
    if (address === null) throw new Error("the fixture shelter has an address");
    const moved = await call<RegistryShelterView>(
      "registry.shelters.updateVerifiedData",
      {
        shelterId: shelter.id,
        expectedVersion: shelter.version,
        change: {
          field: "premises",
          next: { kind: "address", address: { ...address, cityId: movedCity } },
        },
      },
      { kind: "super_admin", moderatorId: OPERATOR },
    );
    expect(moved.status).toBe(200);
    const rows = await db.select().from(animals);
    const cityOf = (id: string) => rows.find((r) => r.id === id)?.cityId;
    expect(cityOf(follows.id)).toBe(movedCity);
    expect(cityOf(away.id)).toBe(fosterCity);
    for (const r of rows) {
      expect(r.cityId).toBe(effectiveCityId(animalLocationOf(r.publicLocation), movedCity));
    }
  });
});
