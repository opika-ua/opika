import { PlaceSearchResultSchema } from "@opika/contracts";
import { REGIONS } from "@opika/db";
import { cityRepo } from "@opika/db/repos";
import { authUser } from "@opika/db/schema";
import { makeCity, setupTestDatabase, truncateAll } from "@opika/db/test";
import { type ModeratorId, type RegionId, testOnlyLocationPolicy } from "@opika/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { inMemoryRateLimiter } from "../api/rate-limit";
import { fromRpcBody, toRpcBody } from "../api/test-harness";
import { SHELTER_WRITE_POLICY } from "./access";
import type { KabinetPrincipal } from "./actor";
import { capturingInvitationSender } from "./email-senders";
import { capturingPasswordMail } from "./password-mail";
import { handleKabinetRpc } from "./rpc-route";
import { TEST_SESSION_COOKIE } from "./test-session-cookie";

/**
 * `registry.cities.search` through the served kabinet route: what it returns, what it never
 * returns, and that it sits behind the same limits and checks as every other kabinet call.
 */

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;
beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());

const NOW = new Date("2026-10-29T10:00:00.000Z");
const OPERATOR = "0ec0ec0e-0000-4000-8000-000000000001";
const asOperator: KabinetPrincipal = { kind: "super_admin", moderatorId: OPERATOR as ModeratorId };
const region = (code: string) => REGIONS.find((r) => r.code === code)?.id as RegionId;
const KYIV_OBLAST = region("UA32");
const CRIMEA = region("UA01");
const SEVASTOPOL = region("UA85");

const place = (uk: string, en: string, overrides: Parameters<typeof makeCity>[0] = {}) =>
  makeCity({
    regionId: KYIV_OBLAST,
    name: { uk, en: { text: en, provenance: "machine" } },
    ...overrides,
  });

beforeEach(async () => {
  await truncateAll(db);
  await db.insert(authUser).values({
    id: OPERATOR,
    name: "Оператор",
    email: "op@example.org",
    emailVerified: true,
    createdAt: NOW,
    updatedAt: NOW,
  });
  await cityRepo(db).insertMissing([
    place("Бровари", "Brovary", { district: { uk: "Броварський район" } }),
    place("Миколаївка", "Mykolaivka", {
      kind: "village",
      district: { uk: "Березівський район" },
      hromada: { uk: "Березівська міська громада" },
      nameScope: "shared_in_district",
    }),
    place("Левітанівка", "Levitanivka", { regionId: CRIMEA, kind: "village" }),
    place("Севастополь", "Sevastopol", { regionId: SEVASTOPOL, kind: "special_status_city" }),
  ]);
});

type Limiters = Parameters<typeof handleKabinetRpc>[1]["limiters"];
async function search(
  input: unknown,
  opts: { principal?: KabinetPrincipal | null; origin?: string | null; limiters?: Limiters } = {},
) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    cookie: TEST_SESSION_COOKIE,
  };
  if (opts.origin !== null) headers.origin = opts.origin ?? "http://localhost";
  const response = await handleKabinetRpc(
    new Request("http://localhost/api/kabinet/registry/cities/search", {
      method: "POST",
      headers,
      body: JSON.stringify(toRpcBody(input)),
    }),
    {
      availability: {
        kind: "available",
        passwordMail: capturingPasswordMail(),
        sender: { send: async () => {} },
        invites: capturingInvitationSender(),
        secret: "x",
        baseURL: "http://localhost",
      },
      resolve: async () => ({
        principal: opts.principal ?? asOperator,
        userId: OPERATOR,
        db,
        cursorSecret: "test-cursor-secret",
      }),
      limiters: opts.limiters ?? {
        perUser: inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 10_000 }),
        perIp: inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 10_000 }),
      },
      ip: "203.0.113.1",
      now: NOW,
      newId: () => crypto.randomUUID(),
      operatorDisplayName: "Олексій",
      locationPolicy: testOnlyLocationPolicy("cities-search"),
      production: false,
      shelterWrites: SHELTER_WRITE_POLICY,
    },
  );
  const text = await response.text();
  let body: unknown = text;
  try {
    body = text ? fromRpcBody(JSON.parse(text)) : null;
  } catch {
    // A plain-text refusal ("Forbidden", "Too Many Requests"): the status is the answer.
  }
  return { status: response.status, body };
}

