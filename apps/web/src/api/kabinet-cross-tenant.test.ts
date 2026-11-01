import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { shelterKabinetContract } from "@opika/contracts";
import {
  adopterRepo,
  animalRepo,
  cityRepo,
  kabinetShelterRepo,
  shelterRepo,
  swipeRepo,
} from "@opika/db/repos";
import {
  makeAdopter,
  makeAnimal,
  makeCity,
  makeShelter,
  makeSwipe,
  setupTestDatabase,
  testJpeg,
  truncateAll,
} from "@opika/db/test";
import type { Animal, Shelter, ShelterAdminId } from "@opika/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SHELTER_WRITE_POLICY } from "../kabinet/access";
import type { KabinetPrincipal } from "../kabinet/actor";
import { capturingInvitationSender } from "../kabinet/email-senders";
import { capturingPasswordMail } from "../kabinet/password-mail";
import { handleKabinetRpc } from "../kabinet/rpc-route";
import { TEST_SESSION_COOKIE } from "../kabinet/test-session-cookie";
import { inMemoryRateLimiter } from "./rate-limit";
import { fromRpcBody, rpcRequestInit } from "./test-harness";

/**
 * S3-Q2 (Oleksii), revised by QA-2026-10-29: shelter A's member acting on
 * shelter B's animal gets NOT_FOUND (a foreign id is a missing id), where a
 * shelter-level input is simply absent; for every shelter-scoped procedure, confirm and undoConfirm
 * included. PR #85 merges only with all sixteen as real tests over real
 * handlers (S3-Q3), so these go through the served router: a real `Request`,
 * the access middleware, the handler, real Postgres. Only identity is
 * injected, because who is signed in is Better Auth's job and has its own
 * tests (src/kabinet/auth.test.ts).
 *
 * Two kinds of procedure, because their inputs differ:
 * - **The nine that take an `animalId`** (six animal procedures, three photo
 *   ones) can name B's animal. That is NOT_FOUND, the same as a missing id
 *   (QA-2026-10-29), and B's animal is left exactly as it was; an upload to it stores nothing.
 * - **The ten that take no id** (profile, verification, list, createDraft)
 *   can't name B at all: `shelterId` is in no `shelter.*` input and comes
 *   from the actor. A cross-tenant refusal is impossible there by construction. Inputs
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

/** Every put an upload made, so a refused cross-tenant upload can be shown to store nothing. */
const stored: string[] = [];

