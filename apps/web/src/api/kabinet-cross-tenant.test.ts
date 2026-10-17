import { shelterKabinetContract } from "@opika/contracts";
import { animalRepo, cityRepo, kabinetShelterRepo, shelterRepo } from "@opika/db/repos";
import { makeAnimal, makeCity, makeShelter, setupTestDatabase, truncateAll } from "@opika/db/test";
import type { Animal, Shelter, ShelterAdminId } from "@opika/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { KabinetPrincipal } from "../kabinet/actor";
import { capturingInvitationSender } from "../kabinet/email-senders";
import { handleKabinetRpc } from "../kabinet/rpc-route";
import { inMemoryRateLimiter } from "./rate-limit";
import { fromRpcBody, toRpcBody } from "./test-harness";

/**
 * S3-Q2 (Oleksii): shelter A's member acting on shelter B's animal or shelter
 * gets FORBIDDEN, for every shelter-scoped procedure, confirm and undoConfirm
 * included. PR #85 merges only with all sixteen as real tests over real
 * handlers (S3-Q3), so these go through the served router: a real `Request`,
 * the access middleware, the handler, real Postgres. Only identity is
 * injected, because who is signed in is Better Auth's job and has its own
 * tests (src/kabinet/auth.test.ts).
 *
 * Two kinds of procedure, because their inputs differ:
 * - **The six that take an `animalId`** can name B's animal. That is
 *   FORBIDDEN, and B's animal is left exactly as it was.
 * - **The ten that take no id** (profile, verification, list, createDraft)
 *   can't name B at all: `shelterId` is in no `shelter.*` input and comes
 *   from the actor. FORBIDDEN is impossible there by construction. Inputs
 *   are strict (HS-T5, Oleksii), so A smuggling `shelterId: B` in is
 *   BAD_REQUEST, B is left untouched, and nothing of B's is in the answer.
 */

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());

let shelterA: Shelter;
let shelterB: Shelter;
let bPublished: Animal;
let bDraft: Animal;
let aPublished: Animal;
let asA: KabinetPrincipal;

async function shelterIn() {
  const city = makeCity();
  await cityRepo(db).insert(city);
  const shelter = makeShelter({
    publicLocation: { ...makeShelter().publicLocation, cityId: city.id },
  });
  await shelterRepo(db).insert(shelter);
  return { shelter, cityId: city.id };
}

beforeEach(async () => {
  await truncateAll(db);
  const a = await shelterIn();
  const b = await shelterIn();
  shelterA = a.shelter;
  shelterB = b.shelter;
  aPublished = makeAnimal({ shelterId: shelterA.id });
  bPublished = makeAnimal({ shelterId: shelterB.id });
  bDraft = makeAnimal({ shelterId: shelterB.id, listing: { kind: "draft" } });
  await animalRepo(db).insert(aPublished, a.cityId);
  await animalRepo(db).insert(bPublished, b.cityId);
  await animalRepo(db).insert(bDraft, b.cityId);
  asA = {
    kind: "shelter_admin",
    shelterAdminId: "33333333-3333-4333-8333-333333333333" as ShelterAdminId,
    shelterId: shelterA.id,
  };
});

const generousLimiters = {
  perUser: inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 10_000 }),
  perIp: inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 10_000 }),
};

