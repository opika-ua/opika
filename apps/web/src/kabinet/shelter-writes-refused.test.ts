import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { KabinetAccess } from "@opika/contracts";
import { animalRepo, cityRepo, kabinetShelterRepo, shelterRepo } from "@opika/db/repos";
import { makeAnimal, makeCity, makeShelter, setupTestDatabase, truncateAll } from "@opika/db/test";
import type { Animal, Shelter, ShelterAdminId } from "@opika/domain";
import { isLazy, isProcedure } from "@orpc/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { inMemoryRateLimiter } from "../api/rate-limit";
import { fromRpcBody, toRpcBody } from "../api/test-harness";
import { SHELTER_WRITE_POLICY } from "./access";
import type { KabinetPrincipal } from "./actor";
import { handleKabinetRpc, kabinetRouter } from "./rpc-route";

/**
 * KH-Q1: until K2/K3 ship, every `shelter.*` write refuses a shelter admin
 * with `SHELTER_WRITES_NOT_YET_AVAILABLE`, through the served router with the
 * served policy. The procedures are found by walking the router actually
 * mounted on `/api/kabinet/*` and reading the access each one declares, not
 * from a list written here, so a write added later is covered without an
 * edit to this file.
 */

type Leaf = { path: string; access: KabinetAccess | null };

function leaves(node: unknown, path: readonly string[] = []): Leaf[] {
  if (isProcedure(node)) {
    const meta = node["~orpc"].meta as { access?: KabinetAccess | null };
    return [{ path: path.join("."), access: meta.access ?? null }];
  }
  if (isLazy(node))
    throw new Error(`lazy node at ${path.join(".")}: the walk can't see through it`);
  if (node !== null && typeof node === "object" && !Array.isArray(node)) {
    return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
      leaves(value, [...path, key]),
    );
  }
  return [];
}

const served = leaves(kabinetRouter);
const shelterWrites = served
  .filter((leaf) => leaf.access?.surface === "shelter" && leaf.access.mode === "write")
  .map((leaf) => leaf.path);
const shelterReads = served
  .filter((leaf) => leaf.access?.surface === "shelter" && leaf.access.mode === "read")
  .map((leaf) => leaf.path);

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());

let shelter: Shelter;
let draft: Animal;
let asAdmin: KabinetPrincipal;

beforeEach(async () => {
  await truncateAll(db);
  const city = makeCity();
  await cityRepo(db).insert(city);
  shelter = makeShelter({ publicLocation: { ...makeShelter().publicLocation, cityId: city.id } });
  await shelterRepo(db).insert(shelter);
  draft = makeAnimal({ shelterId: shelter.id, listing: { kind: "draft" } });
  await animalRepo(db).insert(draft, city.id);
  asAdmin = {
    kind: "shelter_admin",
    shelterAdminId: "33333333-3333-4333-8333-333333333333" as ShelterAdminId,
    shelterId: shelter.id,
  };
});

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
    resolve: async () => ({ principal, userId: "user-admin", db, cursorSecret: "test-cursor" }),
    limiters: {
      perUser: inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 10_000 }),
      perIp: inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 10_000 }),
    },
    ip: "203.0.113.1",
    now: new Date(),
    newId: () => crypto.randomUUID(),
    operatorDisplayName: "Олексій",
    locationPolicy: null,
    production: false,
    // What the served route passes (pinned by the source scan below).
    shelterWrites: SHELTER_WRITE_POLICY,
  });
  const text = await response.text();
  return { status: response.status, body: text ? fromRpcBody(JSON.parse(text)) : null };
}

async function snapshot() {
  return {
    shelter: await shelterRepo(db).findById(shelter.id),
    history: await kabinetShelterRepo(db).historyOf(shelter.id),
    animals: (await animalRepo(db).findByShelterId(shelter.id)).map((a) => JSON.stringify(a)),
  };
}

describe("the walk finds the shelter writes (an empty walk can't pass)", () => {
  it("finds the thirteen shelter writes, confirm and update among them", () => {
    expect(shelterWrites).toHaveLength(13);
    expect(shelterWrites).toEqual(
      expect.arrayContaining([
        "shelter.animals.confirm",
        "shelter.animals.update",
        "shelter.profile.updateContact",
        "shelter.verification.requestReview",
      ]),
    );
  });

  it("and the four shelter reads, which stay open", () => {
    expect(shelterReads.sort()).toEqual(
      [
        "shelter.animals.byId",
        "shelter.animals.list",
        "shelter.history.list",
        "shelter.profile.get",
      ].sort(),
    );
  });
});