async function call(path: string, input: unknown): Promise<{ status: number; body: unknown }> {
  // Encoded as oRPC's client encodes it: multipart for the upload's file.
  const { body, headers } = rpcRequestInit(input);
  const request = new Request(`http://localhost/api/kabinet/${path.replaceAll(".", "/")}`, {
    method: "POST",
    headers: { ...headers, origin: "http://localhost", cookie: TEST_SESSION_COOKIE },
    body,
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
    // The served policy: every shelter's own admins write (PR 6).
    shelterWrites: SHELTER_WRITE_POLICY,
    // On, so an upload reaches the ownership check rather than stopping at
    // "uploads unavailable" (which would pass this suite for the wrong reason).
    photoUploads: {
      kind: "on",
      storage: {
        async put(key) {
          stored.push(key);
        },
      },
      limiters: { perHour: generousLimiters.perUser, perDay: generousLimiters.perUser },
      processingBudgetMs: 10_000,
    },
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

/**
 * QA-2026-10-29: another shelter's animal answers exactly what a missing id
 * answers, so the API is no oracle for which ids exist. Each procedure is
 * called twice, once with B's id and once with a random UUID, and the two
 * responses must be deeply equal (status, code, message, body shape).
 */
const animalIdCases: [string, (id: string) => unknown | Promise<unknown>][] = [
  ["shelter.animals.byId", (id) => ({ animalId: id })],
  [
    "shelter.animals.update",
    (id) => ({ animalId: id, expectedVersion: bPublished.version, patch: { name: "Чужий" } }),
  ],
  ["shelter.animals.transition", (id) => ({ animalId: id, event: { type: "reserve" } })],
  ["shelter.animals.confirm", (id) => ({ animalId: id })],
  ["shelter.animals.undoConfirm", (id) => ({ animalId: id })],
  ["shelter.animals.deleteDraft", (id) => ({ animalId: id })],
  [
    "shelter.photos.add",
    async (id) => ({
      animalId: id,
      file: new File([new Uint8Array(await testJpeg())], "b.jpg", { type: "image/jpeg" }),
    }),
  ],
  [
    "shelter.photos.reorder",
    (id) => ({
      animalId: id,
      expectedPhotoKeys: ["animals/b/one"],
      nextPhotoKeys: ["animals/b/one"],
    }),
  ],
  [
    "shelter.photos.remove",
    (id) => ({
      animalId: id,
      expectedPhotoKeys: ["animals/b/one"],
      storageKey: "animals/b/one",
    }),
  ],
];

describe("cross-tenant: an animalId from another shelter is NOT_FOUND, same as a missing one", () => {
  for (const [procedure, input] of animalIdCases) {
    for (const [label, foreignId] of [
      ["a published animal", () => bPublished.id],
      ["a draft", () => bDraft.id],
    ] as const) {
      it(`${procedure}: ${label}`, async () => {
        const before = await snapshotOfB();
        stored.length = 0;
        const foreign = await call(procedure, await input(foreignId()));
        const missing = await call(procedure, await input(crypto.randomUUID()));
        expect(foreign.status).toBe(404);
        expect(errorCode(foreign.body)).toBe("NOT_FOUND");
        expect(foreign).toEqual(missing);
        const serialized = JSON.stringify(foreign.body);
        expect(serialized).not.toContain(bPublished.id);
        expect(serialized).not.toContain(bDraft.id);
        expect(await snapshotOfB()).toEqual(before);
        expect(stored).toEqual([]);
      });
    }
  }

  it("the answer doesn't vary with adopter activity on the foreign animal (commitment #2)", async () => {
    const before = await call("shelter.animals.byId", { animalId: bPublished.id });
    const adopter = makeAdopter();
    await adopterRepo(db).insert(adopter);
    await swipeRepo(db).record(makeSwipe({ adopterId: adopter.id, animalId: bPublished.id }));
    const after = await call("shelter.animals.byId", { animalId: bPublished.id });
    expect(after).toEqual(before);
  });

  it("the same call on A's own animal succeeds (the 404 above is about the owner, not the call)", async () => {
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
    ["shelter.animals.list", () => smuggle({ filter: { kind: "all" }, cursor: null, limit: 50 })],
    ["shelter.history.list", () => smuggle({ cursor: null, limit: 50 })],
    ["shelter.animals.createDraft", () => smuggle({ name: "Новий", species: "dog" })],
    [
      "shelter.logo.set",
      async () =>
        smuggle({
          file: new File([new Uint8Array(await testJpeg())], "b.jpg", { type: "image/jpeg" }),
        }),
    ],
    ["shelter.logo.remove", () => smuggle({})],
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
    const list = await call("shelter.animals.list", {
      filter: { kind: "all" },
      cursor: null,
      limit: 50,
    });
    const items = (list.body as { items: { id: string }[] }).items;
    expect(items.map((item) => item.id)).toEqual([aPublished.id]);

    await call("shelter.animals.createDraft", { name: "Новий", species: "cat" });
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

describe("coverage of animal-id procedures", () => {
  /** A new `shelter.*` procedure whose input names an animal must join `animalIdCases`, or this fails. */
  it("every contract procedure whose input has an animalId is in the foreign-vs-missing table", () => {
    const withAnimalId: string[] = [];
    const walk = (node: object, prefix: string) => {
      for (const [key, value] of Object.entries(node)) {
        const path = `${prefix}.${key}`;
        if (value !== null && Object.getPrototypeOf(value) === Object.prototype) {
          walk(value as object, path);
          continue;
        }
        const schema = (value as { "~orpc"?: { inputSchema?: { shape?: object } } })["~orpc"]
          ?.inputSchema;
        if (schema?.shape && "animalId" in schema.shape) withAnimalId.push(path);
      }
    };
    walk(shelterKabinetContract.shelter, "shelter");
    expect(withAnimalId.length).toBeGreaterThan(0);
    const inTable = animalIdCases.map(([path]) => path);
    const missing = withAnimalId.filter((path) => !inTable.includes(path));
    const stale = inTable.filter((path) => !withAnimalId.includes(path));
    expect({ missingFromTable: missing, notInContract: stale }).toEqual({
      missingFromTable: [],
      notInContract: [],
    });
  });

  /** Ownership has one door: handlers read an animal through `owned`, never the unscoped `findWithCity`. */
  it("no kabinet handler or page reads an animal by id without the shelter in the query", () => {
    const root = join(__dirname, "..");
    const offenders: string[] = [];
    const visit = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) visit(full);
        else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
          if (/\.findWithCity\(/.test(readFileSync(full, "utf8"))) offenders.push(full);
        }
      }
    };
    for (const sub of ["kabinet", "features/kabinet", "app/kabinet"]) visit(join(root, sub));
    expect(offenders).toEqual([]);
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
      "shelter.photos.add",
      "shelter.photos.reorder",
      "shelter.photos.remove",
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
      "shelter.logo.set",
      "shelter.logo.remove",
    ];
    expect(new Set(covered).size).toBe(22);
    expect([...covered].sort()).toEqual(pathsOf(shelterKabinetContract.shelter, "shelter").sort());
  });
});
