import type { KabinetAnimalView } from "@opika/contracts";
import { animalRepo, cityRepo, kabinetShelterRepo, shelterRepo } from "@opika/db/repos";
import {
  type AnimalFixtureOverrides,
  imageFactsOf,
  makeAnimal,
  makeCity,
  makeShelter,
  setupTestDatabase,
  testJpeg,
  truncateAll,
} from "@opika/db/test";
import type { Animal, AnimalPhoto, Shelter, ShelterAdminId } from "@opika/domain";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inMemoryRateLimiter, type RateLimiter } from "../api/rate-limit";
import { fromRpcBody, rpcRequestInit } from "../api/test-harness";
import { SHELTER_WRITE_POLICY } from "./access";
import type { KabinetPrincipal } from "./actor";
import { capturingInvitationSender } from "./email-senders";
import { capturingPasswordMail } from "./password-mail";
import { PHOTO_PROCESSING_BUDGET_MS, type PhotoUploads } from "./photo-uploads";
import { handleKabinetRpc } from "./rpc-route";
import { TEST_SESSION_COOKIE } from "./test-session-cookie";

type Pipeline = typeof import("@opika/db/image-pipeline/server");

/**
 * The real pipeline, unless a test holds its processing back (the processing
 * budget, below): a pass-through, so every other test here runs real sharp.
 */
const processing = vi.hoisted(() => ({
  held: null as null | ((bytes: Buffer) => ReturnType<Pipeline["prepareUploadedPhoto"]>),
  real: null as null | Pipeline["prepareUploadedPhoto"],
}));

vi.mock("@opika/db/image-pipeline/server", async (importOriginal) => {
  const actual = await importOriginal<Pipeline>();
  processing.real = actual.prepareUploadedPhoto;
  return {
    ...actual,
    prepareUploadedPhoto: (bytes: Buffer) =>
      (processing.held ?? actual.prepareUploadedPhoto)(bytes),
  };
});

/**
 * `shelter.photos.*` (PR 3), through the served router: a real `Request`
 * encoded the way oRPC's client encodes an upload (multipart), the Origin
 * check, the access middleware, the handler, real sharp (through the db
 * package) and real Postgres.
 * Only identity and the store are injected; the store captures every put.
 */

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());
afterEach(() => {
  vi.restoreAllMocks();
  processing.held = null;
});

const ADMIN = "33333333-3333-4333-8333-333333333333" as ShelterAdminId;
const ORIGIN = "http://localhost";
let shelter: Shelter;
let other: Shelter;
let cityId: string;
let asAdmin: KabinetPrincipal;

async function shelterIn(city: string): Promise<Shelter> {
  const created = makeShelter({
    publicLocation: { ...makeShelter().publicLocation, cityId: city as never },
  });
  await shelterRepo(db).insert(created);
  return created;
}

beforeEach(async () => {
  await truncateAll(db);
  const city = makeCity();
  await cityRepo(db).insert(city);
  cityId = city.id;
  shelter = await shelterIn(city.id);
  other = await shelterIn(city.id);
  asAdmin = { kind: "shelter_admin", shelterAdminId: ADMIN, shelterId: shelter.id };
});

type Put = { key: string; contentType: string; bytes: Buffer };

function capturingStore() {
  const puts: Put[] = [];
  return {
    puts,
    storage: {
      async put(key: string, bytes: Buffer, contentType: string) {
        puts.push({ key, contentType, bytes });
      },
    },
  };
}

const generous = () => inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 10_000 });

function uploadsOn(
  store = capturingStore(),
  limiters: { perHour?: RateLimiter; perDay?: RateLimiter } = {},
  processingBudgetMs = PHOTO_PROCESSING_BUDGET_MS,
): { uploads: PhotoUploads; puts: Put[] } {
  return {
    puts: store.puts,
    uploads: {
      kind: "on",
      storage: store.storage,
      limiters: { perHour: limiters.perHour ?? generous(), perDay: limiters.perDay ?? generous() },
      processingBudgetMs,
    },
  };
}

