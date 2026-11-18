import { UNKNOWN_CITY_MESSAGE } from "@opika/contracts";
import {
  animalRepo,
  cityRepo,
  kabinetAnimalRepo,
  kabinetShelterRepo,
  shelterRepo,
} from "@opika/db/repos";
import { animals, funnelEvents } from "@opika/db/schema";
import {
  makeAnimal,
  makeCity,
  makeDraftAnimal,
  makeShelter,
  setupTestDatabase,
  truncateAll,
} from "@opika/db/test";
import type {
  Animal,
  FunnelEventKind,
  ModeratorId,
  Shelter,
  ShelterAdminId,
  ShelterVerification,
} from "@opika/domain";
import { transition } from "@opika/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { inMemoryRateLimiter } from "../api/rate-limit";
import { fromRpcBody, toRpcBody } from "../api/test-harness";
import { SHELTER_WRITE_POLICY } from "./access";
import type { KabinetPrincipal } from "./actor";
import { capturingInvitationSender } from "./email-senders";
import { recordFunnelStep } from "./handlers/shelter-stage";
import { capturingPasswordMail } from "./password-mail";
import { handleKabinetRpc } from "./rpc-route";
import { TEST_SESSION_COOKIE } from "./test-session-cookie";

/**
 * Self-registration's shelter side through the served router (plan, Agent 3): what an application
 * may not do yet (D2, D5, §5), the funnel's two shelter steps (§8), and the identity edit (§4, D4).
 */

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());

const NOW = new Date("2026-11-20T10:00:00.000Z");
const ADMIN = "33333333-3333-4333-8333-333333333333" as ShelterAdminId;
const EVIDENCE = { items: [], submittedAt: NOW };
let cityId: string;
let otherCityId: string;

beforeEach(async () => {
  await truncateAll(db);
  const city = makeCity();
  const other = makeCity();
  await cityRepo(db).insert(city);
  await cityRepo(db).insert(other);
  cityId = city.id;
  otherCityId = other.id;
});

type Stage = "application" | "accepted" | "operator";

const MOD = "11111111-1111-4111-8111-111111111111" as ModeratorId;

/**
 * A shelter in the test's city: an application, an accepted one (moved to pending by the
 * operator's `accept_application`, as the queue does), or one the operator created.
 */
async function shelterAt(stage: Stage): Promise<Shelter> {
  const verification: ShelterVerification =
    stage === "operator"
      ? { status: "pending", submittedAt: NOW, evidence: EVIDENCE }
      : { status: "application", appliedAt: NOW, evidence: EVIDENCE };
  const shelter = makeShelter({
    verification,
    publicLocation: { ...makeShelter().publicLocation, cityId } as never,
  });
  await shelterRepo(db).insert(shelter);
  if (stage !== "accepted") return shelter;
  const event = { type: "accept_application", at: NOW, moderatorId: MOD } as const;
  const moved = transition(verification, event);
  if (moved.kind !== "ok") throw new Error(`accept_application: ${moved.kind}`);
  const written = await kabinetShelterRepo(db).applyAudited({
    shelterId: shelter.id,
    expectedVersion: shelter.version,
    change: { kind: "verification", verification: moved.next },
    entry: { kind: "verification", event, from: "application", to: moved.next.status },
    historyId: crypto.randomUUID(),
    now: NOW,
  });
  if (written.kind !== "ok") throw new Error("accept write lost");
  const accepted = await shelterRepo(db).findById(shelter.id);
  if (accepted === null) throw new Error("accepted shelter vanished");
  return accepted;
}

const asAdminOf = (shelter: Shelter): KabinetPrincipal => ({
  kind: "shelter_admin",
  shelterAdminId: ADMIN,
  shelterId: shelter.id,
});

const generous = {
  perUser: inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 10_000 }),
  perIp: inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 10_000 }),
};

async function call<T = Record<string, unknown>>(
  shelter: Shelter,
  path: string,
  input: unknown,
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
    limiters: generous,
    ip: "203.0.113.1",
    resolve: async () => ({
      principal: asAdminOf(shelter),
      userId: "user-admin",
      db,
      cursorSecret: "test-cursor-secret",
    }),
    now: NOW,
    newId: () => crypto.randomUUID(),
    operatorDisplayName: "Олексій",
    locationPolicy: null,
    production: false,
    shelterWrites: SHELTER_WRITE_POLICY,
  });
  const text = await response.text();
  return { status: response.status, body: (text ? fromRpcBody(JSON.parse(text)) : null) as T };
}

/** A draft with every fact a publish needs. */
async function readyDraft(shelter: Shelter): Promise<Animal> {
  const animal = makeAnimal({
    shelterId: shelter.id,
    listing: { kind: "draft" },
    photos: [{ storageKey: "a/1.jpg", width: 1200, height: 900, alt: null }],
  });
  await animalRepo(db).insert(animal, cityId as never);
  return animal;
}

