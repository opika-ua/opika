import { cityRepo, kabinetShelterRepo, shelterRepo } from "@opika/db/repos";
import { makeCity, makeShelter, setupTestDatabase, truncateAll } from "@opika/db/test";
import type { ModeratorId, Shelter, ShelterAdminId, ShelterVerification } from "@opika/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { listFiltersOf } from "../features/kabinet/operator/list-params";
import {
  type OperatorPageDeps,
  operatorShelterListOf,
  operatorShelterOf,
} from "../features/kabinet/operator/pages";
import { SHELTER_WRITE_POLICY } from "./access";
import type { KabinetPrincipal } from "./actor";
import { capturingInvitationSender } from "./email-senders";

/**
 * The operator's pages read through the registry router in-process (R-UI 1,
 * plan §4): who sees what is the router's own access decision, against a
 * real database, for every principal. The pages turn `sign_in` into the
 * sign-in redirect and `not_found` into `notFound()`.
 */

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());

const NOW = new Date("2026-10-17T10:00:00.000Z");
const OPERATOR = "0ec0ec0e-0000-4000-8000-000000000001" as ModeratorId;
const ADMIN = "33333333-3333-4333-8333-333333333333" as ShelterAdminId;
let cityId: string;
let pending: Shelter;
let verified: Shelter;

const evidence = { items: [], submittedAt: NOW };
const PENDING: ShelterVerification = { status: "pending", submittedAt: NOW, evidence };
const VERIFIED: ShelterVerification = {
  status: "verified",
  verifiedAt: NOW,
  verifiedBy: OPERATOR,
  evidence,
};

async function insertShelter(displayName: string, verification: ShelterVerification) {
  const s = makeShelter({
    displayName,
    verification,
    publicLocation: { ...makeShelter().publicLocation, cityId } as never,
    exactAddress: { ...makeShelter().exactAddress, cityId } as never,
  });
  await shelterRepo(db).insert(s);
  return s;
}

beforeEach(async () => {
  await truncateAll(db);
  const city = makeCity({ name: { uk: "Бровари", en: { text: "Brovary", provenance: "human" } } });
  await cityRepo(db).insert(city);
  cityId = city.id;
  pending = await insertShelter("Хвостик", PENDING);
  verified = await insertShelter("Лапа", VERIFIED);
});

const deps = (overrides: Partial<OperatorPageDeps> = {}): OperatorPageDeps => ({
  db,
  now: NOW,
  newId: () => crypto.randomUUID(),
  invites: capturingInvitationSender(),
  linkBaseURL: "http://localhost",
  shelterWrites: SHELTER_WRITE_POLICY,
  cursorSecret: "test-cursor-secret",
  operatorDisplayName: "Олексій",
  production: false,
  ...overrides,
});

const operator: KabinetPrincipal = { kind: "super_admin", moderatorId: OPERATOR };
const NOT_THE_OPERATOR: [string, KabinetPrincipal][] = [
  ["a shelter admin", { kind: "shelter_admin", shelterAdminId: ADMIN, shelterId: "s" as never }],
  ["a support view", { kind: "support_view", moderatorId: OPERATOR, shelterId: "s" as never }],
  ["an account with no role", { kind: "no_role" }],
  ["conflicting roles", { kind: "conflicting_roles" }],
];
const noFilters = listFiltersOf({});

