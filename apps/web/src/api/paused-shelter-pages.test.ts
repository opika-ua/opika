import { animalRepo, cityRepo, revealRepo, shelterRepo } from "@opika/db/repos";
import { type AnimalFixtureOverrides, makeAnimal, makeCity, makeShelter } from "@opika/db/test";
import type { ShelterVerification } from "@opika/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestHarness, type TestHarness } from "./test-harness";

let h: TestHarness;
beforeAll(async () => {
  h = await createTestHarness();
});
afterAll(async () => {
  await h.cleanup();
});
beforeEach(async () => {
  await h.truncate();
});

const AT = new Date("2026-08-01T00:00:00Z");
const MOD = "00000000-0000-4000-8000-000000000000" as never;
const EVIDENCE = { items: [], submittedAt: AT };
const NOTE = "private pause note";
const verifiedFacts = { verifiedAt: AT, verifiedBy: MOD };
const pausedFacts = {
  ...verifiedFacts,
  pausedAt: AT,
  pausedBy: { kind: "shelter_admin", shelterAdminId: MOD },
  reason: { code: "relocation", note: NOTE },
} as const;

const STATES = {
  verified: { status: "verified", ...verifiedFacts, evidence: EVIDENCE },
  paused: { status: "paused", ...pausedFacts, evidence: EVIDENCE },
  suspendedFromPause: {
    status: "suspended",
    suspendedAt: AT,
    suspendedBy: MOD,
    reason: { code: "unresponsive", note: null },
    priorState: { status: "paused", ...pausedFacts },
    evidence: EVIDENCE,
  },
  suspended: {
    status: "suspended",
    suspendedAt: AT,
    suspendedBy: MOD,
    reason: { code: "unresponsive", note: null },
    priorState: { status: "verified", ...verifiedFacts },
    evidence: EVIDENCE,
  },
  pending: { status: "pending", submittedAt: AT, evidence: EVIDENCE },
  under_review: { status: "under_review", startedAt: AT, reviewerId: MOD, evidence: EVIDENCE },
  rejected: {
    status: "rejected",
    rejectedAt: AT,
    rejectedBy: MOD,
    reason: { code: "spam", note: null },
    evidence: EVIDENCE,
  },
} as const satisfies Record<string, ShelterVerification>;
type StateName = keyof typeof STATES;

async function seed(
  state: StateName,
  animalOverrides?: AnimalFixtureOverrides,
  donation: { url: string; provider: "monobank_jar" } | null = null,
) {
  const city = makeCity();
  await cityRepo(h.db).insert(city);
  const shelter = makeShelter({
    verification: STATES[state],
    donation,
    exactAddress: {
      line1: "вул. Тестова 1",
      line2: null,
      postalCode: "01001",
      cityId: city.id,
      district: null,
      coordinates: { lat: 50.45, lng: 30.52 },
    },
  });
  await shelterRepo(h.db).insert(shelter);
  const animal = makeAnimal({ shelterId: shelter.id, ...animalOverrides });
  await animalRepo(h.db).insert(animal, city.id);
  return { shelter, animal };
}

async function bootstrap(): Promise<{ cookie: string; adopterId: never }> {
  const res = await h.call("session.bootstrap", {});
  const cookie = h.extractSessionCookie(res.headers);
  if (!cookie) throw new Error("no session cookie");
  const again = await h.call("session.bootstrap", {}, { cookie });
  const adopter = (again.body as Record<string, unknown>).adopter as Record<string, unknown>;
  return { cookie, adopterId: adopter.id as never };
}

const code = (res: { body: unknown }) => (res.body as Record<string, unknown>).code;

