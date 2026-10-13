import { cityRepo, shelterRepo } from "@opika/db/repos";
import { makeCity, makeShelter, setupTestDatabase, truncateAll } from "@opika/db/test";
import type { ModeratorId, Shelter, ShelterAdminId } from "@opika/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { kabinetHomeOf } from "../features/kabinet/home";
import type { KabinetPrincipal } from "./actor";

/**
 * Who sees what at `/kabinet` (KS-Q1): decided by the API's own access matrix
 * for a shelter read, against a real database.
 */

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());

const OPERATOR = "0ec0ec0e-0000-4000-8000-000000000001" as ModeratorId;
let mine: Shelter;
let theirs: Shelter;

beforeEach(async () => {
  await truncateAll(db);
  const city = makeCity({ name: { uk: "Бровари", en: { text: "Brovary", provenance: "human" } } });
  await cityRepo(db).insert(city);
  mine = makeShelter({ publicLocation: { ...makeShelter().publicLocation, cityId: city.id } });
  theirs = makeShelter({
    displayName: "Інший притулок",
    publicLocation: { ...makeShelter().publicLocation, cityId: city.id },
  });
  await shelterRepo(db).insert(mine);
  await shelterRepo(db).insert(theirs);
});

const deps = () => ({ db, now: new Date(), newId: () => crypto.randomUUID() });

describe("kabinetHomeOf", () => {
  it("sends an anonymous visitor to sign in", async () => {
    expect(await kabinetHomeOf({ kind: "anonymous" }, deps())).toEqual({ kind: "sign_in" });
  });

  it.each([
    ["no role", { kind: "no_role" }],
    ["conflicting roles", { kind: "conflicting_roles" }],
    ["a super_admin outside support mode", { kind: "super_admin", moderatorId: OPERATOR }],
  ] as [string, KabinetPrincipal][])("shows %s nothing (not found)", async (_who, principal) => {
    expect(await kabinetHomeOf(principal, deps())).toEqual({ kind: "not_found" });
  });

  it("shows a shelter admin their own shelter, with its city, as an admin", async () => {
    const home = await kabinetHomeOf(
      {
        kind: "shelter_admin",
        shelterAdminId: "33333333-3333-4333-8333-333333333333" as ShelterAdminId,
        shelterId: mine.id,
      },
      deps(),
    );
    expect(home).toMatchObject({ kind: "shelter", viewer: "admin", cityName: "Бровари" });
    if (home.kind !== "shelter") throw new Error("unreachable");
    expect(home.view.id).toBe(mine.id);
    expect(home.view.displayName).toBe(mine.displayName);
  });

  it("shows a support view the shelter it entered, read-only, as support", async () => {
    const home = await kabinetHomeOf(
      { kind: "support_view", moderatorId: OPERATOR, shelterId: theirs.id },
      deps(),
    );
    expect(home).toMatchObject({ kind: "shelter", viewer: "support" });
    if (home.kind !== "shelter") throw new Error("unreachable");
    expect(home.view.id).toBe(theirs.id);
  });

  it("carries only the shelter view's own fields, nothing engagement-shaped", async () => {
    const home = await kabinetHomeOf(
      {
        kind: "shelter_admin",
        shelterAdminId: "33333333-3333-4333-8333-333333333333" as ShelterAdminId,
        shelterId: mine.id,
      },
      deps(),
    );
    if (home.kind !== "shelter") throw new Error("unreachable");
    expect(Object.keys(home).sort()).toEqual(["cityName", "kind", "view", "viewer"]);
    expect(Object.keys(home.view).sort()).toEqual([
      "contact",
      "description",
      "displayName",
      "donation",
      "exactAddress",
      "freshnessSentence",
      "id",
      "legalEntity",
      "pendingDonation",
      "verification",
      "version",
    ]);
  });
});
