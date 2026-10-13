import {
  type Animal,
  donationProviderOf,
  type ModeratorId,
  publicLocationOf,
  type ShelterAdminId,
  type ShelterHistoryEntry,
  testOnlyLocationPolicy,
} from "@opika/domain";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { animalRepo } from "../src/repos/animal-repo";
import { cityRepo } from "../src/repos/city-repo";
import { kabinetShelterRepo } from "../src/repos/kabinet-shelter-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import { animals } from "../src/schema/animals";
import {
  makeAnimal,
  makeCity,
  makeShelter,
  setupTestDatabase,
  truncateAll,
} from "../src/test-utils/index";

/** The operator's audited writes (registry PR): several entries per write, and the new change kinds. */

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());

const NOW = new Date("2026-10-13T10:00:00.000Z");
const MOD = "mod-1" as ModeratorId;
const policy = testOnlyLocationPolicy("repo-test");
let homeCity: string;
let otherCity: string;

beforeEach(async () => {
  await truncateAll(db);
  const home = makeCity();
  const other = makeCity();
  await cityRepo(db).insert(home);
  await cityRepo(db).insert(other);
  homeCity = home.id;
  otherCity = other.id;
});

async function shelter() {
  const s = makeShelter({
    publicLocation: { ...makeShelter().publicLocation, cityId: homeCity } as never,
  });
  await shelterRepo(db).insert(s);
  return s;
}

const repo = () => kabinetShelterRepo(db);
const history = (shelterId: string) => repo().historyOf(shelterId as never);
const cityOfAnimal = async (id: string) =>
  (
    await db
      .select({ cityId: animals.cityId })
      .from(animals)
      .where(eq(animals.id, id as never))
  )[0]?.cityId;

describe("kabinetShelterRepo.applyAuditedMany", () => {
  it("writes every change with one version bump and one history row per entry", async () => {
    const s = await shelter();
    const description = { uk: "Новий опис", en: null };
    const contact = { primary: { kind: "telegram", handle: "lapa" }, additional: [] } as const;
    const actor = { kind: "moderator", moderatorId: MOD } as const;
    const entries: { id: string; entry: ShelterHistoryEntry }[] = [
      {
        id: "h1",
        entry: { kind: "contact_changed", at: NOW, actor, previous: s.contact, next: contact },
      },
      {
        id: "h2",
        entry: {
          kind: "description_changed",
          at: NOW,
          actor,
          previous: s.description,
          next: description,
        },
      },
    ];
    const result = await repo().applyAuditedMany({
      shelterId: s.id,
      expectedVersion: 0,
      changes: [
        { kind: "contact", contact },
        { kind: "description", description },
      ],
      entries,
      now: NOW,
    });
    expect(result).toEqual({ kind: "ok" });
    const after = await shelterRepo(db).findById(s.id);
    expect(after).toMatchObject({ contact, description, version: 1 });
    expect((await history(s.id)).map((entry) => entry.kind).sort()).toEqual([
      "contact_changed",
      "description_changed",
    ]);
  });

  it("writes nothing and records nothing when the version moved", async () => {
    const s = await shelter();
    const result = await repo().applyAuditedMany({
      shelterId: s.id,
      expectedVersion: 7,
      changes: [{ kind: "description", description: { uk: "Ні", en: null } }],
      entries: [
        {
          id: "h1",
          entry: {
            kind: "description_changed",
            at: NOW,
            actor: { kind: "moderator", moderatorId: MOD },
            previous: s.description,
            next: { uk: "Ні", en: null },
          },
        },
      ],
      now: NOW,
    });
    expect(result).toEqual({ kind: "conflict" });
    expect((await shelterRepo(db).findById(s.id))?.description).toEqual(s.description);
    expect(await history(s.id)).toEqual([]);
  });

  it("refuses a write with no history entry", async () => {
    const s = await shelter();
    await expect(
      repo().applyAuditedMany({
        shelterId: s.id,
        expectedVersion: 0,
        changes: [],
        entries: [],
        now: NOW,
      }),
    ).rejects.toThrow("at least one entry");
  });
});