describe("registry.cities.search", () => {
  it("answers the places that match, with the pieces a picker prints and nothing else", async () => {
    const { status, body } = await search({ query: "Бровар", regionBias: null });
    expect(status).toBe(200);
    const parsed = PlaceSearchResultSchema.parse(body);
    expect(parsed).toMatchObject({
      kind: "results",
      places: [
        {
          name: "Бровари",
          kind: "city",
          district: "Броварський район",
          hromada: null,
          region: { ukShort: "Київська обл." },
        },
      ],
    });
    const first = parsed.kind === "results" ? parsed.places[0] : undefined;
    expect(Object.keys(first ?? {}).sort()).toEqual(
      ["district", "hromada", "id", "kind", "name", "region", "slug"].sort(),
    );
  });

  it("names the hromada only where the name is shared inside a raion", async () => {
    const { body } = await search({ query: "Миколаївка", regionBias: null });
    expect(body).toMatchObject({
      places: [{ hromada: "Березівська міська громада", district: "Березівський район" }],
    });
  });

  it("returns Crimea and Sevastopol like any other region, however the name is typed", async () => {
    for (const query of ["Левітанівка", "Левіт", "levitanivka", "Севастополь", "sevast"]) {
      const { status, body } = await search({ query, regionBias: null });
      expect(status).toBe(200);
      expect((body as { places: unknown[] }).places.length, query).toBeGreaterThan(0);
    }
  });

  it("answers too_short for a query with fewer than two characters left", async () => {
    for (const query of ["", " ", "а", "м. "]) {
      expect((await search({ query, regionBias: null })).body).toEqual({ kind: "too_short" });
    }
  });

  it("caps the query at 80 characters and refuses unknown keys", async () => {
    expect((await search({ query: "а".repeat(81), regionBias: null })).status).toBe(400);
    expect((await search({ query: "а".repeat(80), regionBias: null })).status).toBe(200);
    expect((await search({ query: "Бровари", regionBias: null, limit: 500 })).status).toBe(400);
    expect((await search({ query: "Бровари", regionBias: "not-a-uuid" })).status).toBe(400);
  });

  it("caps the answer at 20 places", async () => {
    await cityRepo(db).insertMissing(
      Array.from({ length: 30 }, (_, i) => place(`Тестове${i}`, `Testove${i}`)),
    );
    const { body } = await search({ query: "Тестове", regionBias: null });
    expect(PlaceSearchResultSchema.parse(body)).toMatchObject({ kind: "results" });
    expect((body as { places: unknown[] }).places).toHaveLength(20);
  });

  it("ranks the bias oblast first and never filters by it", async () => {
    await cityRepo(db).insertMissing([
      place("Іванівка", "Ivanivka", { kind: "village", regionId: region("UA46") }),
      place("Іванівка", "Ivanivka", { kind: "village", regionId: region("UA51") }),
    ]);
    const biased = await search({ query: "Іванівка", regionBias: region("UA51") });
    const places = (biased.body as { places: { region: { id: string } }[] }).places;
    expect(places).toHaveLength(2);
    expect(places[0]?.region.id).toBe(region("UA51"));
  });

  it("refuses everyone but the operator, and a call from another origin", async () => {
    const shelterAdmin: KabinetPrincipal = {
      kind: "shelter_admin",
      shelterAdminId: "33333333-3333-4333-8333-333333333333" as never,
      shelterId: "44444444-4444-4444-8444-444444444444" as never,
    };
    expect(
      (await search({ query: "Бровари", regionBias: null }, { principal: shelterAdmin })).status,
    ).toBe(403);
    expect(
      (
        await search(
          { query: "Бровари", regionBias: null },
          { principal: { kind: "anonymous" } as never },
        )
      ).status,
    ).toBeGreaterThanOrEqual(401);
    expect(
      (await search({ query: "Бровари", regionBias: null }, { origin: "https://evil.example" }))
        .status,
    ).toBe(403);
    expect((await search({ query: "Бровари", regionBias: null }, { origin: null })).status).toBe(
      403,
    );
  });

  it("is limited per user and per IP like every kabinet call", async () => {
    const calls = async (limiters: Limiters) => {
      const statuses: number[] = [];
      for (let i = 0; i < 3; i++) {
        statuses.push((await search({ query: "Бровари", regionBias: null }, { limiters })).status);
      }
      return statuses;
    };
    const wide = () => inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 10_000 });
    const narrow = () => inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 2 });
    expect(await calls({ perUser: narrow(), perIp: wide() })).toEqual([200, 200, 429]);
    expect(await calls({ perUser: wide(), perIp: narrow() })).toEqual([200, 200, 429]);
  });
});