async function bareDrafts(shelter: Shelter, count: number): Promise<void> {
  for (let n = 0; n < count; n += 1) {
    await animalRepo(db).insert(makeDraftAnimal({ shelterId: shelter.id }), cityId as never);
  }
}

const publish = (shelter: Shelter, animal: Animal) =>
  call<{ code?: string; data?: unknown; listing?: { kind: string } }>(
    shelter,
    "shelter.animals.transition",
    { animalId: animal.id, event: { type: "publish" } },
  );

const createDraft = (shelter: Shelter, name = "Ластівка") =>
  call<{ code?: string; data?: unknown }>(shelter, "shelter.animals.createDraft", {
    name,
    species: "dog",
  });

async function funnelOf(shelter: Shelter): Promise<FunnelEventKind[]> {
  const rows = await db
    .select({ shelterId: funnelEvents.shelterId, kind: funnelEvents.kind })
    .from(funnelEvents);
  return rows
    .filter((row) => row.shelterId === shelter.id)
    .map((row) => row.kind)
    .sort();
}

const listingOf = async (animal: Animal) =>
  (await animalRepo(db).findById(animal.id))?.listing.kind;

describe("an application publishes nothing (D2)", () => {
  it("a ready draft is refused AWAITING_APPROVAL with action publish, and stays a draft", async () => {
    const shelter = await shelterAt("application");
    const animal = await readyDraft(shelter);
    const result = await publish(shelter, animal);
    expect(result.status).toBe(409);
    expect(result.body.code).toBe("AWAITING_APPROVAL");
    expect(result.body.data).toEqual({ action: "publish" });
    expect(await listingOf(animal)).toBe("draft");
    expect(await funnelOf(shelter)).toEqual([]);
  });

  it("once accepted, the same draft publishes", async () => {
    const shelter = await shelterAt("accepted");
    const animal = await readyDraft(shelter);
    const result = await publish(shelter, animal);
    expect(result.status).toBe(200);
    expect(await listingOf(animal)).toBe("published");
  });
});

describe("an application holds at most 30 drafts (D5)", () => {
  it("the 31st draft is refused DRAFT_LIMIT_REACHED with the cap, and nothing is written", async () => {
    const shelter = await shelterAt("application");
    await bareDrafts(shelter, 29);
    expect((await createDraft(shelter, "Тридцята")).status).toBe(200);
    const refused = await createDraft(shelter, "Тридцять перша");
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("DRAFT_LIMIT_REACHED");
    expect(refused.body.data).toEqual({ max: 30 });
    const counts = await kabinetAnimalRepo(db).countsByKind(shelter.id);
    expect(counts.draft).toBe(30);
  });

  it("an accepted or operator-created shelter has no cap", async () => {
    for (const stage of ["accepted", "operator"] as const) {
      const shelter = await shelterAt(stage);
      await bareDrafts(shelter, 30);
      expect((await createDraft(shelter)).status).toBe(200);
    }
  });
});

describe("the funnel's shelter steps (§8), once per shelter", () => {
  it("first_draft and first_published are recorded once, however many follow", async () => {
    const shelter = await shelterAt("accepted");
    await createDraft(shelter, "Перша");
    await createDraft(shelter, "Друга");
    expect(await funnelOf(shelter)).toEqual(["first_draft"]);
    const one = await readyDraft(shelter);
    const two = await readyDraft(shelter);
    expect((await publish(shelter, one)).status).toBe(200);
    expect((await publish(shelter, two)).status).toBe(200);
    expect(await funnelOf(shelter)).toEqual(["first_draft", "first_published"]);
  });

  it("an application's draft counts too; an operator-created shelter never enters the funnel", async () => {
    const application = await shelterAt("application");
    await createDraft(application);
    expect(await funnelOf(application)).toEqual(["first_draft"]);
    const operator = await shelterAt("operator");
    await createDraft(operator);
    expect((await publish(operator, await readyDraft(operator))).status).toBe(200);
    expect(await funnelOf(operator)).toEqual([]);
  });

  it("a funnel write that fails never fails the shelter's own action", async () => {
    const broken = {
      insert: () => {
        throw new Error("funnel down");
      },
    } as unknown as typeof db;
    const registration = {
      source: "self_registration",
      appliedAt: NOW,
      email: "confirmed",
    } as const;
    await expect(
      recordFunnelStep({ db: broken, now: NOW }, registration, "first_draft", "s" as never),
    ).resolves.toBeUndefined();
  });
});