describe("an address change (S4, verified data)", () => {
  async function move(expectedVersion: number) {
    const s = await shelter();
    const atShelter = makeAnimal({ shelterId: s.id });
    const fostered: Animal = makeAnimal({
      shelterId: s.id,
      publicLocation: { precision: "city", cityId: homeCity as never, district: null },
    });
    await animalRepo(db).insert(atShelter, homeCity as never);
    await animalRepo(db).insert(fostered, homeCity as never);
    const exactAddress = {
      ...s.exactAddress,
      cityId: otherCity as never,
      coordinates: { lat: 49.84, lng: 24.03 },
    };
    const publicLocation = publicLocationOf(s.id, exactAddress, policy);
    const result = await repo().applyAuditedMany({
      shelterId: s.id,
      expectedVersion,
      changes: [{ kind: "exact_address", exactAddress, publicLocation }],
      entries: [
        {
          id: "h1",
          entry: {
            kind: "verified_data_changed",
            at: NOW,
            moderatorId: MOD,
            change: { field: "exact_address", previous: s.exactAddress, next: exactAddress },
          },
        },
      ],
      now: NOW,
    });
    return { s, atShelter, fostered, exactAddress, publicLocation, result };
  }

  it("moves the address, the fuzzed pin, the city, and every animal still at the shelter", async () => {
    const { s, atShelter, fostered, exactAddress, publicLocation, result } = await move(0);
    expect(result).toEqual({ kind: "ok" });
    const after = await shelterRepo(db).findById(s.id);
    expect(after?.exactAddress).toEqual(exactAddress);
    expect(after?.publicLocation).toEqual(publicLocation);
    expect(await cityOfAnimal(atShelter.id)).toBe(otherCity);
    // A fostered animal is discoverable in its foster city, not the shelter's.
    expect(await cityOfAnimal(fostered.id)).toBe(homeCity);
  });

  it("moves no animal when the shelter write loses its compare-and-set", async () => {
    const { s, atShelter, result } = await move(3);
    expect(result).toEqual({ kind: "conflict" });
    expect((await shelterRepo(db).findById(s.id))?.publicLocation.cityId).toBe(homeCity);
    expect(await cityOfAnimal(atShelter.id)).toBe(homeCity);
  });
});

describe("legal entity and donation approval columns", () => {
  it("round-trips a legal-entity change", async () => {
    const s = await shelter();
    const legalEntity = { ...s.legalEntity, legalName: "ГО Нова назва" } as typeof s.legalEntity;
    await repo().applyAudited({
      shelterId: s.id,
      expectedVersion: 0,
      change: { kind: "legal_entity", legalEntity },
      entry: {
        kind: "verified_data_changed",
        at: NOW,
        moderatorId: MOD,
        change: { field: "legal_entity", previous: s.legalEntity, next: legalEntity },
      },
      historyId: "h1",
      now: NOW,
    });
    expect((await shelterRepo(db).findById(s.id))?.legalEntity).toEqual(legalEntity);
  });

  it("makes an approved link live and clears the proposal", async () => {
    const url = "https://send.monobank.ua/jar/abc";
    const link = { url, provider: donationProviderOf(url) };
    const s = makeShelter({
      publicLocation: { ...makeShelter().publicLocation, cityId: homeCity } as never,
      pendingDonation: {
        link,
        proposedAt: NOW,
        proposedBy: "admin-1" as ShelterAdminId,
      },
    });
    await shelterRepo(db).insert(s);
    await repo().applyAudited({
      shelterId: s.id,
      expectedVersion: 0,
      change: { kind: "donation_approved", donation: link },
      entry: {
        kind: "donation_decided",
        at: NOW,
        moderatorId: MOD,
        decision: "approved",
        link,
        previousLive: null,
      },
      historyId: "h1",
      now: NOW,
    });
    const after = await shelterRepo(db).findById(s.id);
    expect(after?.donation).toEqual(link);
    expect(after?.pendingDonation).toBeNull();
  });
});