async function call<T = KabinetAnimalView>(
  path: string,
  input: unknown,
  opts: {
    uploads: PhotoUploads;
    principal?: KabinetPrincipal;
    origin?: string | null;
    now?: Date;
  },
): Promise<{ status: number; body: T }> {
  const { body, headers } = rpcRequestInit(input);
  const request = new Request(`${ORIGIN}/api/kabinet/${path.replaceAll(".", "/")}`, {
    method: "POST",
    headers: {
      ...headers,
      cookie: TEST_SESSION_COOKIE,
      ...(opts.origin === null ? {} : { origin: opts.origin ?? ORIGIN }),
    },
    body,
  });
  const response = await handleKabinetRpc(request, {
    availability: {
      kind: "available",
      passwordMail: capturingPasswordMail(),
      sender: { send: async () => {} },
      invites: capturingInvitationSender(),
      secret: "x",
      baseURL: ORIGIN,
    },
    limiters: { perUser: generous(), perIp: generous() },
    ip: "203.0.113.1",
    resolve: async () => ({
      principal: opts.principal ?? asAdmin,
      userId: "user-admin",
      db,
      cursorSecret: "test-cursor-secret",
    }),
    now: opts.now ?? new Date(),
    newId: () => crypto.randomUUID(),
    operatorDisplayName: "Олексій",
    locationPolicy: null,
    production: false,
    shelterWrites: SHELTER_WRITE_POLICY,
    photoUploads: opts.uploads,
  });
  const text = await response.text();
  let parsed: unknown = text;
  try {
    parsed = fromRpcBody(JSON.parse(text));
  } catch {
    // a plain-text refusal (403 Origin, 413, 429)
  }
  return { status: response.status, body: parsed as T };
}

const errorOf = (body: unknown) => body as { code?: string; data?: unknown };

const photo = (n: number): AnimalPhoto => ({
  storageKey: `animals/x/seeded-${n}`,
  width: 800,
  height: 1000,
  alt: null,
});

async function animal(
  overrides: AnimalFixtureOverrides = {},
  owner: Shelter = shelter,
): Promise<Animal> {
  const created = makeAnimal({ shelterId: owner.id, ...overrides });
  await animalRepo(db).insert(created, cityId as never);
  return created;
}

const reload = async (id: string) => (await animalRepo(db).findById(id as never)) as Animal;
const photoHistory = async (owner: Shelter = shelter) =>
  (await kabinetShelterRepo(db).historyOf(owner.id)).filter(
    (entry) => entry.kind === "animal_edited" && entry.fields.includes("photos"),
  );

const jpeg = async (width = 1200, height = 900) =>
  new File([new Uint8Array(await testJpeg({ width, height }))], "photo.jpg", {
    type: "image/jpeg",
  });

const svgFile = () =>
  new File(['<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'], "photo.jpg", {
    type: "image/jpeg",
  });

