import type { KabinetAccess } from "@opika/contracts";
import { animalRepo, cityRepo, kabinetShelterRepo, shelterRepo } from "@opika/db/repos";
import { makeAnimal, makeCity, makeShelter, setupTestDatabase, truncateAll } from "@opika/db/test";
import type { Animal, Shelter, ShelterAdminId } from "@opika/domain";
import { isLazy, isProcedure } from "@orpc/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inMemoryRateLimiter } from "../api/rate-limit";
import { fromRpcBody, toRpcBody } from "../api/test-harness";
import { SHELTER_WRITE_POLICY } from "./access";
import type { KabinetPrincipal } from "./actor";
import { capturingInvitationSender } from "./email-senders";
import { capturingPasswordMail } from "./password-mail";
import { handleKabinetRpc, kabinetRouter } from "./rpc-route";

/**
 * PR 6 of the K milestone: every `shelter.*` write is open to the shelter's
 * own admin (K-Q3, Oleksii, verbatim: "K-Q3: live immediately. PR 6 rewrites
 * commitment #6."), through the served router with the served policy, and
 * still closed to everyone else. The procedures are found by walking the
 * router actually mounted on `/api/kabinet/*` and reading the access each one
 * declares, not from a list written here, so a write added later is held to
 * the same assertions automatically. The count is pinned too
 * (`toHaveLength(18)`), as a tripwire: a new write fails it, and the edit
 * that bumps it is where someone confirms who may call it.
 *
 * Until PR 6 this file was `shelter-writes-refused.test.ts` and pinned the
 * opposite (KH-Q1's refusal); the name changed with the policy (PC-T3).
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
    headers: { "content-type": "application/json", origin: "http://localhost" },
    body: JSON.stringify(toRpcBody(input)),
  });
  const response = await handleKabinetRpc(request, {
    availability: {
      kind: "available",
      passwordMail: capturingPasswordMail(),
      sender: { send: async () => {} },
      invites: capturingInvitationSender(),
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
    // What the served route passes (pinned by `allowlist-removed.test.ts`).
    shelterWrites: SHELTER_WRITE_POLICY,
  });
  const text = await response.text();
  return { status: response.status, body: text ? parsedBody(text) : null };
}

/** RPC bodies are JSON; oRPC's answer to a thrown non-ORPCError is too. */
function parsedBody(text: string): unknown {
  try {
    return fromRpcBody(JSON.parse(text));
  } catch {
    return text;
  }
}

async function snapshot() {
  return {
    shelter: await shelterRepo(db).findById(shelter.id),
    history: await kabinetShelterRepo(db).historyOf(shelter.id),
    animals: (await animalRepo(db).findByShelterId(shelter.id)).map((a) => JSON.stringify(a)),
  };
}

describe("the walk finds the shelter writes (an empty walk can't pass)", () => {
  it("finds the eighteen shelter writes, confirm, update, the photo writes and the logo writes among them", () => {
    expect(shelterWrites).toHaveLength(18);
    expect(shelterWrites).toEqual(
      expect.arrayContaining([
        "shelter.animals.confirm",
        "shelter.animals.update",
        "shelter.photos.add",
        "shelter.photos.reorder",
        "shelter.photos.remove",
        "shelter.logo.set",
        "shelter.logo.remove",
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

describe("every shelter write passes access for the shelter's own admin (PR 6)", () => {
  /**
   * Sent with a real animal id and an otherwise empty input. Access is the
   * middleware's, ahead of input validation and the handler: before PR 6
   * every one of these answered 403. Now each reaches validation or its
   * handler, so it answers 200 or that layer's own error, never an access
   * refusal (401, 403).
   */
  it.each(shelterWrites)("%s → past access (not 401, not 403)", async (path) => {
    const result = await call(path, { animalId: draft.id }, asAdmin);
    expect([401, 403], `${path}: ${JSON.stringify(result.body)}`).not.toContain(result.status);
  });

  /**
   * A real write, with NODE_ENV and VERCEL_ENV set as on a production
   * deployment: nothing read from the environment closes it (the K-Q17
   * allowlist and the test-only policy are gone).
   */
  it("on a production deployment, the shelter's admin writes for real (200, stored)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("RATE_LIMIT_KEY_SECRET", "test-rate-limit-key-secret-0123456789abcdef");
    try {
      const result = await call(
        "shelter.profile.proposeDonation",
        { url: "https://example.org/give" },
        asAdmin,
      );
      expect(result.status).toBe(200);
      expect((await shelterRepo(db).findById(shelter.id))?.pendingDonation?.link.url).toBe(
        "https://example.org/give",
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

/**
 * Another shelter's admin, aiming every write at this shelter's animal,
 * changes nothing of this shelter's: the scope's shelter is the caller's own,
 * never the input's (`decideAccess`). `api/kabinet-cross-tenant.test.ts`
 * drives each animal write with a valid input to its FORBIDDEN answer.
 */
describe("another shelter's admin changes nothing here (PR 6)", () => {
  it.each(shelterWrites)(
    "%s → this shelter, its history and its animals unchanged",
    async (path) => {
      const city = (await cityRepo(db).findById(shelter.publicLocation.cityId)) ?? makeCity();
      const other = makeShelter({
        publicLocation: { ...makeShelter().publicLocation, cityId: city.id },
      });
      await shelterRepo(db).insert(other);
      const otherAdmin: KabinetPrincipal = {
        kind: "shelter_admin",
        shelterAdminId: "44444444-4444-4444-8444-444444444444" as ShelterAdminId,
        shelterId: other.id,
      };
      const before = await snapshot();
      const result = await call(path, { animalId: draft.id }, otherAdmin);
      expect(result.status, path).not.toBe(200);
      expect(await snapshot()).toEqual(before);
    },
  );
});

describe("reads stay open to a shelter admin", () => {
  const INPUTS: Record<string, () => unknown> = {
    "shelter.profile.get": () => ({}),
    "shelter.history.list": () => ({ cursor: null }),
    "shelter.animals.list": () => ({ filter: { kind: "all" }, cursor: null }),
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

describe("a support view is refused every write (S5)", () => {
  it.each(shelterWrites)("%s → 403 FORBIDDEN, nothing written", async (path) => {
    const support: KabinetPrincipal = {
      kind: "support_view",
      moderatorId: "11111111-1111-4111-8111-111111111111" as never,
      shelterId: shelter.id,
    };
    const before = await snapshot();
    const result = await call(path, { animalId: draft.id }, support);
    expect(result.status).toBe(403);
    expect(result.body).toMatchObject({ code: "FORBIDDEN" });
    expect(await snapshot()).toEqual(before);
  });
});
