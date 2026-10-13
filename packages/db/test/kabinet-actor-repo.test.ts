import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cityRepo } from "../src/repos/city-repo";
import { kabinetActorRepo } from "../src/repos/kabinet-actor-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import { authMember, authOrganization, authUser, superAdmins } from "../src/schema/auth";
import { shelters } from "../src/schema/shelters";
import { makeCity, makeShelter, setupTestDatabase, truncateAll } from "../src/test-utils/index";

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());
beforeEach(async () => truncateAll(db));

const AT = new Date("2026-10-13T00:00:00.000Z");
const USER = "aaaaaaaa-0000-4000-8000-00000000000a";

async function user(id = USER) {
  await db.insert(authUser).values({
    id,
    name: "Олена",
    email: `${id}@example.org`,
    emailVerified: true,
    createdAt: AT,
    updatedAt: AT,
  });
}

/** A shelter linked to a fresh organization, as an accepted invite will leave it. */
async function shelterWithOrg(orgId: string) {
  const city = makeCity();
  await cityRepo(db).insert(city);
  // The city comes through `publicLocation`; `makeShelter` derives the address from it.
  const shelter = makeShelter({
    publicLocation: { ...makeShelter().publicLocation, cityId: city.id },
  });
  await shelterRepo(db).insert(shelter);
  await db.insert(authOrganization).values({ id: orgId, name: orgId, slug: orgId, createdAt: AT });
  await db.update(shelters).set({ organizationId: orgId }).where(eq(shelters.id, shelter.id));
  return shelter;
}

describe("kabinetActorRepo.roleOf", () => {
  it("a user with neither role has no role", async () => {
    await user();
    expect(await kabinetActorRepo(db).roleOf(USER)).toEqual({ kind: "no_role" });
  });

  it("a super_admin is a moderator, by user id", async () => {
    await user();
    await db.insert(superAdmins).values({ id: "g1", userId: USER, grantedAt: AT });
    expect(await kabinetActorRepo(db).roleOf(USER)).toEqual({
      kind: "super_admin",
      moderatorId: USER,
    });
  });

  it("a member of a shelter's organization administers that shelter", async () => {
    await user();
    const shelter = await shelterWithOrg("org-a");
    await db
      .insert(authMember)
      .values({ id: "m1", organizationId: "org-a", userId: USER, role: "owner", createdAt: AT });
    expect(await kabinetActorRepo(db).roleOf(USER)).toEqual({
      kind: "shelter_admin",
      shelterAdminId: USER,
      shelterId: shelter.id,
    });
  });

  /** An organization no shelter points at (an invite half-done) grants nothing. */
  it("membership in an organization with no shelter is no role", async () => {
    await user();
    await db.insert(authOrganization).values({ id: "org-x", name: "x", slug: "x", createdAt: AT });
    await db
      .insert(authMember)
      .values({ id: "m1", organizationId: "org-x", userId: USER, role: "owner", createdAt: AT });
    expect(await kabinetActorRepo(db).roleOf(USER)).toEqual({ kind: "no_role" });
  });

  it("a user who is both is refused, not resolved to either", async () => {
    await user();
    await shelterWithOrg("org-a");
    await db
      .insert(authMember)
      .values({ id: "m1", organizationId: "org-a", userId: USER, role: "owner", createdAt: AT });
    await db.insert(superAdmins).values({ id: "g1", userId: USER, grantedAt: AT });
    expect(await kabinetActorRepo(db).roleOf(USER)).toEqual({ kind: "conflicting_roles" });
  });

  /** HS-T2: revoking sets `revoked_at`, and a revoked grant is no role. */
  it("a revoked grant is no role", async () => {
    await user();
    await db.insert(superAdmins).values({
      id: "g1",
      userId: USER,
      grantedAt: AT,
      revokedAt: new Date("2026-10-14T00:00:00.000Z"),
    });
    expect(await kabinetActorRepo(db).roleOf(USER)).toEqual({ kind: "no_role" });
  });

  it("an unknown user id has no role", async () => {
    expect(await kabinetActorRepo(db).roleOf("bbbbbbbb-0000-4000-8000-00000000000b")).toEqual({
      kind: "no_role",
    });
  });
});
