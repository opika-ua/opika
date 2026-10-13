import { cityRepo, kabinetShelterRepo, shelterRepo } from "@opika/db/repos";
import { authInvitation, authUser, supportSessions } from "@opika/db/schema";
import { makeCity, makeShelter, setupTestDatabase, truncateAll } from "@opika/db/test";
import type { ModeratorId, Shelter, ShelterAdminId } from "@opika/domain";
import { testOnlyLocationPolicy } from "@opika/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { KabinetPrincipal } from "../kabinet/actor";
import { handleKabinetRpc } from "../kabinet/rpc-route";
import { inMemoryRateLimiter } from "./rate-limit";
import { fromRpcBody, toRpcBody } from "./test-harness";

/**
 * The registry is the operator's alone (access matrix, addendum §1): every
 * `registry.*` procedure refuses every principal but a super_admin, through
 * the served router, with a valid input, and writes nothing while refusing.
 * `session.exitSupport` is the mirror: only a support view may call it.
 * Written out by hand, never read back from the contract's meta.
 */

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());

const OPERATOR = "0ec0ec0e-0000-4000-8000-000000000001" as ModeratorId;
let target: Shelter;

beforeEach(async () => {
  await truncateAll(db);
  const city = makeCity();
  await cityRepo(db).insert(city);
  target = makeShelter({
    publicLocation: { ...makeShelter().publicLocation, cityId: city.id } as never,
  });
  await shelterRepo(db).insert(target);
});

const limiters = {
  perUser: inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 10_000 }),
  perIp: inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 10_000 }),
};

