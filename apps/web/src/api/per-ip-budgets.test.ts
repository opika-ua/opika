import { animalRepo, cityRepo, revealRepo, shelterRepo } from "@opika/db/repos";
import { makeAnimal, makeCity, makeReveal, makeShelter } from "@opika/db/test";
import type { AdopterId, CityId } from "@opika/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type PerIpBudgets, perIpBudgetSizesFor, perIpBudgetsOf } from "./per-ip-budgets";
import { inMemoryRateLimiter, type RateLimiter } from "./rate-limit";
import { createTestHarness, type TestHarness } from "./test-harness";

/**
 * Audit F1, the owner's numbers: an address mints at most 10 adopters a day,
 * and reveals at most 30 shelters a day across every adopter behind it, on top
 * of each adopter's own 30 (unchanged). Literals here, not the constants, so a
 * changed number fails a test. IPv6 is keyed on its /64 (F2).
 */
const MINTS_PER_DAY = 10;
const NEW_SHELTERS_PER_DAY = 30;

describe("the budget sizes", () => {
  it("are 10 mints and 30 new-shelter reveals a day, per address", () => {
    const made: { name: string; windowMs: number; maxRequests: number }[] = [];
    perIpBudgetsOf((opts) => {
      made.push(opts);
      return { check: async () => true };
    }, perIpBudgetSizesFor({}));
    expect(made).toEqual([
      { name: "adopter-mint", windowMs: 86_400_000, maxRequests: MINTS_PER_DAY },
      { name: "reveal-ip", windowMs: 86_400_000, maxRequests: NEW_SHELTERS_PER_DAY },
    ]);
  });

  it("the harness's lift works only off Vercel", () => {
    const lifted = perIpBudgetSizesFor({ HARNESS_LIFTS_PER_IP_BUDGETS: "1" });
    expect(lifted.adopterMints).toBeGreaterThan(10_000);
    expect(lifted.newShelterReveals).toBeGreaterThan(10_000);
    for (const vercel of [
      { VERCEL: "1", VERCEL_ENV: "production" },
      { VERCEL: "1", VERCEL_ENV: "preview" },
      { VERCEL_ENV: "production" },
      { VERCEL: "1" },
    ]) {
      expect(
        perIpBudgetSizesFor({ ...vercel, HARNESS_LIFTS_PER_IP_BUDGETS: "1" }),
        JSON.stringify(vercel),
      ).toEqual({ adopterMints: MINTS_PER_DAY, newShelterReveals: NEW_SHELTERS_PER_DAY });
    }
    expect(perIpBudgetSizesFor({ HARNESS_LIFTS_PER_IP_BUDGETS: "true" })).toEqual({
      adopterMints: MINTS_PER_DAY,
      newShelterReveals: NEW_SHELTERS_PER_DAY,
    });
  });
});

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

/** Fresh served-size budgets, in memory, per test. */
const servedSizeBudgets = (): PerIpBudgets =>
  perIpBudgetsOf(
    (opts) => inMemoryRateLimiter({ windowMs: opts.windowMs, maxRequests: opts.maxRequests }),
    perIpBudgetSizesFor({}),
  );

/** Counts the checks made against it; never refuses. */
const counting = (): RateLimiter & { checks: () => number } => {
  let checks = 0;
  return {
    checks: () => checks,
    async check() {
      checks += 1;
      return true;
    },
  };
};

function expectTooManyRequests(res: { status: number; body: unknown }) {
  expect(res.status).toBe(429);
  // The generic refusal the client reads as «Забагато запитів», never the
  // defined RATE_LIMITED, whose reveal copy blames this visitor.
  expect(res.body).toMatchObject({ code: "TOO_MANY_REQUESTS", defined: false });
}

describe("session.bootstrap: adopters minted per address", () => {
  const mint = (budgets: PerIpBudgets, ip: string, cookie?: string) =>
    h.call("session.bootstrap", {}, { budgets, ip, ...(cookie ? { cookie } : {}) });

  it("mints ten from one address, refuses the eleventh, and still mints for another address", async () => {
    const budgets = servedSizeBudgets();
    for (let i = 1; i <= MINTS_PER_DAY; i++) {
      const res = await mint(budgets, "198.51.100.7");
      expect(res.status, `mint ${i}`).toBe(200);
    }
    const eleventh = await mint(budgets, "198.51.100.7");
    expectTooManyRequests(eleventh);
    expect(h.extractSessionCookie(eleventh.headers)).toBeNull();
    expect((await mint(budgets, "198.51.100.8")).status).toBe(200);
  });

  it("counts an IPv6 /64 as one address", async () => {
    const budgets = servedSizeBudgets();
    for (let i = 1; i <= MINTS_PER_DAY; i++) {
      expect((await mint(budgets, `2001:db8:5:6::${i.toString(16)}`)).status, `mint ${i}`).toBe(
        200,
      );
    }
    expectTooManyRequests(await mint(budgets, "2001:db8:5:6:ffff:ffff:ffff:ffff"));
    expect((await mint(budgets, "2001:db8:5:7::1")).status).toBe(200);
  });

  it("returning an existing session spends nothing", async () => {
    const adopterMints = counting();
    const budgets = { ...servedSizeBudgets(), adopterMints };
    const first = await mint(budgets, "198.51.100.7");
    const cookie = h.extractSessionCookie(first.headers);
    expect(cookie).toBeTruthy();
    expect(adopterMints.checks()).toBe(1);
    for (let i = 0; i < 5; i++) {
      expect((await mint(budgets, "198.51.100.7", cookie ?? undefined)).status).toBe(200);
    }
    expect(adopterMints.checks()).toBe(1);
  });
});