describe("S1 /kabinet/prytulky: who sees the list", () => {
  it("sends an anonymous visitor to sign in", async () => {
    expect(await operatorShelterListOf({ kind: "anonymous" }, deps(), noFilters)).toEqual({
      kind: "sign_in",
    });
  });

  it.each(NOT_THE_OPERATOR)("shows %s nothing (not found)", async (_who, principal) => {
    expect(await operatorShelterListOf(principal, deps(), noFilters)).toEqual({
      kind: "not_found",
    });
  });

  it("shows the operator every shelter, awaiting ones first, with counts and city names", async () => {
    const list = await operatorShelterListOf(operator, deps(), noFilters);
    if (list.kind !== "list") throw new Error(`not a list: ${list.kind}`);
    expect(list.page.items.map((row) => row.displayName)).toEqual(["Хвостик", "Лапа"]);
    expect(list.page.counts).toMatchObject({ pending: 1, verified: 1 });
    expect(list.cityNames[cityId]).toBe("Бровари");
    expect(list.page.items[0]).toMatchObject({
      admins: { joined: 0, invited: 0 },
      donationPending: false,
    });
  });

  it("is the operator's whatever the shelter write policy says (the registry never reads it)", async () => {
    const list = await operatorShelterListOf(
      operator,
      deps({ shelterWrites: SHELTER_WRITE_POLICY }),
      noFilters,
    );
    expect(list.kind).toBe("list");
  });

  it("passes the URL's search and status to the procedure (RU-T4)", async () => {
    const searched = await operatorShelterListOf(
      operator,
      deps(),
      listFiltersOf({ poshuk: "хвост" }),
    );
    if (searched.kind !== "list") throw new Error("not a list");
    expect(searched.page.items.map((row) => row.id)).toEqual([pending.id]);
    const filtered = await operatorShelterListOf(
      operator,
      deps(),
      listFiltersOf({ status: "verified" }),
    );
    if (filtered.kind !== "list") throw new Error("not a list");
    expect(filtered.page.items.map((row) => row.id)).toEqual([verified.id]);
    // The chips' counts follow the search, not the status filter.
    expect(filtered.page.counts).toMatchObject({ pending: 1, verified: 1 });
  });

  it("is load_failed, logged, when the list can't be read: the page offers a retry", async () => {
    const broken = new Proxy({} as OperatorPageDeps["db"], {
      get: () => {
        throw new Error("database unreachable");
      },
    });
    const log = vi.fn();
    expect(await operatorShelterListOf(operator, deps({ db: broken }), noFilters, log)).toEqual({
      kind: "load_failed",
    });
    expect(log).toHaveBeenCalledOnce();
  });

  it("never turns a refusal into load_failed", async () => {
    const log = vi.fn();
    expect(await operatorShelterListOf({ kind: "no_role" }, deps(), noFilters, log)).toEqual({
      kind: "not_found",
    });
    expect(log).not.toHaveBeenCalled();
  });
});

describe("S4 /kabinet/prytulky/[id]: who sees a shelter", () => {
  it("sends an anonymous visitor to sign in", async () => {
    expect(await operatorShelterOf({ kind: "anonymous" }, deps(), pending.id)).toEqual({
      kind: "sign_in",
    });
  });

  it.each(NOT_THE_OPERATOR)("shows %s nothing (not found)", async (_who, principal) => {
    expect(await operatorShelterOf(principal, deps(), pending.id)).toEqual({ kind: "not_found" });
  });

  it("shows a shelter admin nothing even for their own shelter", async () => {
    const own: KabinetPrincipal = {
      kind: "shelter_admin",
      shelterAdminId: ADMIN,
      shelterId: pending.id,
    };
    expect(await operatorShelterOf(own, deps(), pending.id)).toEqual({ kind: "not_found" });
  });

  it("is not found for an unknown shelter, the same answer as for a stranger", async () => {
    expect(await operatorShelterOf(operator, deps(), crypto.randomUUID() as never)).toEqual({
      kind: "not_found",
    });
  });

  it("shows the operator the record, its history's first page, its blocked addresses and who is reading", async () => {
    await kabinetShelterRepo(db).appendHistory({
      id: crypto.randomUUID(),
      shelterId: pending.id,
      entry: { kind: "shelter_created", at: NOW, moderatorId: OPERATOR, via: "registry" },
    });
    const page = await operatorShelterOf(operator, deps(), pending.id);
    if (page.kind !== "shelter") throw new Error(`not a shelter: ${page.kind}`);
    expect(page.view).toMatchObject({ id: pending.id, displayName: "Хвостик", admins: [] });
    expect(page.cityName).toBe("Бровари");
    expect(page.history.items.map((entry) => entry.kind)).toEqual(["shelter_created"]);
    expect(page.history.nextCursor).toBeNull();
    // No admin addresses: an honest empty "checked", without asking the provider.
    expect(page.blocked).toMatchObject({ kind: "checked", blocked: [] });
    expect(page.me).toBe(OPERATOR);
  });
});