describe("a donation link (§5, D3)", () => {
  const url = "https://send.monobank.ua/jar/abc";

  it("an application can't propose one: AWAITING_APPROVAL with action propose_donation", async () => {
    const shelter = await shelterAt("application");
    const result = await call<{ code?: string; data?: unknown }>(
      shelter,
      "shelter.profile.proposeDonation",
      { url },
    );
    expect(result.status).toBe(409);
    expect(result.body.code).toBe("AWAITING_APPROVAL");
    expect(result.body.data).toEqual({ action: "propose_donation" });
    expect((await shelterRepo(db).findById(shelter.id))?.pendingDonation).toBeNull();
  });

  it("once accepted, a change waits for the operator as a pending proposal, never live", async () => {
    const shelter = await shelterAt("accepted");
    const result = await call(shelter, "shelter.profile.proposeDonation", { url });
    expect(result.status).toBe(200);
    const stored = await shelterRepo(db).findById(shelter.id);
    expect(stored?.pendingDonation?.link.url).toBe(url);
    expect(stored?.donation).toEqual(shelter.donation);
  });
});

describe("shelter.profile.updateIdentity (§4, D4)", () => {
  it("a rename is instant and logged with the shelter admin as actor", async () => {
    const shelter = await shelterAt("accepted");
    const result = await call<{ displayName?: string; version?: number }>(
      shelter,
      "shelter.profile.updateIdentity",
      { displayName: "  Хвостики  ", expectedVersion: shelter.version },
    );
    expect(result.status).toBe(200);
    expect(result.body.displayName).toBe("Хвостики");
    expect((await shelterRepo(db).findById(shelter.id))?.displayName).toBe("Хвостики");
    // The accept and the rename share `at` (NOW), so find the line rather than trust the order.
    const line = (await kabinetShelterRepo(db).historyOf(shelter.id)).find(
      (entry) => entry.kind === "display_name_changed",
    );
    expect(line).toEqual({
      kind: "display_name_changed",
      at: NOW,
      actor: { kind: "shelter_admin", shelterAdminId: ADMIN },
      from: shelter.displayName,
      to: "Хвостики",
    });
  });

  it("an application may rename itself too", async () => {
    const shelter = await shelterAt("application");
    const result = await call(shelter, "shelter.profile.updateIdentity", {
      displayName: "Хвостики",
      expectedVersion: shelter.version,
    });
    expect(result.status).toBe(200);
  });

  it("a stale version is CONFLICT and writes nothing", async () => {
    const shelter = await shelterAt("accepted");
    const before = await kabinetShelterRepo(db).historyOf(shelter.id);
    const result = await call<{ code?: string }>(shelter, "shelter.profile.updateIdentity", {
      displayName: "Хвостики",
      expectedVersion: shelter.version + 1,
    });
    expect(result.status).toBe(409);
    expect(result.body.code).toBe("CONFLICT");
    expect((await shelterRepo(db).findById(shelter.id))?.displayName).toBe(shelter.displayName);
    expect(await kabinetShelterRepo(db).historyOf(shelter.id)).toEqual(before);
  });

  it("the same name writes nothing: no version bump, no history line", async () => {
    const shelter = await shelterAt("accepted");
    const before = await kabinetShelterRepo(db).historyOf(shelter.id);
    const result = await call<{ version?: number }>(shelter, "shelter.profile.updateIdentity", {
      displayName: shelter.displayName,
      expectedVersion: shelter.version,
    });
    expect(result.status).toBe(200);
    expect(result.body.version).toBe(shelter.version);
    expect(await kabinetShelterRepo(db).historyOf(shelter.id)).toEqual(before);
  });

  /** An animal at the shelter (follows its city) and one fostered in a third city (its own). */
  async function twoAnimals(shelter: Shelter) {
    const fosterCity = makeCity();
    await cityRepo(db).insert(fosterCity);
    const atShelter = makeAnimal({ shelterId: shelter.id });
    const fostered = makeAnimal({
      shelterId: shelter.id,
      publicLocation: { precision: "city", cityId: fosterCity.id, district: null },
    } as never);
    await animalRepo(db).insert(atShelter, cityId as never);
    await animalRepo(db).insert(fostered, fosterCity.id as never);
    return { atShelter, fostered, fosterCityId: fosterCity.id };
  }

  async function animalCities(): Promise<Map<string, string>> {
    const rows = await db.select({ id: animals.id, cityId: animals.cityId }).from(animals);
    return new Map(rows.map((row) => [row.id, row.cityId]));
  }

  it("a city change moves the shelter and only the animals that follow its city, logged with the admin", async () => {
    const shelter = await shelterAt("accepted");
    const { atShelter, fostered, fosterCityId } = await twoAnimals(shelter);
    const result = await call<{ cityId?: string; version?: number }>(
      shelter,
      "shelter.profile.updateIdentity",
      { cityId: otherCityId, expectedVersion: shelter.version },
    );
    expect(result.status).toBe(200);
    expect(result.body.cityId).toBe(otherCityId);
    expect(result.body.version).toBe(shelter.version + 1);
    const stored = await shelterRepo(db).findById(shelter.id);
    expect(stored?.publicLocation).toEqual({
      precision: "city",
      cityId: otherCityId,
      district: null,
    });
    const cities = await animalCities();
    expect(cities.get(atShelter.id)).toBe(otherCityId);
    expect(cities.get(fostered.id)).toBe(fosterCityId);
    const line = (await kabinetShelterRepo(db).historyOf(shelter.id)).find(
      (entry) => entry.kind === "city_changed",
    );
    expect(line).toEqual({
      kind: "city_changed",
      at: NOW,
      actor: { kind: "shelter_admin", shelterAdminId: ADMIN },
      from: cityId,
      to: otherCityId,
    });
  });

  it("the write itself is compare-and-set: a version lost in between moves nothing", async () => {
    const shelter = await shelterAt("accepted");
    const { atShelter } = await twoAnimals(shelter);
    const before = await kabinetShelterRepo(db).historyOf(shelter.id);
    const written = await kabinetShelterRepo(db).applyAuditedMany({
      shelterId: shelter.id,
      expectedVersion: shelter.version - 1,
      changes: [
        {
          kind: "city",
          publicLocation: { precision: "city", cityId: otherCityId, district: null },
        },
      ] as never,
      entries: [
        {
          id: crypto.randomUUID(),
          entry: {
            kind: "city_changed",
            at: NOW,
            actor: { kind: "shelter_admin", shelterAdminId: ADMIN },
            from: cityId,
            to: otherCityId,
          } as never,
        },
      ],
      now: NOW,
    });
    expect(written).toEqual({ kind: "conflict" });
    expect((await shelterRepo(db).findById(shelter.id))?.publicLocation.cityId).toBe(cityId);
    expect((await animalCities()).get(atShelter.id)).toBe(cityId);
    expect(await kabinetShelterRepo(db).historyOf(shelter.id)).toEqual(before);
  });

  it("a name and a city sent together are one write: one version, two lines", async () => {
    const shelter = await shelterAt("accepted");
    const before = await kabinetShelterRepo(db).historyOf(shelter.id);
    const result = await call<{ version?: number; displayName?: string; cityId?: string }>(
      shelter,
      "shelter.profile.updateIdentity",
      { displayName: "Хвостики", cityId: otherCityId, expectedVersion: shelter.version },
    );
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      version: shelter.version + 1,
      displayName: "Хвостики",
      cityId: otherCityId,
    });
    const after = await kabinetShelterRepo(db).historyOf(shelter.id);
    expect(after.length - before.length).toBe(2);
    expect(after.map((entry) => entry.kind)).toEqual(
      expect.arrayContaining(["display_name_changed", "city_changed"]),
    );
  });

  it("a stale version moves nothing: no city, no animal, no line", async () => {
    const shelter = await shelterAt("accepted");
    const { atShelter } = await twoAnimals(shelter);
    const before = await kabinetShelterRepo(db).historyOf(shelter.id);
    const result = await call<{ code?: string }>(shelter, "shelter.profile.updateIdentity", {
      cityId: otherCityId,
      expectedVersion: shelter.version + 1,
    });
    expect(result.status).toBe(409);
    expect(result.body.code).toBe("CONFLICT");
    expect((await shelterRepo(db).findById(shelter.id))?.publicLocation.cityId).toBe(cityId);
    expect((await animalCities()).get(atShelter.id)).toBe(cityId);
    expect(await kabinetShelterRepo(db).historyOf(shelter.id)).toEqual(before);
  });

  it("a city that doesn't exist is refused as the operator's address edit refuses it", async () => {
    const shelter = await shelterAt("accepted");
    const result = await call<{ code?: string; message?: string }>(
      shelter,
      "shelter.profile.updateIdentity",
      { cityId: "c9000000-0000-4000-8000-000000000009", expectedVersion: shelter.version },
    );
    expect(result.status).toBe(400);
    expect(result.body.message).toBe(UNKNOWN_CITY_MESSAGE);
    expect((await shelterRepo(db).findById(shelter.id))?.publicLocation.cityId).toBe(cityId);
  });

  it("the shelter's own history shows the move as its own, with both cities and no ids of people", async () => {
    const shelter = await shelterAt("accepted");
    await call(shelter, "shelter.profile.updateIdentity", {
      cityId: otherCityId,
      expectedVersion: shelter.version,
    });
    const history = await call<{ items: Record<string, unknown>[] }>(
      shelter,
      "shelter.history.list",
      { cursor: null, limit: 50 },
    );
    expect(history.status).toBe(200);
    expect(history.body.items.find((item) => item.kind === "city_changed")).toEqual({
      kind: "city_changed",
      at: NOW,
      actor: { kind: "shelter" },
      from: cityId,
      to: otherCityId,
    });
  });
});