describe("animals.reveal: new shelters revealed per address, across adopters", () => {
  let cityId: CityId;
  beforeEach(async () => {
    const city = makeCity();
    await cityRepo(h.db).insert(city);
    cityId = city.id;
  });

  async function shelterWithAnimals(count = 1) {
    const shelter = makeShelter({
      exactAddress: {
        line1: "вул. Тестова 1",
        line2: null,
        postalCode: "01001",
        cityId,
        district: null,
        coordinates: { lat: 50.45, lng: 30.52 },
      },
    });
    await shelterRepo(h.db).insert(shelter);
    const animals = [];
    for (let i = 0; i < count; i++) {
      const animal = makeAnimal({ shelterId: shelter.id });
      await animalRepo(h.db).insert(animal, cityId);
      animals.push(animal);
    }
    return { shelter, animals };
  }

  async function adopterOn(ip: string): Promise<{ cookie: string; adopterId: AdopterId }> {
    const res = await h.call("session.bootstrap", {}, { ip });
    const cookie = h.extractSessionCookie(res.headers);
    if (cookie === null) throw new Error("bootstrap set no cookie");
    const adopterId = (res.body as { adopter: { id: AdopterId } }).adopter.id;
    return { cookie, adopterId };
  }

  const reveal = (budgets: PerIpBudgets, ip: string, cookie: string, animalId: string) =>
    h.call("animals.reveal", { animalId }, { budgets, ip, cookie });

  it("thirty new shelters across two adopters on one address, then a refusal; re-reveals stay free", async () => {
    const budgets = servedSizeBudgets();
    const ip = "198.51.100.20";
    const a = await adopterOn(ip);
    const b = await adopterOn(ip);
    const shelters = [];
    for (let i = 0; i < NEW_SHELTERS_PER_DAY + 1; i++) shelters.push(await shelterWithAnimals(2));

    // A takes 20, B takes 10: neither is near its own 30, the address is at 30.
    for (const [i, s] of shelters.slice(0, 20).entries()) {
      const res = await reveal(budgets, ip, a.cookie, s.animals[0]?.id ?? "");
      expect(res.status, `A, shelter ${i + 1}`).toBe(200);
    }
    for (const [i, s] of shelters.slice(20, 30).entries()) {
      const res = await reveal(budgets, ip, b.cookie, s.animals[0]?.id ?? "");
      expect(res.status, `B, shelter ${i + 1}`).toBe(200);
    }

    const thirtyFirst = shelters[30]?.animals[0]?.id ?? "";
    expectTooManyRequests(await reveal(budgets, ip, b.cookie, thirtyFirst));

    // Free for the adopter, so free for the address: the same animal again,
    // and another animal of a shelter this adopter already revealed.
    expect((await reveal(budgets, ip, a.cookie, shelters[0]?.animals[0]?.id ?? "")).status).toBe(
      200,
    );
    expect((await reveal(budgets, ip, a.cookie, shelters[0]?.animals[1]?.id ?? "")).status).toBe(
      200,
    );

    // Another address is untouched by this one's spending.
    const c = await adopterOn("198.51.100.21");
    expect((await reveal(budgets, "198.51.100.21", c.cookie, thirtyFirst)).status).toBe(200);
  });

  it("a reveal the per-adopter budget refuses spends nothing per address", async () => {
    const newShelterReveals = counting();
    const budgets = { ...servedSizeBudgets(), newShelterReveals };
    const ip = "198.51.100.30";
    const a = await adopterOn(ip);
    const reveals = revealRepo(h.db);
    for (let i = 0; i < 30; i++) {
      const { shelter, animals } = await shelterWithAnimals();
      const animal = animals[0];
      if (animal === undefined) throw new Error("no animal");
      await reveals.insert(
        makeReveal({
          adopterId: a.adopterId,
          animalId: animal.id,
          shelterId: shelter.id,
          revealedAt: new Date("2026-08-01T11:00:00Z"),
        }),
      );
    }
    const { animals } = await shelterWithAnimals();
    const res = await reveal(budgets, ip, a.cookie, animals[0]?.id ?? "");
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({ code: "RATE_LIMITED", defined: true });
    expect(newShelterReveals.checks()).toBe(0);
  });
});
