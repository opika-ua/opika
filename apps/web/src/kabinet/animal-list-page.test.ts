import { animalRepo, cityRepo, shelterRepo } from "@opika/db/repos";
import { authUser, shelters } from "@opika/db/schema";
import {
  makeAnimal,
  makeCity,
  makeDraftAnimal,
  makeShelter,
  setupTestDatabase,
  truncateAll,
} from "@opika/db/test";
import type { CityId, ModeratorId, Shelter, ShelterAdminId } from "@opika/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { kabinetAnimalListPageOf } from "../features/kabinet/animal-list/animal-list-page";
import { applicationBannersOf } from "../features/kabinet/application/application-banners";
import { SHELTER_WRITE_POLICY, type ShelterWritePolicy } from "./access";
import type { KabinetPrincipal } from "./actor";
import { capturingInvitationSender } from "./email-senders";

/**
 * Who sees what at `/kabinet/tvaryny` (K2): decided by the served procedures'
 * own access middleware and the served write policy, against a real
 * database, as K3's `animal-page.test.ts`. P1 (K2 sheet, accepted in his K2
 * answers, §13): the list is for a shelter whose writes are open and for the
 * support view; every other shelter, and anyone without a shelter (a
 * super_admin outside support mode included), gets a 404.
 */

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());

const OPERATOR = "0ec0ec0e-0000-4000-8000-000000000001" as ModeratorId;
const ADMIN = "33333333-3333-4333-8333-333333333333" as ShelterAdminId;
let mine: Shelter;
let theirs: Shelter;
let cityId: CityId;

beforeEach(async () => {
  await truncateAll(db);
  const city = makeCity();
  await cityRepo(db).insert(city);
  cityId = city.id;
  const located = { ...makeShelter().publicLocation, cityId: city.id };
  mine = makeShelter({ publicLocation: located });
  theirs = makeShelter({ displayName: "Інший притулок", publicLocation: located });
  await shelterRepo(db).insert(mine);
  await shelterRepo(db).insert(theirs);
});

const deps = (shelterWrites: ShelterWritePolicy = SHELTER_WRITE_POLICY) => ({
  db,
  now: new Date(),
  newId: () => crypto.randomUUID(),
  invites: capturingInvitationSender(),
  linkBaseURL: "http://localhost",
  shelterWrites,
  cursorSecret: "test-cursor-secret",
  operatorDisplayName: "Олексій",
});

const adminOf = (shelter: Shelter): KabinetPrincipal => ({
  kind: "shelter_admin",
  shelterAdminId: ADMIN,
  shelterId: shelter.id,
});
const supportOf = (shelter: Shelter): KabinetPrincipal => ({
  kind: "support_view",
  moderatorId: OPERATOR,
  shelterId: shelter.id,
});
describe("kabinetAnimalListPageOf: who reaches /kabinet/tvaryny", () => {
  it("sends an anonymous visitor to sign in", async () => {
    expect(await kabinetAnimalListPageOf({ kind: "anonymous" }, deps())).toEqual({
      kind: "sign_in",
    });
  });

  it.each([
    ["no role", { kind: "no_role" }],
    ["conflicting roles", { kind: "conflicting_roles" }],
    ["a super_admin outside support mode", { kind: "super_admin", moderatorId: OPERATOR }],
  ] as [string, KabinetPrincipal][])(
    "shows %s nothing (404), with writes open",
    async (_who, principal) => {
      for (const policy of [SHELTER_WRITE_POLICY]) {
        expect(await kabinetAnimalListPageOf(principal, deps(policy))).toEqual({
          kind: "not_found",
        });
      }
    },
  );

  it("a shelter's admin gets its own list, and no other shelter's (the served policy)", async () => {
    const draft = makeDraftAnimal({ shelterId: mine.id, name: "Ластівка" });
    const listed = makeAnimal({ shelterId: mine.id, name: "Рекс" });
    const elsewhere = makeAnimal({ shelterId: theirs.id, name: "Чужий" });
    for (const animal of [draft, listed, elsewhere]) await animalRepo(db).insert(animal, cityId);

    const page = await kabinetAnimalListPageOf(adminOf(mine), deps());
    expect(page).toMatchObject({
      kind: "list",
      viewer: "admin",
      editing: { kind: "open" },
      shelter: { id: mine.id },
    });
    if (page.kind !== "list") throw new Error("unreachable");
    expect(page.first.items.map((row) => row.name).sort()).toEqual(["Ластівка", "Рекс"]);
    expect(page.first.counts).toEqual({
      draft: 1,
      published: 1,
      reserved: 0,
      adopted: 0,
      withdrawn: 0,
    });
  });

  it("the support view gets the shelter it entered, read-only", async () => {
    await animalRepo(db).insert(makeAnimal({ shelterId: theirs.id, name: "Чужий" }), cityId);
    await animalRepo(db).insert(makeAnimal({ shelterId: mine.id, name: "Рекс" }), cityId);
    for (const policy of [SHELTER_WRITE_POLICY]) {
      const page = await kabinetAnimalListPageOf(supportOf(theirs), deps(policy));
      expect(page).toMatchObject({
        kind: "list",
        viewer: "support",
        editing: { kind: "read_only" },
        shelter: { id: theirs.id },
      });
      if (page.kind !== "list") throw new Error("unreachable");
      expect(page.first.items.map((row) => row.name)).toEqual(["Чужий"]);
    }
  });
});

/**
 * The application banners on `/kabinet/tvaryny` for a self-registered shelter, from the database
 * up (owner review of #532): an application inserted as one, its registrant's `email_verified`
 * deciding «Підтвердіть email».
 */
describe("kabinetAnimalListPageOf: a self-registered application's banners", () => {
  async function application(emailVerified: boolean) {
    // The only shelter, so the registrant write below needs no filter.
    await truncateAll(db);
    const city = makeCity();
    await cityRepo(db).insert(city);
    cityId = city.id;
    const userId = crypto.randomUUID();
    await db.insert(authUser).values({
      id: userId,
      name: "Олена",
      email: "olena@example.org",
      emailVerified,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const at = new Date();
    const shelter = makeShelter({
      publicLocation: { ...makeShelter().publicLocation, cityId },
      verification: {
        status: "application",
        appliedAt: at,
        evidence: { items: [], submittedAt: at },
      },
    });
    await shelterRepo(db).insert(shelter);
    await db.update(shelters).set({ registrantUserId: userId });
    return shelter;
  }

  const bannersOf = async (shelter: Shelter) => {
    const page = await kabinetAnimalListPageOf(adminOf(shelter), deps());
    if (page.kind !== "list") throw new Error(`no list: ${page.kind}`);
    return applicationBannersOf(page.shelter, page.first.counts, page.viewer, {
      email: "olena@example.org",
      approvedDismissed: false,
      selfRegistration: true,
    }).map((banner) => banner.kind);
  };

  it("unconfirmed: «Перевіряю…» and «Підтвердіть email»", async () => {
    expect(await bannersOf(await application(false))).toEqual(["pending", "confirm_email"]);
  });

  it("confirmed: «Перевіряю…» only", async () => {
    expect(await bannersOf(await application(true))).toEqual(["pending"]);
  });
});