describe("shelter.photos.add", () => {
  it("stores the three WebP variants under a fresh random key and appends the photo", async () => {
    const target = await animal({ photos: [photo(1)] });
    const { uploads, puts } = uploadsOn();
    const now = new Date("2026-10-17T10:00:00.000Z");

    const result = await call(
      "shelter.photos.add",
      { animalId: target.id, file: await jpeg() },
      {
        uploads,
        now,
      },
    );

    expect(result.status).toBe(200);
    const added = result.body.photos[1];
    expect(added?.storageKey).toMatch(
      new RegExp(
        `^animals/${target.id}/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`,
      ),
    );
    expect(added).toMatchObject({ width: 1200, height: 900, alt: null });
    expect(puts.map((p) => p.key).sort()).toEqual(
      ["card", "detail", "thumb"].map((v) => `${added?.storageKey}/${v}.webp`),
    );
    expect(puts.every((p) => p.contentType === "image/webp")).toBe(true);
    // Never the original: every stored byte is WebP.
    for (const put of puts) expect((await imageFactsOf(put.bytes)).format).toBe("webp");

    const stored = await reload(target.id);
    expect(stored.photos.map((p) => p.storageKey)).toEqual([
      photo(1).storageKey,
      added?.storageKey,
    ]);
    expect(stored.lastUpdatedAt).toEqual(now);
    expect(stored.version).toBe(target.version);
    expect(await photoHistory()).toHaveLength(1);
  });

  it("two uploads get two different keys (P-Q4)", async () => {
    const target = await animal({ photos: [] });
    const { uploads } = uploadsOn();
    await call("shelter.photos.add", { animalId: target.id, file: await jpeg() }, { uploads });
    await call("shelter.photos.add", { animalId: target.id, file: await jpeg() }, { uploads });
    const keys = (await reload(target.id)).photos.map((p) => p.storageKey);
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);
  });

  it("a GPS-tagged upload is stored without its location, end to end (K-Q2)", async () => {
    const target = await animal({ photos: [] });
    const { uploads, puts } = uploadsOn();
    const tagged = await testJpeg({ gpsCanary: "CANARY-SHELTER-YARD" });
    expect(tagged.includes("CANARY-SHELTER-YARD")).toBe(true);

    await call(
      "shelter.photos.add",
      { animalId: target.id, file: new File([new Uint8Array(tagged)], "yard.jpg") },
      { uploads },
    );

    expect(puts).toHaveLength(3);
    for (const put of puts) {
      expect(put.bytes.includes("CANARY-SHELTER-YARD")).toBe(false);
      expect(await imageFactsOf(put.bytes)).toEqual({ format: "webp", hasMetadata: false });
    }
  });

  it.each([
    ["preview", { kind: "off", because: "preview" } as const],
    ["not configured", { kind: "off", because: "not_configured" } as const],
  ])("uploads off (%s): 503 PHOTO_UPLOADS_UNAVAILABLE, nothing stored", async (_label, off) => {
    const target = await animal({ photos: [] });
    const result = await call(
      "shelter.photos.add",
      { animalId: target.id, file: await jpeg() },
      { uploads: off },
    );
    expect(result.status).toBe(503);
    expect(errorOf(result.body).code).toBe("PHOTO_UPLOADS_UNAVAILABLE");
    expect((await reload(target.id)).photos).toEqual([]);
  });

  it("a non-image is 422 PHOTO_REJECTED by its bytes, whatever its name and type say", async () => {
    const target = await animal({ photos: [] });
    const { uploads, puts } = uploadsOn();
    const result = await call(
      "shelter.photos.add",
      { animalId: target.id, file: svgFile() },
      { uploads },
    );
    expect(result.status).toBe(422);
    expect(errorOf(result.body)).toMatchObject({
      code: "PHOTO_REJECTED",
      data: { reason: "unsupported_type" },
    });
    expect(puts).toEqual([]);
    expect(await photoHistory()).toEqual([]);
  });

  it("2001 px is 422 dimensions_exceeded; 2000 px is stored", async () => {
    const target = await animal({ photos: [] });
    const { uploads, puts } = uploadsOn();
    const over = await call(
      "shelter.photos.add",
      { animalId: target.id, file: await jpeg(2001, 100) },
      { uploads },
    );
    expect(errorOf(over.body)).toMatchObject({ data: { reason: "dimensions_exceeded" } });
    expect(puts).toEqual([]);
    const at = await call(
      "shelter.photos.add",
      { animalId: target.id, file: await jpeg(2000, 100) },
      { uploads },
    );
    expect(at.status).toBe(200);
  });
});

describe("the processing budget", () => {
  /**
   * Forced, not loaded: the processing is held until the test lets it go, so
   * the budget always passes first, whatever the machine is doing. Let go
   * afterwards, it runs to completion on the real pipeline, which is the
   * moment a late result could still reach storage.
   */
  it("past it the upload fails as any upload failure does, logged without the file or a key, and nothing is stored, even once processing finishes", async () => {
    const target = await animal({ photos: [] });
    const { uploads, puts } = uploadsOn(undefined, {}, 50);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    let release = () => {};
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let finished: Promise<unknown> = Promise.resolve();
    processing.held = (bytes) => {
      const late = released.then(() => {
        if (processing.real === null) throw new Error("the real pipeline was never loaded");
        return processing.real(bytes);
      });
      finished = late;
      return late;
    };

    const result = await call(
      "shelter.photos.add",
      { animalId: target.id, file: await jpeg() },
      { uploads },
    );

    expect(result.status).toBe(500);
    expect(errorOf(result.body).code).toBe("INTERNAL_SERVER_ERROR");
    expect(logged.mock.calls).toEqual([[{ event: "photo_processing_over_budget", budgetMs: 50 }]]);

    release();
    expect(await finished).toMatchObject({ kind: "ok" });
    // Anything still queued behind the late result runs before this line.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(puts).toEqual([]);
    expect((await reload(target.id)).photos).toEqual([]);
    // Nor has the date a photo write on a visible card moves (RH-B7).
    expect((await reload(target.id)).listing).toEqual(target.listing);
    expect(await photoHistory()).toEqual([]);
    expect(logged.mock.calls).toHaveLength(1);
  });
});