async function call(path: string, input: unknown): Promise<{ status: number; body: unknown }> {
  const request = new Request(`http://localhost/api/kabinet/${path.replaceAll(".", "/")}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost" },
    body: JSON.stringify(toRpcBody(input)),
  });
  const response = await handleKabinetRpc(request, {
    availability: {
      kind: "available",
      sender: { send: async () => {} },
      invites: capturingInvitationSender(),
      secret: "x",
      baseURL: "http://localhost",
    },
    resolve: async () => ({
      principal: asA,
      userId: "user-a",
      db,
      cursorSecret: "test-cursor-secret",
    }),
    limiters: generousLimiters,
    ip: "203.0.113.1",
    now: new Date(),
    newId: () => crypto.randomUUID(),
    operatorDisplayName: "Олексій",
    locationPolicy: null,
    production: false,
    // The K2/K3 handlers, exercised with writes opened explicitly (KH-Q1): the
    // served route refuses them (`SHELTER_WRITE_POLICY`), which
    // shelter-writes-refused.test.ts pins.
    shelterWrites: { kind: "open_for_tests_only" },
  });
  const text = await response.text();
  return { status: response.status, body: text ? fromRpcBody(JSON.parse(text)) : null };
}

/** Everything about B that a cross-tenant write could touch. */
async function snapshotOfB() {
  return {
    shelter: await shelterRepo(db).findById(shelterB.id),
    history: await kabinetShelterRepo(db).historyOf(shelterB.id),
    animals: (await animalRepo(db).findByShelterId(shelterB.id))
      .map((animal) => JSON.stringify(animal))
      .sort(),
  };
}

const errorCode = (body: unknown) => (body as { json?: { code?: string }; code?: string })?.code;

describe("cross-tenant: an animalId from another shelter is FORBIDDEN", () => {
  const cases: [string, () => unknown][] = [
    ["shelter.animals.byId", () => ({ animalId: bPublished.id })],
    [
      "shelter.animals.update",
      () => ({
        animalId: bPublished.id,
        expectedVersion: bPublished.version,
        patch: { name: "Чужий" },
      }),
    ],
    ["shelter.animals.transition", () => ({ animalId: bPublished.id, event: { type: "reserve" } })],
    ["shelter.animals.confirm", () => ({ animalId: bPublished.id })],
    ["shelter.animals.undoConfirm", () => ({ animalId: bPublished.id })],
    ["shelter.animals.deleteDraft", () => ({ animalId: bDraft.id })],
  ];

  for (const [procedure, input] of cases) {
    it(`cross-tenant: ${procedure}`, async () => {
      const before = await snapshotOfB();
      const result = await call(procedure, input());
      expect(result.status).toBe(403);
      expect(errorCode(result.body)).toBe("FORBIDDEN");
      expect(await snapshotOfB()).toEqual(before);
    });
  }

  /** The other half of S3-Q2's rule: an id that exists nowhere is NOT_FOUND, not FORBIDDEN. */
  it("an animalId that exists nowhere is NOT_FOUND", async () => {
    const result = await call("shelter.animals.byId", { animalId: crypto.randomUUID() });
    expect(result.status).toBe(404);
  });

  it("the same call on A's own animal succeeds (the 403 above is about the owner, not the call)", async () => {
    const result = await call("shelter.animals.confirm", { animalId: aPublished.id });
    expect(result.status).toBe(200);
  });
});

describe("cross-tenant: a smuggled shelterId is BAD_REQUEST, and B is untouched", () => {
  const smuggle = (input: object) => ({ ...input, shelterId: shelterB.id });
  const cases: [string, () => unknown][] = [
    ["shelter.profile.get", () => smuggle({})],
    [
      "shelter.profile.updateContact",
      () =>
        smuggle({
          contact: { primary: { kind: "telegram", handle: "not_b" }, additional: [] },
          expectedVersion: 0,
        }),
    ],
    [
      "shelter.profile.updateFreshnessSentence",
      () => smuggle({ freshnessSentence: { uk: "Не Б", en: null }, expectedVersion: 0 }),
    ],
    ["shelter.profile.proposeDonation", () => smuggle({ url: "https://send.monobank.ua/jar/x" })],
    ["shelter.profile.cancelDonationProposal", () => smuggle({})],
    ["shelter.profile.pause", () => smuggle({ reason: { code: "relocation", note: null } })],
    ["shelter.profile.resume", () => smuggle({})],
    ["shelter.verification.requestReview", () => smuggle({})],
    ["shelter.animals.list", () => smuggle({ listing: null, cursor: null, limit: 50 })],
    ["shelter.history.list", () => smuggle({ cursor: null, limit: 50 })],
    [
      "shelter.animals.createDraft",
      () =>
        smuggle({
          name: "Новий",
          species: "dog",
          sex: "male",
          size: "small",
          age: { kind: "declared_bucket", bucket: "young", declaredAt: new Date() },
          description: { uk: "Опис", en: null },
        }),
    ],
  ];

  for (const [procedure, input] of cases) {
    it(`cross-tenant: ${procedure}`, async () => {
      const before = await snapshotOfB();
      const result = await call(procedure, input());
      expect(result.status).toBe(400);
      expect(errorCode(result.body)).toBe("BAD_REQUEST");
      expect(await snapshotOfB()).toEqual(before);
      const serialized = JSON.stringify(result.body);
      expect(serialized).not.toContain(shelterB.id);
      expect(serialized).not.toContain(bPublished.id);
      expect(serialized).not.toContain(bDraft.id);
    });
  }

  /** Without the smuggled key, the same calls act on A: A's list, A's new draft. */
  it("A's list is A's animals, and createDraft lands in A", async () => {
    const list = await call("shelter.animals.list", { listing: null, cursor: null, limit: 50 });
    const items = (list.body as { items: { id: string }[] }).items;
    expect(items.map((item) => item.id)).toEqual([aPublished.id]);

    await call("shelter.animals.createDraft", {
      name: "Новий",
      species: "cat",
      sex: "female",
      size: "small",
      age: { kind: "declared_bucket", bucket: "baby", declaredAt: new Date() },
      description: { uk: "Опис", en: null },
    });
    expect((await animalRepo(db).findByShelterId(shelterA.id)).map((a) => a.name)).toContain(
      "Новий",
    );
    expect((await animalRepo(db).findByShelterId(shelterB.id)).map((a) => a.name)).not.toContain(
      "Новий",
    );
  });
});

describe("cross-tenant: history", () => {
  /** B has history; A's own read must show none of it (RG-Q8's new read, S3-Q2's rule). */
  it("A's history read never returns B's entries", async () => {
    const written = await kabinetShelterRepo(db).applyAudited({
      shelterId: shelterB.id,
      expectedVersion: 0,
      change: { kind: "freshness_sentence", freshnessSentence: { uk: "Тільки Б", en: null } },
      entry: {
        kind: "freshness_sentence_changed",
        at: new Date(),
        actor: { kind: "moderator", moderatorId: "11111111-1111-4111-8111-111111111111" as never },
        previous: null,
        next: { uk: "Тільки Б", en: null },
      },
      historyId: crypto.randomUUID(),
      now: new Date(),
    });
    expect(written.kind).toBe("ok");
    const result = await call("shelter.history.list", { cursor: null, limit: 50 });
    expect(result.status).toBe(200);
    expect((result.body as { items: unknown[] }).items).toEqual([]);
    expect(JSON.stringify(result.body)).not.toContain("Тільки Б");
  });
});

describe("coverage", () => {
  it("covers every shelter.* procedure in the contract, exactly once", () => {
    const pathsOf = (node: object, prefix: string): string[] =>
      Object.entries(node).flatMap(([key, value]) => {
        const path = `${prefix}.${key}`;
        return value !== null && Object.getPrototypeOf(value) === Object.prototype
          ? pathsOf(value as object, path)
          : [path];
      });
    const covered = [
      "shelter.animals.byId",
      "shelter.animals.update",
      "shelter.animals.transition",
      "shelter.animals.confirm",
      "shelter.animals.undoConfirm",
      "shelter.animals.deleteDraft",
      "shelter.profile.get",
      "shelter.profile.updateContact",
      "shelter.profile.updateFreshnessSentence",
      "shelter.profile.proposeDonation",
      "shelter.profile.cancelDonationProposal",
      "shelter.profile.pause",
      "shelter.profile.resume",
      "shelter.verification.requestReview",
      "shelter.animals.list",
      "shelter.animals.createDraft",
      "shelter.history.list",
    ];
    expect(new Set(covered).size).toBe(17);
    expect([...covered].sort()).toEqual(pathsOf(shelterKabinetContract.shelter, "shelter").sort());
  });
});
