import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PlaceSearchResultSchema } from "@opika/contracts";
import { REGIONS } from "@opika/db";
import { cityRepo } from "@opika/db/repos";
import { makeCity, setupTestDatabase, truncateAll } from "@opika/db/test";
import type { ModeratorId, RegionId, ShelterAdminId, ShelterId } from "@opika/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { inMemoryRateLimiter, type RateLimiter } from "../api/rate-limit";
import { fromRpcBody, toRpcBody } from "../api/test-harness";
import { SHELTER_WRITE_POLICY } from "./access";
import type { KabinetPrincipal } from "./actor";
import { capturingInvitationSender } from "./email-senders";
import { capturingPasswordMail } from "./password-mail";
import { CITY_SEARCH_RATE_LIMITS } from "./rate-limits";
import { handleKabinetRpc } from "./rpc-route";
import { TEST_SESSION_COOKIE } from "./test-session-cookie";

/**
 * `shelter.cities.search` (owner, 2026-11-18) through the served route: the operator's search,
 * for a shelter's own kabinet and a support view, refused to anyone else, with its own budget.
 */

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;
beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());

const NOW = new Date("2026-11-18T10:00:00.000Z");
const SHELTER = "5b0e8a43-6a3c-4c5e-9d6d-1f2a3b4c5d6e" as ShelterId;
const ADMIN = "33333333-3333-4333-8333-333333333333" as ShelterAdminId;
const MOD = "0ec0ec0e-0000-4000-8000-000000000001" as ModeratorId;
const KYIV_OBLAST = REGIONS.find((r) => r.code === "UA32")?.id as RegionId;

const admin: KabinetPrincipal = {
  kind: "shelter_admin",
  shelterAdminId: ADMIN,
  shelterId: SHELTER,
};
const support: KabinetPrincipal = { kind: "support_view", moderatorId: MOD, shelterId: SHELTER };

beforeEach(async () => {
  await truncateAll(db);
  await cityRepo(db).insertMissing([
    makeCity({
      regionId: KYIV_OBLAST,
      name: { uk: "Бровари", en: { text: "Brovary", provenance: "machine" } },
    }),
  ]);
});

async function search(
  principal: KabinetPrincipal,
  opts: { citySearch?: RateLimiter; input?: unknown } = {},
) {
  const response = await handleKabinetRpc(
    new Request("http://localhost/api/kabinet/shelter/cities/search", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost",
        cookie: TEST_SESSION_COOKIE,
      },
      body: JSON.stringify(toRpcBody(opts.input ?? { query: "Бров", regionBias: null })),
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
        principal,
        userId: principal.kind === "anonymous" ? null : "user-1",
        db,
        cursorSecret: "test-cursor-secret",
      }),
      limiters: {
        perUser: inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 10_000 }),
        perIp: inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 10_000 }),
      },
      ip: "203.0.113.1",
      now: NOW,
      newId: () => crypto.randomUUID(),
      operatorDisplayName: "Олексій",
      locationPolicy: null,
      production: false,
      shelterWrites: SHELTER_WRITE_POLICY,
      citySearch: opts.citySearch ?? inMemoryRateLimiter(CITY_SEARCH_RATE_LIMITS.perUser),
      transactionalMail: null,
    },
  );
  const text = await response.text();
  let body: unknown = text;
  try {
    body = text ? fromRpcBody(JSON.parse(text)) : null;
  } catch {
    // A plain-text refusal: the status is the answer.
  }
  return { status: response.status, body };
}

describe("shelter.cities.search", () => {
  it.each([
    ["a shelter's admin", admin],
    ["a support view", support],
  ])("%s gets the operator's own answer", async (_who, principal) => {
    const result = await search(principal);
    expect(result.status).toBe(200);
    const parsed = PlaceSearchResultSchema.parse(result.body);
    expect(parsed.kind === "results" && parsed.places.map((p) => p.name)).toEqual(["Бровари"]);
  });

  it.each([
    ["anonymous", { kind: "anonymous" } as KabinetPrincipal, 401],
    ["no_role", { kind: "no_role" } as KabinetPrincipal, 403],
  ])("%s is refused (%i)", async (_who, principal, status) => {
    expect((await search(principal)).status).toBe(status);
  });

  it("a short query is too_short, as on the operator's side", async () => {
    const result = await search(admin, { input: { query: "Б", regionBias: null } });
    expect(result.body).toEqual({ kind: "too_short" });
  });

  it("spends its own per-person budget: past it, RATE_LIMITED", async () => {
    expect(CITY_SEARCH_RATE_LIMITS.perUser).toEqual({ windowMs: 60_000, maxRequests: 60 });
    const citySearch = inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 2 });
    expect((await search(admin, { citySearch })).status).toBe(200);
    expect((await search(admin, { citySearch })).status).toBe(200);
    const third = await search(admin, { citySearch });
    expect(third.status).toBe(429);
    expect((third.body as { code?: string }).code).toBe("RATE_LIMITED");
    // The operator in a support view has a budget of their own.
    expect((await search(support, { citySearch })).status).toBe(200);
  });

  it("the served route passes the shared limiter, never a per-request one", () => {
    const route = readFileSync(
      fileURLToPath(new URL("../app/api/kabinet/[...rpc]/route.ts", import.meta.url)),
      "utf8",
    );
    expect(route).toContain("citySearch: citySearchLimiter,");
    expect(route).toMatch(/import \{[^}]*citySearchLimiter[^}]*\} from "[./]*kabinet\/limiters"/);
  });
});