describe("the ten-photo cap (K-Q11)", () => {
  const nine = Array.from({ length: 9 }, (_, i) => photo(i));

  it("9 + 1 is stored: ten photos", async () => {
    const target = await animal({ photos: nine });
    const { uploads } = uploadsOn();
    const result = await call(
      "shelter.photos.add",
      { animalId: target.id, file: await jpeg() },
      { uploads },
    );
    expect(result.status).toBe(200);
    expect((await reload(target.id)).photos).toHaveLength(10);
  });

  it("10 + 1 is 409 PHOTO_LIMIT_REACHED, refused before anything is stored", async () => {
    const target = await animal({ photos: [...nine, photo(9)] });
    const { uploads, puts } = uploadsOn();
    const result = await call(
      "shelter.photos.add",
      { animalId: target.id, file: await jpeg() },
      { uploads },
    );
    expect(result.status).toBe(409);
    expect(errorOf(result.body)).toMatchObject({ code: "PHOTO_LIMIT_REACHED", data: { max: 10 } });
    expect(puts).toEqual([]);
    expect((await reload(target.id)).photos).toHaveLength(10);
  });

  it("two uploads at once to an animal with nine: one lands, the other is refused and its file logged as orphaned", async () => {
    const target = await animal({ photos: nine });
    const { uploads, puts } = uploadsOn();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const file = await jpeg();

    const results = await Promise.all([
      call("shelter.photos.add", { animalId: target.id, file }, { uploads }),
      call("shelter.photos.add", { animalId: target.id, file }, { uploads }),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const stored = await reload(target.id);
    expect(stored.photos).toHaveLength(10);
    // Both were stored (each passed the count check before either appended)…
    expect(puts).toHaveLength(6);
    const storedKeys = new Set(puts.map((p) => p.key.replace(/\/[a-z]+\.webp$/, "")));
    const referenced = new Set(stored.photos.map((p) => p.storageKey));
    const orphaned = [...storedKeys].filter((key) => !referenced.has(key));
    // …and exactly the unreferenced one is logged, by key.
    expect(orphaned).toHaveLength(1);
    expect(logged).toHaveBeenCalledWith({ event: "photo_orphaned", storageKey: orphaned[0] });
    expect(await photoHistory()).toHaveLength(1);
  });

  it("three uploads at once to an empty animal all land: the compare-and-set retries, nothing is lost", async () => {
    const target = await animal({ photos: [] });
    const { uploads } = uploadsOn();
    const file = await jpeg();
    const results = await Promise.all(
      [1, 2, 3].map(() => call("shelter.photos.add", { animalId: target.id, file }, { uploads })),
    );
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    expect((await reload(target.id)).photos).toHaveLength(3);
    expect(await photoHistory()).toHaveLength(3);
  });
});

describe("per-shelter upload limits (P-Q12)", () => {
  it("the hourly allowance: the third upload is 429, charged even for a refused file", async () => {
    const target = await animal({ photos: [] });
    const { uploads, puts } = uploadsOn(undefined, {
      perHour: inMemoryRateLimiter({ windowMs: 3_600_000, maxRequests: 2 }),
    });
    // A rejected file still spends one unit: charged before the bytes are read.
    await call("shelter.photos.add", { animalId: target.id, file: svgFile() }, { uploads });
    expect(
      (await call("shelter.photos.add", { animalId: target.id, file: await jpeg() }, { uploads }))
        .status,
    ).toBe(200);
    const third = await call(
      "shelter.photos.add",
      { animalId: target.id, file: await jpeg() },
      { uploads },
    );
    expect(third.status).toBe(429);
    expect(errorOf(third.body).code).toBe("RATE_LIMITED");
    expect(puts).toHaveLength(3);
  });

  it("the daily allowance refuses on its own", async () => {
    const target = await animal({ photos: [] });
    const { uploads } = uploadsOn(undefined, {
      perDay: inMemoryRateLimiter({ windowMs: 86_400_000, maxRequests: 1 }),
    });
    await call("shelter.photos.add", { animalId: target.id, file: await jpeg() }, { uploads });
    const second = await call(
      "shelter.photos.add",
      { animalId: target.id, file: await jpeg() },
      { uploads },
    );
    expect(second.status).toBe(429);
  });

  it("is keyed by the shelter, so its admins share one allowance", async () => {
    const keys: string[] = [];
    const spying: RateLimiter = {
      async check(key) {
        keys.push(key);
        return true;
      },
    };
    const target = await animal({ photos: [] });
    const { uploads } = uploadsOn(undefined, { perHour: spying, perDay: spying });
    await call("shelter.photos.add", { animalId: target.id, file: await jpeg() }, { uploads });
    expect(keys).toEqual([`shelter:${shelter.id}`, `shelter:${shelter.id}`]);
  });

  // Literal values from the approved answer, not the constant read back.
  it("the numbers are 60 an hour and 300 a day", async () => {
    const { PHOTO_UPLOAD_RATE_LIMITS } = await import("./rate-limits");
    expect(PHOTO_UPLOAD_RATE_LIMITS).toEqual({
      perHour: { windowMs: 3_600_000, maxRequests: 60 },
      perDay: { windowMs: 86_400_000, maxRequests: 300 },
    });
  });
});

describe("who may upload", () => {
  it("no Origin: 403 before anything, nothing stored", async () => {
    const target = await animal({ photos: [] });
    const { uploads, puts } = uploadsOn();
    const result = await call(
      "shelter.photos.add",
      { animalId: target.id, file: await jpeg() },
      { uploads, origin: null },
    );
    expect(result.status).toBe(403);
    expect(puts).toEqual([]);
  });

  it("a support view: 403 FORBIDDEN, nothing stored", async () => {
    const target = await animal({ photos: [] });
    const { uploads, puts } = uploadsOn();
    const result = await call(
      "shelter.photos.add",
      { animalId: target.id, file: await jpeg() },
      {
        uploads,
        principal: {
          kind: "support_view",
          moderatorId: "11111111-1111-4111-8111-111111111111" as never,
          shelterId: shelter.id,
        },
      },
    );
    expect(result.status).toBe(403);
    expect(errorOf(result.body).code).toBe("FORBIDDEN");
    expect(puts).toEqual([]);
  });

  it("an anonymous caller: 401", async () => {
    const target = await animal({ photos: [] });
    const { uploads } = uploadsOn();
    const result = await call(
      "shelter.photos.add",
      { animalId: target.id, file: await jpeg() },
      { uploads, principal: { kind: "anonymous" } },
    );
    expect(result.status).toBe(401);
  });

  it("another shelter's animal: 403 FORBIDDEN, nothing stored, its photos untouched", async () => {
    const theirs = await animal({ photos: [photo(1)] }, other);
    const { uploads, puts } = uploadsOn();
    for (const [path, input] of [
      ["shelter.photos.add", { animalId: theirs.id, file: await jpeg() }],
      [
        "shelter.photos.reorder",
        {
          animalId: theirs.id,
          expectedPhotoKeys: [photo(1).storageKey],
          nextPhotoKeys: [photo(1).storageKey],
        },
      ],
      [
        "shelter.photos.remove",
        {
          animalId: theirs.id,
          expectedPhotoKeys: [photo(1).storageKey],
          storageKey: photo(1).storageKey,
        },
      ],
    ] as const) {
      const result = await call(path, input, { uploads });
      expect(result.status, path).toBe(403);
      expect(errorOf(result.body).code, path).toBe("FORBIDDEN");
    }
    expect(puts).toEqual([]);
    expect((await reload(theirs.id)).photos).toEqual([photo(1)]);
    expect(await photoHistory(other)).toEqual([]);
  });
});

describe("shelter.photos.reorder (P-Q3, P-Q9)", () => {
  const keys = [photo(1), photo(2), photo(3)].map((p) => p.storageKey);

  it("writes the new order, moves edit time, records one photos line; the first is the cover", async () => {
    const target = await animal({ photos: [photo(1), photo(2), photo(3)] });
    const now = new Date("2026-10-17T11:00:00.000Z");
    const result = await call(
      "shelter.photos.reorder",
      {
        animalId: target.id,
        expectedPhotoKeys: keys,
        nextPhotoKeys: [keys[2], keys[0], keys[1]],
      },
      { uploads: uploadsOn().uploads, now },
    );
    expect(result.status).toBe(200);
    const stored = await reload(target.id);
    expect(stored.photos).toEqual([photo(3), photo(1), photo(2)]);
    expect(stored.lastUpdatedAt).toEqual(now);
    expect(stored.version).toBe(target.version);
    // RH-B7: on a published card the reorder is also a confirmation.
    expect(stored.listing).toEqual({ ...target.listing, confirmedAt: now, undoable: null });
    expect(await photoHistory()).toHaveLength(1);
  });

  it("a stale list is 409 CONFLICT and writes nothing", async () => {
    const target = await animal({ photos: [photo(1), photo(2), photo(3)] });
    const result = await call(
      "shelter.photos.reorder",
      {
        animalId: target.id,
        expectedPhotoKeys: [keys[1], keys[0], keys[2]],
        nextPhotoKeys: [keys[2], keys[0], keys[1]],
      },
      { uploads: uploadsOn().uploads },
    );
    expect(result.status).toBe(409);
    expect(errorOf(result.body).code).toBe("CONFLICT");
    expect((await reload(target.id)).photos).toEqual([photo(1), photo(2), photo(3)]);
    expect(await photoHistory()).toEqual([]);
  });

  it("the same order writes nothing and records nothing", async () => {
    const target = await animal({ photos: [photo(1), photo(2)] });
    const result = await call(
      "shelter.photos.reorder",
      { animalId: target.id, expectedPhotoKeys: keys.slice(0, 2), nextPhotoKeys: keys.slice(0, 2) },
      { uploads: uploadsOn().uploads, now: new Date("2030-01-01T00:00:00.000Z") },
    );
    expect(result.status).toBe(200);
    expect((await reload(target.id)).lastUpdatedAt).toEqual(target.lastUpdatedAt);
    expect(await photoHistory()).toEqual([]);
  });

  it("works with uploads off: only add needs the store", async () => {
    const target = await animal({ photos: [photo(1), photo(2)] });
    const result = await call(
      "shelter.photos.reorder",
      {
        animalId: target.id,
        expectedPhotoKeys: keys.slice(0, 2),
        nextPhotoKeys: [keys[1], keys[0]],
      },
      { uploads: { kind: "off", because: "preview" } },
    );
    expect(result.status).toBe(200);
  });
});

describe("shelter.photos.remove (P-Q3, P-Q8)", () => {
  it("takes the photo off and records one photos line; nothing is deleted from storage", async () => {
    const target = await animal({ photos: [photo(1), photo(2)] });
    const { uploads, puts } = uploadsOn();
    const result = await call(
      "shelter.photos.remove",
      {
        animalId: target.id,
        expectedPhotoKeys: [photo(1).storageKey, photo(2).storageKey],
        storageKey: photo(1).storageKey,
      },
      { uploads },
    );
    expect(result.status).toBe(200);
    expect((await reload(target.id)).photos).toEqual([photo(2)]);
    expect(await photoHistory()).toHaveLength(1);
    expect(puts).toEqual([]);
  });

  it("a stale list is 409 CONFLICT and writes nothing", async () => {
    const target = await animal({ photos: [photo(1), photo(2)] });
    const result = await call(
      "shelter.photos.remove",
      {
        animalId: target.id,
        expectedPhotoKeys: [photo(1).storageKey],
        storageKey: photo(1).storageKey,
      },
      { uploads: uploadsOn().uploads },
    );
    expect(result.status).toBe(409);
    expect((await reload(target.id)).photos).toEqual([photo(1), photo(2)]);
  });

  it.each(["published", "reserved"] as const)(
    "the last photo of a %s animal stays: 409 PHOTOS_REQUIRED_WHILE_VISIBLE",
    async (kind) => {
      const base = makeAnimal({ shelterId: shelter.id });
      const listing =
        kind === "reserved" && base.listing.kind === "published"
          ? {
              kind: "reserved" as const,
              since: base.listing.publishedAt,
              publishedAt: base.listing.publishedAt,
              confirmedAt: base.listing.confirmedAt,
              undoable: null,
            }
          : base.listing;
      const target = await animal({ photos: [photo(1)], listing });
      expect(target.listing.kind).toBe(kind);
      const result = await call(
        "shelter.photos.remove",
        {
          animalId: target.id,
          expectedPhotoKeys: [photo(1).storageKey],
          storageKey: photo(1).storageKey,
        },
        { uploads: uploadsOn().uploads },
      );
      expect(result.status).toBe(409);
      expect(errorOf(result.body).code).toBe("PHOTOS_REQUIRED_WHILE_VISIBLE");
      expect((await reload(target.id)).photos).toEqual([photo(1)]);
    },
  );

  it("a draft may lose its last photo", async () => {
    const target = await animal({ photos: [photo(1)], listing: { kind: "draft" } });
    const result = await call(
      "shelter.photos.remove",
      {
        animalId: target.id,
        expectedPhotoKeys: [photo(1).storageKey],
        storageKey: photo(1).storageKey,
      },
      { uploads: uploadsOn().uploads },
    );
    expect(result.status).toBe(200);
    expect((await reload(target.id)).photos).toEqual([]);
  });
});

/**
 * RH-B3 (Oleksii, verbatim: "the form's version compare-and-set save never
 * writes the photos column. Add one test: a form save from a stale read after
 * a photo change keeps the new photo list."), the scenario as he gave it.
 */
describe("a form save never writes the photos (RH-B3)", () => {
  it("a save from a read taken before a photo was added keeps the new photo list and its date", async () => {
    const target = await animal({ photos: [photo(1)] });
    const read = await reload(target.id);
    const photoAt = new Date("2026-10-17T10:00:00.000Z");
    const added = await call(
      "shelter.photos.add",
      { animalId: target.id, file: await jpeg() },
      { uploads: uploadsOn().uploads, now: photoAt },
    );
    expect(added.status).toBe(200);
    const withB = (await reload(target.id)).photos;
    expect(withB).toHaveLength(2);

    const saved = await call(
      "shelter.animals.update",
      {
        animalId: target.id,
        expectedVersion: read.version,
        patch: { description: { uk: "Новий опис після фото.", en: null } },
      },
      { uploads: uploadsOn().uploads, now: new Date("2026-10-17T10:05:00.000Z") },
    );

    expect(saved.status).toBe(200);
    const stored = await reload(target.id);
    expect(stored.photos).toEqual(withB);
    expect(stored.description?.uk).toBe("Новий опис після фото.");
    // RH-B7's date, set by the photo write, survives the form save (it writes no listing).
    expect(stored.listing).toMatchObject({ kind: "published", confirmedAt: photoAt });
  });
});

/**
 * RH-B7 (Oleksii, verbatim: "a photo add, reorder or remove moves «Оновлено»";
 * D4: "approved, option (i)"): on a published or reserved card a photo change
 * is a confirmation; on a draft, adopted or withdrawn card there is no date.
 */
describe("a photo change on a visible card moves the confirmation date (RH-B7)", () => {
  const now = new Date("2026-10-17T12:00:00.000Z");
  const confirmedAtOf = (listing: Animal["listing"]) =>
    listing.kind === "published" || listing.kind === "reserved" ? listing.confirmedAt : null;
  const listRow = async (id: string) => {
    const list = await call<{ items: { id: string; freshness: unknown }[] }>(
      "shelter.animals.list",
      { filter: { kind: "all" }, cursor: null, limit: 50 },
      { uploads: uploadsOn().uploads, now },
    );
    return list.body.items.find((item) => item.id === id);
  };

  it.each([
    [
      "add",
      async (id: string) =>
        call(
          "shelter.photos.add",
          { animalId: id, file: await jpeg() },
          { uploads: uploadsOn().uploads, now },
        ),
    ],
    [
      "reorder",
      (id: string) =>
        call(
          "shelter.photos.reorder",
          {
            animalId: id,
            expectedPhotoKeys: [photo(1).storageKey, photo(2).storageKey],
            nextPhotoKeys: [photo(2).storageKey, photo(1).storageKey],
          },
          { uploads: uploadsOn().uploads, now },
        ),
    ],
    [
      "remove",
      (id: string) =>
        call(
          "shelter.photos.remove",
          {
            animalId: id,
            expectedPhotoKeys: [photo(1).storageKey, photo(2).storageKey],
            storageKey: photo(2).storageKey,
          },
          { uploads: uploadsOn().uploads, now },
        ),
    ],
  ] as const)("%s on a published card: «Оновлено» reads fresh, 0 days", async (_change, run) => {
    const target = await animal({ photos: [photo(1), photo(2)] });
    expect(confirmedAtOf(target.listing)).not.toEqual(now);
    const result = await run(target.id);
    expect(result.status).toBe(200);
    expect(confirmedAtOf((result.body as KabinetAnimalView).listing)).toEqual(now);
    expect(confirmedAtOf((await reload(target.id)).listing)).toEqual(now);
    expect((await listRow(target.id))?.freshness).toMatchObject({ kind: "fresh", ageDays: 0 });
  });

  it("a reserved card's date moves too, keeping when it was reserved", async () => {
    const since = new Date("2026-09-01T00:00:00.000Z");
    const target = await animal({
      photos: [photo(1)],
      listing: { kind: "reserved", since, publishedAt: since, confirmedAt: since, undoable: null },
    });
    const result = await call(
      "shelter.photos.add",
      { animalId: target.id, file: await jpeg() },
      { uploads: uploadsOn().uploads, now },
    );
    expect(result.status).toBe(200);
    expect((await reload(target.id)).listing).toEqual({
      kind: "reserved",
      since,
      publishedAt: since,
      confirmedAt: now,
      undoable: null,
    });
  });

  it.each([
    ["draft", { kind: "draft" }],
    ["adopted", { kind: "adopted", adoptedAt: new Date("2026-09-01T00:00:00.000Z") }],
  ] as const)("on a %s card the listing stays exactly as it was", async (_kind, listing) => {
    const target = await animal({ photos: [photo(1)], listing });
    const result = await call(
      "shelter.photos.add",
      { animalId: target.id, file: await jpeg() },
      { uploads: uploadsOn().uploads, now },
    );
    expect(result.status).toBe(200);
    expect((await reload(target.id)).listing).toEqual(listing);
  });

  /**
   * K2's undo (shapes §7.3): a photo change inside the 8 seconds is a newer
   * write, so the undo answers UNDO_EXPIRED, and the date stays the photo
   * change's: the undo never rolls it back to before the «Ще шукає».
   */
  const changedAt = new Date(now.getTime() + 1000);
  it.each([
    [
      "an add",
      async (id: string) =>
        call(
          "shelter.photos.add",
          { animalId: id, file: await jpeg() },
          { uploads: uploadsOn().uploads, now: changedAt },
        ),
    ],
    [
      "a reorder",
      (id: string) =>
        call(
          "shelter.photos.reorder",
          {
            animalId: id,
            expectedPhotoKeys: [photo(1).storageKey, photo(2).storageKey],
            nextPhotoKeys: [photo(2).storageKey, photo(1).storageKey],
          },
          { uploads: uploadsOn().uploads, now: changedAt },
        ),
    ],
    [
      "a removal",
      (id: string) =>
        call(
          "shelter.photos.remove",
          {
            animalId: id,
            expectedPhotoKeys: [photo(1).storageKey, photo(2).storageKey],
            storageKey: photo(2).storageKey,
          },
          { uploads: uploadsOn().uploads, now: changedAt },
        ),
    ],
  ] as const)(
    "%s inside a «Ще шукає» window makes its undo UNDO_EXPIRED, keeping the photo change's date",
    async (_change, run) => {
      const target = await animal({ photos: [photo(1), photo(2)] });
      const confirmed = await call(
        "shelter.animals.confirm",
        { animalId: target.id },
        { uploads: uploadsOn().uploads, now },
      );
      expect(confirmed.status).toBe(200);
      expect((await run(target.id)).status).toBe(200);
      const undo = await call(
        "shelter.animals.undoConfirm",
        { animalId: target.id },
        { uploads: uploadsOn().uploads, now: new Date(now.getTime() + 2000) },
      );
      expect(undo.status).toBe(409);
      expect(errorOf(undo.body).code).toBe("UNDO_EXPIRED");
      expect((await reload(target.id)).listing).toMatchObject({
        kind: "published",
        confirmedAt: changedAt,
        undoable: null,
      });
    },
  );
});
