import { animalRepo, cityRepo, shelterRepo } from "@opika/db/repos";
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
import { type AnimalPageTarget, kabinetAnimalPageOf } from "../features/kabinet/animal-page";
import { SHELTER_WRITE_POLICY, type ShelterWritePolicy, shelterWritePolicyOf } from "./access";
import type { KabinetPrincipal } from "./actor";
import { capturingInvitationSender } from "./email-senders";

/**
 * Who sees what at `/kabinet/tvaryny/nova` and `/kabinet/tvaryny/[id]` (K3):
 * decided by the served procedures' own access middleware and the served
 * write policy, against a real database, as `/kabinet`'s `home-page.test.ts`.
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
const allowlistMine = () => shelterWritePolicyOf({ KABINET_WRITE_ALLOWLIST: mine.id });
const NEW: AnimalPageTarget = { kind: "new" };
const existing = (animalId: string): AnimalPageTarget => ({ kind: "existing", animalId });

describe("kabinetAnimalPageOf: who reaches the K3 pages", () => {
  it("sends an anonymous visitor to sign in, on either page", async () => {
    const draft = makeDraftAnimal({ shelterId: mine.id });
    await animalRepo(db).insert(draft, cityId);
    for (const target of [NEW, existing(draft.id)]) {
      expect(await kabinetAnimalPageOf({ kind: "anonymous" }, target, deps())).toEqual({
        kind: "sign_in",
      });
    }
  });

  it.each([
    ["no role", { kind: "no_role" }],
    ["conflicting roles", { kind: "conflicting_roles" }],
    ["a super_admin outside support mode", { kind: "super_admin", moderatorId: OPERATOR }],
  ] as [string, KabinetPrincipal][])(
    "shows %s nothing on either page (404), even under the allowlist",
    async (_who, principal) => {
      const draft = makeDraftAnimal({ shelterId: mine.id });
      await animalRepo(db).insert(draft, cityId);
      for (const target of [NEW, existing(draft.id)]) {
        for (const policy of [SHELTER_WRITE_POLICY, allowlistMine()]) {
          expect(await kabinetAnimalPageOf(principal, target, deps(policy))).toEqual({
            kind: "not_found",
          });
        }
      }
    },
  );
});

describe("kabinetAnimalPageOf: /nova (create)", () => {
  it("the allowlisted shelter's admin gets the empty form, writes open by the allowlist", async () => {
    const page = await kabinetAnimalPageOf(adminOf(mine), NEW, deps(allowlistMine()));
    expect(page).toMatchObject({
      kind: "form",
      view: null,
      viewer: "admin",
      editing: { kind: "open", grantedBy: "allowlist" },
    });
  });

  it("404 for a shelter whose writes are refused: nothing to show read-only on a create page", async () => {
    expect(await kabinetAnimalPageOf(adminOf(mine), NEW, deps())).toEqual({ kind: "not_found" });
    expect(await kabinetAnimalPageOf(adminOf(theirs), NEW, deps(allowlistMine()))).toEqual({
      kind: "not_found",
    });
  });

  it("404 for the support view, even of the allowlisted shelter (support never writes)", async () => {
    expect(await kabinetAnimalPageOf(supportOf(mine), NEW, deps(allowlistMine()))).toEqual({
      kind: "not_found",
    });
  });
});

describe("kabinetAnimalPageOf: /[id] (edit)", () => {
  it("the allowlisted admin's own draft: the form, open, with the draft's unanswered facts null", async () => {
    const draft = makeDraftAnimal({ shelterId: mine.id, name: "Ластівка" });
    await animalRepo(db).insert(draft, cityId);
    const page = await kabinetAnimalPageOf(
      adminOf(mine),
      existing(draft.id),
      deps(allowlistMine()),
    );
    expect(page).toMatchObject({ kind: "form", editing: { kind: "open" }, viewer: "admin" });
    if (page.kind !== "form" || page.view === null) throw new Error("unreachable");
    expect(page.view).toMatchObject({
      id: draft.id,
      name: "Ластівка",
      listing: { kind: "draft" },
      size: null,
      age: null,
      description: null,
    });
  });

  it("read-only for an admin outside the allowlist, and for the support view", async () => {
    const animal = makeAnimal({ shelterId: theirs.id });
    await animalRepo(db).insert(animal, cityId);
    expect(
      await kabinetAnimalPageOf(adminOf(theirs), existing(animal.id), deps(allowlistMine())),
    ).toMatchObject({ kind: "form", editing: { kind: "read_only" }, viewer: "admin" });
    expect(
      await kabinetAnimalPageOf(supportOf(theirs), existing(animal.id), deps(allowlistMine())),
    ).toMatchObject({ kind: "form", editing: { kind: "read_only" }, viewer: "support" });
  });

  it("another shelter's animal, an unknown id and a non-id all get the one `missing` answer", async () => {
    const other = makeAnimal({ shelterId: theirs.id });
    await animalRepo(db).insert(other, cityId);
    for (const animalId of [other.id, crypto.randomUUID(), "not-an-id"]) {
      expect(
        await kabinetAnimalPageOf(adminOf(mine), existing(animalId), deps(allowlistMine())),
        animalId,
      ).toMatchObject({ kind: "missing", viewer: "admin" });
    }
  });

  it("says whether the shelter's cards are shown: verified yes, paused no", async () => {
    const verified = mine.verification;
    if (verified.status !== "verified") throw new Error("the fixture shelter is verified");
    const paused = makeShelter({
      publicLocation: mine.publicLocation,
      verification: {
        status: "paused",
        verifiedAt: verified.verifiedAt,
        verifiedBy: verified.verifiedBy,
        evidence: verified.evidence,
        pausedAt: new Date(),
        pausedBy: { kind: "shelter_admin", shelterAdminId: ADMIN },
        reason: { code: "relocation", note: null },
      },
    });
    await shelterRepo(db).insert(paused);
    const visibility = async (shelter: Shelter) => {
      const animal = makeAnimal({ shelterId: shelter.id });
      await animalRepo(db).insert(animal, cityId);
      const page = await kabinetAnimalPageOf(adminOf(shelter), existing(animal.id), deps());
      if (page.kind !== "form") throw new Error(`expected the form, got ${page.kind}`);
      return page.shelterVisible;
    };
    expect(await visibility(mine)).toBe(true);
    expect(await visibility(paused)).toBe(false);
  });
});