describe("every shelter write refuses a shelter admin until K2/K3 (KH-Q1)", () => {
  /**
   * Sent with a real animal id and an otherwise empty input: the refusal is
   * the access middleware's, ahead of input validation and of the handler.
   * Were validation first, these would answer 400, and the test would fail
   * rather than pass on the wrong reason.
   */
  it.each(shelterWrites)(
    "%s → 403 SHELTER_WRITES_NOT_YET_AVAILABLE, nothing written",
    async (path) => {
      const before = await snapshot();
      const result = await call(path, { animalId: draft.id }, asAdmin);
      expect(result.status).toBe(403);
      expect(result.body).toMatchObject({ code: "SHELTER_WRITES_NOT_YET_AVAILABLE" });
      expect(await snapshot()).toEqual(before);
    },
  );
});

describe("reads stay open to a shelter admin", () => {
  const INPUTS: Record<string, () => unknown> = {
    "shelter.profile.get": () => ({}),
    "shelter.history.list": () => ({ cursor: null }),
    "shelter.animals.list": () => ({ listing: null, cursor: null }),
    "shelter.animals.byId": () => ({ animalId: draft.id }),
  };

  it("has an input for every read the walk found", () => {
    expect(Object.keys(INPUTS).sort()).toEqual([...shelterReads].sort());
  });

  it.each(shelterReads)("%s → 200", async (path) => {
    const input = INPUTS[path];
    if (input === undefined) throw new Error(`no input for ${path}`);
    expect((await call(path, input(), asAdmin)).status).toBe(200);
  });
});

describe("a support view is refused writes exactly as before", () => {
  it.each(shelterWrites)("%s → 403 FORBIDDEN, not the not-yet code", async (path) => {
    const support: KabinetPrincipal = {
      kind: "support_view",
      moderatorId: "11111111-1111-4111-8111-111111111111" as never,
      shelterId: shelter.id,
    };
    const result = await call(path, { animalId: draft.id }, support);
    expect(result.status).toBe(403);
    expect(result.body).toMatchObject({ code: "FORBIDDEN" });
  });
});

/**
 * The policy reaches `decideAccess` through the request context, so the
 * served refusal holds only if every non-test place that sets it sets the
 * constant. Scanned, like `no-self-serve-yet.test.ts`: a `shelterWrites:`
 * with any other value outside a test file is the self-serve day arriving
 * by accident.
 */
describe("outside tests, shelterWrites is only ever SHELTER_WRITE_POLICY", () => {
  const REPO = resolve(fileURLToPath(import.meta.url), "../../../../..");
  const sources = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return name === "node_modules" ? [] : sources(path);
      return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
    });
  const assignments = sources(join(REPO, "apps/web/src")).flatMap((file) =>
    // Everything up to the next comma, semicolon or line end, so an object
    // literal (`{ kind: "open" }`) is captured whole rather than skipped.
    [...readFileSync(file, "utf8").matchAll(/\bshelterWrites\s*[?]?:\s*([^,;\n]+)/g)].map(
      (match) => `${relative(REPO, file).replaceAll("\\", "/")}: ${match[1]?.trim()}`,
    ),
  );

  it("sanity: the scan sees the served route and the home page set it", () => {
    expect(assignments).toEqual(
      expect.arrayContaining([
        "apps/web/src/app/api/kabinet/[...rpc]/route.ts: SHELTER_WRITE_POLICY",
        "apps/web/src/features/kabinet/home.ts: SHELTER_WRITE_POLICY",
      ]),
    );
  });

  it("every value is the constant, a type annotation, or the route's pass-through", () => {
    const ALLOWED = new Set(["SHELTER_WRITE_POLICY", "ShelterWritePolicy", "deps.shelterWrites"]);
    expect(assignments.filter((a) => !ALLOWED.has(a.split(": ")[1] ?? ""))).toEqual([]);
  });
});