describe("a paused shelter's pages stay reachable", () => {
  it("shelters.byId: 200 with the reason code for paused, open for verified", async () => {
    const paused = await seed("paused");
    const res = await h.call("shelters.byId", { shelterId: paused.shelter.id });
    expect(res.status).toBe(200);
    expect((res.body as { availability: unknown }).availability).toEqual({
      kind: "paused",
      reason: "relocation",
    });
    expect((res.body as { verification: string }).verification).toBe("verified");
    // The note, the actor and the date never leave the server.
    expect(res.raw).not.toContain(NOTE);
    expect(res.raw).not.toContain("pausedBy");
    expect(res.raw).not.toContain("pausedAt");

    const open = await seed("verified");
    const ok = await h.call("shelters.byId", { shelterId: open.shelter.id });
    expect((ok.body as { availability: unknown }).availability).toEqual({ kind: "open" });
  });

  it.each(["suspendedFromPause", "suspended", "pending", "under_review", "rejected"] as const)(
    "shelters.byId and animals.byId answer 404 for %s",
    async (state) => {
      const { shelter, animal } = await seed(state);
      const s = await h.call("shelters.byId", { shelterId: shelter.id });
      const a = await h.call("animals.byId", { animalId: animal.id });
      expect([s.status, code(s)]).toEqual([404, "NOT_FOUND"]);
      expect([a.status, code(a)]).toEqual([404, "NOT_FOUND"]);
    },
  );

  it("a shelter suspended mid-pause reads exactly like an unknown id (no oracle)", async () => {
    const { shelter } = await seed("suspendedFromPause");
    const suspended = await h.call("shelters.byId", { shelterId: shelter.id });
    const unknown = await h.call("shelters.byId", {
      shelterId: "99999999-9999-4999-8999-999999999999",
    });
    expect([suspended.status, suspended.body]).toEqual([unknown.status, unknown.body]);
  });

  it("animals.byId: a served animal of a paused shelter is 200 with availability paused", async () => {
    const { animal } = await seed("paused");
    const res = await h.call("animals.byId", { animalId: animal.id });
    expect(res.status).toBe(200);
    expect((res.body as { availability: unknown }).availability).toEqual({ kind: "paused" });
    expect(res.raw).not.toContain(NOTE);
  });

  it("animals.byId: an animal published during the pause (never served) stays 404", async () => {
    const { animal } = await seed("paused", { everServedAt: null });
    const res = await h.call("animals.byId", { animalId: animal.id });
    expect([res.status, code(res)]).toEqual([404, "NOT_FOUND"]);
  });

  it.each([
    ["draft", { listing: { kind: "draft" } }],
    ["adopted", { listing: { kind: "adopted", adoptedAt: AT } }],
    [
      "withdrawn",
      { listing: { kind: "withdrawn", reason: { code: "other", note: null }, withdrawnAt: AT } },
    ],
  ] as const)("animals.byId: a %s animal of a paused shelter stays 404", async (_n, overrides) => {
    const { animal } = await seed("paused", overrides as AnimalFixtureOverrides);
    const res = await h.call("animals.byId", { animalId: animal.id });
    expect(res.status).toBe(404);
  });

  it("an open shelter's animal reads availability open", async () => {
    const { animal } = await seed("verified");
    const res = await h.call("animals.byId", { animalId: animal.id });
    expect((res.body as { availability: unknown }).availability).toEqual({ kind: "open" });
  });
});

describe("animals.cardsByIds paused arm", () => {
  it("a served animal of a paused shelter is paused with its name; a never-served one is unavailable without a name", async () => {
    const served = await seed("paused");
    const unserved = await seed("paused", { everServedAt: null });
    const res = await h.call("animals.cardsByIds", {
      animalIds: [served.animal.id, unserved.animal.id],
    });
    expect((res.body as { items: unknown[] }).items).toEqual([
      { kind: "paused", animalId: served.animal.id, name: served.animal.name },
      { kind: "unavailable", animalId: unserved.animal.id, name: null },
    ]);
  });

  it("a shelter suspended mid-pause stays unavailable, not paused", async () => {
    const { animal } = await seed("suspendedFromPause");
    const res = await h.call("animals.cardsByIds", { animalIds: [animal.id] });
    expect((res.body as { items: unknown[] }).items).toEqual([
      { kind: "unavailable", animalId: animal.id, name: animal.name },
    ]);
  });
});

describe("animals.reveal on a paused shelter", () => {
  it("is refused with SHELTER_PAUSED (409), writes nothing and shows no contact", async () => {
    const { cookie, adopterId } = await bootstrap();
    const { animal, shelter } = await seed("paused");
    const res = await h.call("animals.reveal", { animalId: animal.id }, { cookie });
    expect([res.status, code(res)]).toEqual([409, "SHELTER_PAUSED"]);
    expect(res.raw).not.toContain(shelter.displayName);
    expect(await revealRepo(h.db).findByAdopterAndAnimal(adopterId, animal.id)).toBeNull();
  });

  it("a never-served animal's refusal is SHELTER_NOT_VISIBLE, so the pause is not told apart", async () => {
    const { cookie } = await bootstrap();
    const { animal } = await seed("paused", { everServedAt: null });
    const res = await h.call("animals.reveal", { animalId: animal.id }, { cookie });
    expect([res.status, code(res)]).toEqual([404, "SHELTER_NOT_VISIBLE"]);
  });

  it("a shelter suspended mid-pause answers SHELTER_NOT_VISIBLE, not SHELTER_PAUSED", async () => {
    const { cookie } = await bootstrap();
    const { animal } = await seed("suspendedFromPause");
    const res = await h.call("animals.reveal", { animalId: animal.id }, { cookie });
    expect([res.status, code(res)]).toEqual([404, "SHELTER_NOT_VISIBLE"]);
  });
});

describe("shelters.byId and the donation link", () => {
  const LINK = { url: "https://send.monobank.ua/jar/live", provider: "monobank_jar" } as const;

  it.each(["verified", "paused"] as const)("shows the link of a %s shelter", async (state) => {
    const { shelter } = await seed(state, undefined, LINK);
    const res = await h.call("shelters.byId", { shelterId: shelter.id });
    expect(res.status).toBe(200);
    expect((res.body as Record<string, unknown>).donation).toEqual(LINK);
  });

  it.each(["suspended", "suspendedFromPause", "pending", "under_review", "rejected"] as const)(
    "never serves the link of a %s shelter (the page itself is not found)",
    async (state) => {
      const { shelter } = await seed(state, undefined, LINK);
      const res = await h.call("shelters.byId", { shelterId: shelter.id });
      expect(res.status).toBe(404);
      expect(res.raw).not.toContain("monobank");
    },
  );
});
