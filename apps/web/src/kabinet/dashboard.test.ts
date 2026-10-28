import { animalRepo, cityRepo, shelterRepo } from "@opika/db/repos";
import { makeAnimal, makeCity, makeShelter, setupTestDatabase, truncateAll } from "@opika/db/test";
import type { CityId, ModeratorId, Shelter, ShelterAdminId } from "@opika/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { kabinetDashboardOf } from "../features/kabinet/dashboard";
import { SHELTER_WRITE_POLICY, type ShelterWritePolicy } from "./access";
import type { KabinetPrincipal } from "./actor";
import { capturingInvitationSender } from "./email-senders";

/**
 * Головна (kabinet redesign Phase 2 PR 1): who sees what, decided the same
 * way `home-page.test.ts` already tests `kabinetHomeOf` - against a real
 * database, through the served procedures `shelter.profile.get` and
 * `shelter.animals.list`, not a reimplementation of either.
 */

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());

const OPERATOR = "0ec0ec0e-0000-4000-8000-000000000001" as ModeratorId;
let mine: Shelter;
let cityId: CityId;

beforeEach(async () => {
  await truncateAll(db);
  const city = makeCity({ name: { uk: "Бровари", en: { text: "Brovary", provenance: "human" } } });
  await cityRepo(db).insert(city);
  cityId = city.id;
  mine = makeShelter({ publicLocation: { ...makeShelter().publicLocation, cityId: city.id } });
  await shelterRepo(db).insert(mine);
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

const ADMIN = "33333333-3333-4333-8333-333333333333" as ShelterAdminId;
/** `mine` exists only once `beforeEach` has run, so this reads it lazily, per test. */
const adminPrincipal = (): KabinetPrincipal => ({
  kind: "shelter_admin",
  shelterAdminId: ADMIN,
  shelterId: mine.id,
});

describe("kabinetDashboardOf", () => {
  it("sends an anonymous visitor to sign in", async () => {
    expect(await kabinetDashboardOf({ kind: "anonymous" }, deps())).toEqual({ kind: "sign_in" });
  });

  it.each([
    ["no role", { kind: "no_role" }],
    ["conflicting roles", { kind: "conflicting_roles" }],
  ] as [string, KabinetPrincipal][])("shows %s nothing (not found)", async (_who, principal) => {
    expect(await kabinetDashboardOf(principal, deps())).toEqual({ kind: "not_found" });
  });

  it("sends the operator, a super_admin outside support mode, to their own screens", async () => {
    const operator: KabinetPrincipal = { kind: "super_admin", moderatorId: OPERATOR };
    expect(await kabinetDashboardOf(operator, deps())).toEqual({ kind: "operator" });
  });

  it("shows a shelter admin their own shelter, with no drafts and nothing stale", async () => {
    const dashboard = await kabinetDashboardOf(adminPrincipal(), deps());
    expect(dashboard).toMatchObject({
      kind: "shelter",
      viewer: "admin",
      draftCount: 0,
      staleCount: 0,
      animalListShown: true,
      canWrite: true,
    });
    if (dashboard.kind !== "shelter") throw new Error("unreachable");
    expect(dashboard.view.id).toBe(mine.id);
  });

  it("counts drafts and stale cards the same way K2's own list does", async () => {
    const now = new Date();
    const day = 24 * 60 * 60 * 1000;
    await animalRepo(db).insert(
      makeAnimal({ shelterId: mine.id, name: "Чернетка", listing: { kind: "draft" } }),
      cityId,
    );
    await animalRepo(db).insert(
      makeAnimal({
        shelterId: mine.id,
        name: "Застаріла",
        listing: {
          kind: "published",
          publishedAt: new Date("2026-01-01"),
          confirmedAt: new Date(now.getTime() - 31 * day),
          undoable: null,
        },
      }),
      cityId,
    );
    const dashboard = await kabinetDashboardOf(adminPrincipal(), { ...deps(), now });
    expect(dashboard).toMatchObject({ kind: "shelter", draftCount: 1, staleCount: 1 });
  });

  it("read-only for a support view, which still sees the list (P1)", async () => {
    const dashboard = await kabinetDashboardOf(
      { kind: "support_view", moderatorId: OPERATOR, shelterId: mine.id },
      deps(),
    );
    expect(dashboard).toMatchObject({
      kind: "shelter",
      viewer: "support",
      animalListShown: true,
      canWrite: false,
    });
  });

  it("carries no field a page component couldn't render: no engagement, no stray key", async () => {
    const dashboard = await kabinetDashboardOf(adminPrincipal(), deps());
    if (dashboard.kind !== "shelter") throw new Error("unreachable");
    expect(Object.keys(dashboard).sort()).toEqual(
      ["animalListShown", "canWrite", "draftCount", "kind", "staleCount", "view", "viewer"].sort(),
    );
  });
});