async function call(path: string, input: unknown, principal: KabinetPrincipal) {
  const request = new Request(`http://localhost/api/kabinet/${path.replaceAll(".", "/")}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(toRpcBody(input)),
  });
  const response = await handleKabinetRpc(request, {
    availability: {
      kind: "available",
      sender: { send: async () => {} },
      secret: "x",
      baseURL: "http://localhost",
    },
    resolve: async () => ({
      principal,
      userId: principal.kind === "anonymous" ? null : "user-1",
      db,
      cursorSecret: "test-cursor-secret",
    }),
    limiters,
    ip: "203.0.113.1",
    now: new Date(),
    newId: () => crypto.randomUUID(),
    operatorDisplayName: "Олексій",
    locationPolicy: testOnlyLocationPolicy("access-test"),
    production: false,
  });
  const text = await response.text();
  return { status: response.status, body: text ? fromRpcBody(JSON.parse(text)) : null };
}

/** Every registry procedure with an input that would pass validation. */
const REGISTRY_CALLS = (shelter: Shelter): [string, unknown][] => {
  const ref = { shelterId: shelter.id };
  const adminRef = { shelterId: shelter.id, adminId: "33333333-3333-4333-8333-333333333333" };
  return [
    ["registry.shelters.list", { search: null, status: null, cursor: null, limit: 10 }],
    ["registry.shelters.byId", ref],
    [
      "registry.shelters.create",
      {
        displayName: "Нова",
        description: shelter.description,
        legalEntity: shelter.legalEntity,
        exactAddress: shelter.exactAddress,
        contact: shelter.contact,
        freshnessSentence: null,
        evidence: [],
        firstAdmin: { name: "Олена", email: "olena@example.org" },
      },
    ],
    [
      "registry.shelters.updateVerifiedData",
      { ...ref, expectedVersion: 0, change: { field: "legal_entity", next: shelter.legalEntity } },
    ],
    [
      "registry.shelters.updateProfile",
      { ...ref, expectedVersion: 0, description: { uk: "Нове", en: null } },
    ],
    ["registry.verification.startReview", ref],
    ["registry.verification.approve", ref],
    ["registry.verification.reinstate", ref],
    ["registry.verification.reject", { ...ref, reason: { code: "spam", note: "Ні" } }],
    ["registry.verification.suspend", { ...ref, reason: { code: "other", note: "Ні" } }],
    ["registry.verification.resubmit", { ...ref, evidence: [] }],
    ["registry.donation.approve", ref],
    ["registry.donation.reject", ref],
    ["registry.admins.invite", { ...ref, name: "Олена", email: "olena@example.org" }],
    ["registry.admins.resendInvite", adminRef],
    ["registry.admins.remove", adminRef],
    ["registry.history.list", { ...ref, cursor: null, limit: 10 }],
    ["registry.support.enter", ref],
  ];
};

const NOT_OPERATORS: [string, KabinetPrincipal, number][] = [
  ["anonymous", { kind: "anonymous" }, 401],
  ["no_role", { kind: "no_role" }, 403],
  ["conflicting_roles", { kind: "conflicting_roles" }, 403],
  [
    "shelter_admin",
    {
      kind: "shelter_admin",
      shelterAdminId: "33333333-3333-4333-8333-333333333333" as ShelterAdminId,
      shelterId: "" as never,
    },
    403,
  ],
  ["support_view", { kind: "support_view", moderatorId: OPERATOR, shelterId: "" as never }, 403],
];

describe("registry.* refuses everyone but a super_admin", () => {
  it("covers all eighteen registry procedures (not vacuous)", () => {
    expect(REGISTRY_CALLS(makeShelter())).toHaveLength(18);
  });

  for (const [who, principal, status] of NOT_OPERATORS) {
    it(`${who}: every registry procedure answers ${status} and writes nothing`, async () => {
      // A shelter admin or support view of the very shelter in question is refused all the same.
      const scoped =
        principal.kind === "shelter_admin" || principal.kind === "support_view"
          ? { ...principal, shelterId: target.id }
          : principal;
      const statuses: Record<string, number> = {};
      for (const [path, input] of REGISTRY_CALLS(target)) {
        statuses[path] = (await call(path, input, scoped)).status;
      }
      expect(statuses).toEqual(
        Object.fromEntries(REGISTRY_CALLS(target).map(([path]) => [path, status])),
      );
      expect(await shelterRepo(db).findById(target.id)).toEqual(target);
      expect(await kabinetShelterRepo(db).historyOf(target.id)).toEqual([]);
      // Nor anything a refused registry call could have started elsewhere.
      expect(await db.select().from(supportSessions)).toEqual([]);
      expect(await db.select().from(authInvitation)).toEqual([]);
      expect(await db.select().from(authUser)).toEqual([]);
    });
  }

  it("super_admin: none of them is refused for access", async () => {
    for (const [path, input] of REGISTRY_CALLS(target)) {
      const { status } = await call(path, input, { kind: "super_admin", moderatorId: OPERATOR });
      expect([401, 403], path).not.toContain(status);
    }
  });
});

describe("session.exitSupport is a support view's only", () => {
  it.each([
    ["anonymous", { kind: "anonymous" }, 401],
    ["super_admin outside support", { kind: "super_admin", moderatorId: OPERATOR }, 403],
    ["no_role", { kind: "no_role" }, 403],
  ] as [string, KabinetPrincipal, number][])("%s → %i", async (_who, principal, status) => {
    expect((await call("session.exitSupport", {}, principal)).status).toBe(status);
  });

  it("a shelter admin → 403", async () => {
    const asAdmin: KabinetPrincipal = {
      kind: "shelter_admin",
      shelterAdminId: "33333333-3333-4333-8333-333333333333" as ShelterAdminId,
      shelterId: target.id,
    };
    expect((await call("session.exitSupport", {}, asAdmin)).status).toBe(403);
  });

  it("a support view → 200", async () => {
    const asSupport: KabinetPrincipal = {
      kind: "support_view",
      moderatorId: OPERATOR,
      shelterId: target.id,
    };
    expect((await call("session.exitSupport", {}, asSupport)).status).toBe(200);
  });
});
