import type { KabinetAnimalView } from "@opika/contracts";
import { IMAGE_VARIANT_NAMES, IMAGE_VARIANTS } from "@opika/db/image-pipeline";
import {
  animalRepo,
  cityRepo,
  kabinetShelterRepo,
  photoSourcesRepo,
  shelterRepo,
} from "@opika/db/repos";
import { makeAnimal, makeCity, makeShelter, setupTestDatabase, truncateAll } from "@opika/db/test";
import {
  type Animal,
  type AnimalPhoto,
  frameOfUnits,
  frameUnitsOf,
  type PhotoFraming,
  type Shelter,
  type ShelterAdminId,
} from "@opika/domain";
import sharp from "sharp";
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

/**
 * `shelter.photos.crop` (crop-frame shape §6) through the served router: a real request, the
 * access middleware, the handler, real sharp and real Postgres, with a bucket in memory that
 * answers a get with what was put. Synthetic images only: a grey photo with a red block where the
 * frame goes, so a variant cut from the frame is red through its middle.
 */
let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());
afterEach(() => vi.restoreAllMocks());

const ADMIN = "33333333-3333-4333-8333-333333333333" as ShelterAdminId;
const ORIGIN = "http://localhost";
let shelter: Shelter;
let cityId: string;
let asAdmin: KabinetPrincipal;

beforeEach(async () => {
  await truncateAll(db);
  const city = makeCity();
  await cityRepo(db).insert(city);
  cityId = city.id;
  shelter = makeShelter({
    publicLocation: { ...makeShelter().publicLocation, cityId: city.id as never },
  });
  await shelterRepo(db).insert(shelter);
  asAdmin = { kind: "shelter_admin", shelterAdminId: ADMIN, shelterId: shelter.id };
});

type Put = { key: string; contentType: string; bytes: Buffer };

function bucket(onGet: (key: string) => Promise<void> = async () => {}) {
  const puts: Put[] = [];
  const gets: string[] = [];
  return {
    puts,
    gets,
    storage: {
      async put(key: string, bytes: Buffer, contentType: string) {
        puts.push({ key, contentType, bytes });
      },
      async get(key: string) {
        gets.push(key);
        await onGet(key);
        const found = puts.findLast((put) => put.key === key);
        if (found === undefined) throw new Error("NoSuchKey");
        return found.bytes;
      },
    },
  };
}
type Bucket = ReturnType<typeof bucket>;

const generous = () => inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 10_000 });

const uploadsOf = (
  store: Bucket,
  limiters: { perHour?: RateLimiter } = {},
  processingBudgetMs = PHOTO_PROCESSING_BUDGET_MS,
): PhotoUploads => ({
  kind: "on",
  storage: store.storage,
  limiters: { perHour: limiters.perHour ?? generous(), perDay: generous() },
  processingBudgetMs,
});

async function call<T = KabinetAnimalView>(
  path: string,
  input: unknown,
  opts: { uploads: PhotoUploads; principal?: KabinetPrincipal; now?: Date },
): Promise<{ status: number; body: T; raw: string }> {
  const { body, headers } = rpcRequestInit(input);
  const request = new Request(`${ORIGIN}/api/kabinet/${path.replaceAll(".", "/")}`, {
    method: "POST",
    headers: { ...headers, cookie: TEST_SESSION_COOKIE, origin: ORIGIN },
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
  const raw = await response.text();
  let parsed: unknown = raw;
  try {
    parsed = fromRpcBody(JSON.parse(raw));
  } catch {
    // a plain-text refusal
  }
  return { status: response.status, body: parsed as T, raw };
}

const errorOf = (body: unknown) => body as { code?: string; data?: unknown };
const reload = async (id: string) => (await animalRepo(db).findById(id as never)) as Animal;
const photoHistory = async () =>
  (await kabinetShelterRepo(db).historyOf(shelter.id)).filter(
    (entry) => entry.kind === "animal_edited" && entry.fields.includes("photos"),
  );

/** 1600 × 1200 grey, with a red block at x 800-1200, y 120-620: the frame below sits on it. */
async function photoFile(): Promise<File> {
  const red = await sharp({
    create: { width: 400, height: 500, channels: 3, background: "#ff0000" },
  })
    .png()
    .toBuffer();
  const bytes = await sharp({
    create: { width: 1600, height: 1200, channels: 3, background: { r: 60, g: 60, b: 60 } },
  })
    .composite([{ input: red, left: 800, top: 120 }])
    .jpeg({ quality: 95 })
    .toBuffer();
  return new File([new Uint8Array(bytes)], "photo.jpg", { type: "image/jpeg" });
}

/** The 400 × 500 px frame on the block, as fractions of 1600 × 1200. */
const ON_THE_BLOCK: PhotoFraming = {
  kind: "frame",
  frame: { x: 0.5, y: 0.1, w: 0.25, h: 500 / 1200 },
};
/** The framing the server stores: fractions rounded to 1/10 000. */
const stored = (framing: PhotoFraming): PhotoFraming =>
  framing.kind === "attention"
    ? framing
    : { kind: "frame", frame: frameOfUnits(frameUnitsOf(framing.frame)) };

const isRedInTheMiddle = async (bytes: Buffer) => {
  const { data, info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
  const i = (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * info.channels;
  return (data[i] ?? 0) > 200 && (data[i + 1] ?? 255) < 60 && (data[i + 2] ?? 255) < 60;
};

/** A published animal with one photo uploaded through `add`, and that upload's bucket. */
async function withUploadedPhoto(store = bucket()) {
  const target = makeAnimal({ shelterId: shelter.id, photos: [] });
  await animalRepo(db).insert(target, cityId as never);
  const added = await call(
    "shelter.photos.add",
    { animalId: target.id, file: await photoFile() },
    { uploads: uploadsOf(store) },
  );
  expect(added.status).toBe(200);
  const photo = added.body.photos[0] as AnimalPhoto;
  return { target: await reload(target.id), photo, view: added.body, store };
}

const crop = (animal: Animal, storageKey: string, framing: PhotoFraming) => ({
  animalId: animal.id,
  expectedPhotoKeys: animal.photos.map((p) => p.storageKey),
  storageKey,
  framing,
});

const SOURCE_NAME =
  /^source-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/;

describe("shelter.photos.add keeps the source", () => {
  it("stores it beside the variants and the owner's view names it, unframed", async () => {
    const { photo, view, store } = await withUploadedPhoto();
    const sourcePut = store.puts.find(
      (put) => !/\/(thumb|card|detail|mid|compact)\.webp$/.test(put.key),
    );
    expect(sourcePut?.key.slice(photo.storageKey.length + 1)).toMatch(SOURCE_NAME);
    expect(view.photoCrops).toEqual([
      {
        storageKey: photo.storageKey,
        framing: { kind: "attention" },
        source: {
          kind: "kept",
          objectKey: sourcePut?.key,
          origin: "upload",
          width: 1600,
          height: 1200,
        },
      },
    ]);
    const meta = await sharp(sourcePut?.bytes).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["webp", 1600, 1200]);
  });
});

describe("shelter.photos.crop", () => {
  it("cuts five variants from the frame and copies the source under a new key, swapped in place", async () => {
    const { target, photo, store } = await withUploadedPhoto();
    const oldSource = store.puts.at(-1) as Put;
    const putsBefore = store.puts.length;
    const historyBefore = (await photoHistory()).length;
    // After the upload, which ran on the real clock: «Оновлено» never moves back.
    const now = new Date(Date.now() + 3_600_000);

    const result = await call("shelter.photos.crop", crop(target, photo.storageKey, ON_THE_BLOCK), {
      uploads: uploadsOf(store),
      now,
    });

    expect(result.status).toBe(200);
    const [cropped] = result.body.photos;
    expect(cropped?.storageKey).not.toBe(photo.storageKey);
    expect(cropped?.storageKey).toMatch(new RegExp(`^animals/${target.id}/[0-9a-f-]{36}$`));
    // Only the key changes: width, height and alt stay the photo's.
    expect(cropped).toEqual({ ...photo, storageKey: cropped?.storageKey });

    // Read back: exactly the kept source, once.
    expect(store.gets).toEqual([oldSource.key]);
    const written = store.puts.slice(putsBefore);
    const newKey = cropped?.storageKey as string;
    expect(written.every((put) => put.key.startsWith(`${newKey}/`))).toBe(true);
    expect(written).toHaveLength(IMAGE_VARIANT_NAMES.length + 1);
    for (const name of IMAGE_VARIANT_NAMES) {
      const bytes = written.find((put) => put.key === `${newKey}/${name}.webp`)?.bytes as Buffer;
      const meta = await sharp(bytes).metadata();
      expect([meta.width, meta.height], name).toEqual([
        IMAGE_VARIANTS[name].width,
        IMAGE_VARIANTS[name].height,
      ]);
      expect(await isRedInTheMiddle(bytes), name).toBe(true);
    }
    // The source is a byte copy, never a server-side copy, under an unguessable new name.
    const newSource = written.at(-1) as Put;
    expect(newSource.key.slice(newKey.length + 1)).toMatch(SOURCE_NAME);
    expect(newSource.bytes.equals(oldSource.bytes)).toBe(true);

    expect(result.body.photoCrops).toEqual([
      {
        storageKey: newKey,
        framing: stored(ON_THE_BLOCK),
        source: {
          kind: "kept",
          objectKey: newSource.key,
          origin: "upload",
          width: 1600,
          height: 1200,
        },
      },
    ]);
    // The old key's row went in the same statement; the old files stay for the clean-up job.
    const rows = await photoSourcesRepo(db).listForAnimal(target.id, shelter.id);
    expect(rows.map((row) => row.storageKey)).toEqual([newKey]);

    const after = await reload(target.id);
    expect(after.photos.map((p) => p.storageKey)).toEqual([newKey]);
    expect(after.lastUpdatedAt).toEqual(now);
    // «Оновлено» moves on a published card (crop-frame Q5, RH-B7).
    expect(after.listing).toMatchObject({ kind: "published", confirmedAt: now });
    expect(await photoHistory()).toHaveLength(historyBefore + 1);
  });

  it("back to the automatic crop is cut from the same source, under another new key", async () => {
    const { target, photo, store } = await withUploadedPhoto();
    const uploads = uploadsOf(store);
    const framed = await call("shelter.photos.crop", crop(target, photo.storageKey, ON_THE_BLOCK), {
      uploads,
    });
    const framedKey = framed.body.photos[0]?.storageKey as string;
    const framedSource = framed.body.photoCrops[0]?.source;

    const reset = await call(
      "shelter.photos.crop",
      crop(await reload(target.id), framedKey, { kind: "attention" }),
      { uploads },
    );

    expect(reset.status).toBe(200);
    const resetKey = reset.body.photos[0]?.storageKey;
    expect(new Set([photo.storageKey, framedKey, resetKey]).size).toBe(3);
    expect(store.gets.at(-1)).toBe(framedSource?.kind === "kept" ? framedSource.objectKey : null);
    expect(reset.body.photoCrops[0]?.framing).toEqual({ kind: "attention" });
  });

  it("the framing already stored writes nothing: no file, no row, no date, no history line", async () => {
    const { target, photo, store } = await withUploadedPhoto();
    const putsBefore = store.puts.length;
    const historyBefore = (await photoHistory()).length;

    const same = await call(
      "shelter.photos.crop",
      crop(target, photo.storageKey, { kind: "attention" }),
      { uploads: uploadsOf(store), now: new Date("2030-01-01T00:00:00.000Z") },
    );

    expect(same.status).toBe(200);
    expect(same.body.photos).toEqual(target.photos);
    expect(store.puts).toHaveLength(putsBefore);
    expect(store.gets).toEqual([]);
    expect((await reload(target.id)).lastUpdatedAt).toEqual(target.lastUpdatedAt);
    expect(await photoHistory()).toHaveLength(historyBefore);
  });

  describe("an older photo, with no kept source (crop-frame Q3)", () => {
    async function olderPhoto() {
      const store = bucket();
      const draft = makeAnimal({ shelterId: shelter.id });
      const storageKey = `animals/${draft.id}/${crypto.randomUUID()}`;
      const target = {
        ...draft,
        photos: [{ storageKey, width: 1600, height: 1200, alt: null }],
      };
      await animalRepo(db).insert(target, cityId as never);
      const detail = await sharp({
        create: { width: 1120, height: 1400, channels: 3, background: { r: 60, g: 60, b: 60 } },
      })
        .webp({ quality: 82 })
        .toBuffer();
      await store.storage.put(`${storageKey}/detail.webp`, detail, "image/webp");
      return { target, storageKey, store };
    }

    it("shows as variants_only, and a crop zooms inside its detail variant, which becomes its source", async () => {
      const { target, storageKey, store } = await olderPhoto();
      const before = await call(
        "shelter.animals.byId",
        { animalId: target.id },
        {
          uploads: uploadsOf(store),
        },
      );
      expect(before.body.photoCrops).toEqual([
        { storageKey, framing: { kind: "attention" }, source: { kind: "variants_only" } },
      ]);

      const zoom: PhotoFraming = { kind: "frame", frame: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 } };
      const result = await call("shelter.photos.crop", crop(target, storageKey, zoom), {
        uploads: uploadsOf(store),
      });

      expect(result.status).toBe(200);
      expect(store.gets).toEqual([`${storageKey}/detail.webp`]);
      const newKey = result.body.photos[0]?.storageKey as string;
      expect(result.body.photoCrops).toEqual([
        {
          storageKey: newKey,
          framing: stored(zoom),
          source: {
            kind: "kept",
            objectKey: store.puts.at(-1)?.key,
            origin: "detail_variant",
            width: 1120,
            height: 1400,
          },
        },
      ]);
    });

    it("the automatic crop on it is the crop it already has: nothing read, nothing written", async () => {
      const { target, storageKey, store } = await olderPhoto();
      const putsBefore = store.puts.length;
      const result = await call(
        "shelter.photos.crop",
        crop(target, storageKey, { kind: "attention" }),
        { uploads: uploadsOf(store) },
      );
      expect(result.status).toBe(200);
      expect(store.gets).toEqual([]);
      expect(store.puts).toHaveLength(putsBefore);
      expect(await photoHistory()).toEqual([]);
    });
  });

  // Review of #490: `frameBoxOf` must only ever see a parsed frame. oRPC's serializer carries
  // NaN and Infinity, so this reaches the contract's `PhotoFramingSchema`, which refuses them.
  it.each([
    ["NaN", { x: Number.NaN, y: 0, w: 0.25, h: 0.4 }],
    ["Infinity", { x: 0, y: 0, w: Number.POSITIVE_INFINITY, h: 0.4 }],
  ])(
    "a frame with %s is 400 BAD_REQUEST, before the allowance or the source",
    async (_label, frame) => {
      const { target, photo, store } = await withUploadedPhoto();
      const putsBefore = store.puts.length;
      const perHour = inMemoryRateLimiter({ windowMs: 3_600_000, maxRequests: 1 });
      const result = await call(
        "shelter.photos.crop",
        crop(target, photo.storageKey, { kind: "frame", frame }),
        { uploads: uploadsOf(store, { perHour }) },
      );
      expect(result.status).toBe(400);
      expect(errorOf(result.body).code).toBe("BAD_REQUEST");
      expect(store.gets).toEqual([]);
      expect(store.puts).toHaveLength(putsBefore);
      // Refused at the contract, before the handler: the allowance is still unspent.
      expect(
        (
          await call("shelter.photos.crop", crop(target, photo.storageKey, ON_THE_BLOCK), {
            uploads: uploadsOf(store, { perHour }),
          })
        ).status,
      ).toBe(200);
    },
  );

  it.each([
    ["aspect", { x: 0.5, y: 0, w: 0.5, h: 0.5 }],
    ["too_small", { x: 0, y: 0, w: 0.2, h: 400 / 1200 }],
  ] as const)(
    "a frame the source can't cut is 422 PHOTO_FRAME_REJECTED %s, before anything is read",
    async (reason, frame) => {
      const { target, photo, store } = await withUploadedPhoto();
      const putsBefore = store.puts.length;
      const historyBefore = (await photoHistory()).length;
      const result = await call(
        "shelter.photos.crop",
        crop(target, photo.storageKey, { kind: "frame", frame }),
        { uploads: uploadsOf(store) },
      );
      expect(result.status).toBe(422);
      expect(errorOf(result.body)).toMatchObject({
        code: "PHOTO_FRAME_REJECTED",
        data: { reason },
      });
      expect(store.gets).toEqual([]);
      expect(store.puts).toHaveLength(putsBefore);
      expect(await photoHistory()).toHaveLength(historyBefore);
    },
  );

  it("a stale photo list is 409 CONFLICT, before anything is read or written", async () => {
    const { target, photo, store } = await withUploadedPhoto();
    const putsBefore = store.puts.length;
    const result = await call(
      "shelter.photos.crop",
      {
        ...crop(target, photo.storageKey, ON_THE_BLOCK),
        expectedPhotoKeys: [photo.storageKey, "animals/x/gone"],
      },
      { uploads: uploadsOf(store) },
    );
    expect(result.status).toBe(409);
    expect(errorOf(result.body).code).toBe("CONFLICT");
    expect(store.gets).toEqual([]);
    expect(store.puts).toHaveLength(putsBefore);
  });

  it("uploads off: 503 PHOTO_UPLOADS_UNAVAILABLE", async () => {
    const { target, photo } = await withUploadedPhoto();
    const result = await call("shelter.photos.crop", crop(target, photo.storageKey, ON_THE_BLOCK), {
      uploads: { kind: "off", because: "preview" },
    });
    expect(result.status).toBe(503);
    expect(errorOf(result.body).code).toBe("PHOTO_UPLOADS_UNAVAILABLE");
  });

  it("charges the upload allowance like an upload (crop-frame Q5), a refused frame included", async () => {
    const { target, photo, store } = await withUploadedPhoto();
    const perHour = inMemoryRateLimiter({ windowMs: 3_600_000, maxRequests: 1 });
    const refused = await call(
      "shelter.photos.crop",
      crop(target, photo.storageKey, { kind: "frame", frame: { x: 0, y: 0, w: 0.5, h: 0.5 } }),
      { uploads: uploadsOf(store, { perHour }) },
    );
    expect(refused.status).toBe(422);
    const limited = await call(
      "shelter.photos.crop",
      crop(target, photo.storageKey, ON_THE_BLOCK),
      {
        uploads: uploadsOf(store, { perHour }),
      },
    );
    expect(limited.status).toBe(429);
    expect(errorOf(limited.body).code).toBe("RATE_LIMITED");
    expect(store.gets).toEqual([]);
  });

  it("a lost race to a changed photo list is CONFLICT, and the new files are logged as orphaned", async () => {
    let target: Animal | null = null;
    const store = bucket(async () => {
      // Another tab removes the photo while this crop reads its source.
      if (target !== null) await animalRepo(db).update({ ...target, photos: [] }, cityId as never);
    });
    const uploaded = await withUploadedPhoto(store);
    target = uploaded.target;
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await call(
      "shelter.photos.crop",
      crop(uploaded.target, uploaded.photo.storageKey, ON_THE_BLOCK),
      { uploads: uploadsOf(store) },
    );

    expect(result.status).toBe(409);
    expect(errorOf(result.body).code).toBe("CONFLICT");
    const orphan = store.puts.at(-1)?.key.replace(/\/[^/]+$/, "");
    expect(logged).toHaveBeenCalledWith({ event: "photo_orphaned", storageKey: orphan });
    expect((await reload(uploaded.target.id)).photos).toEqual([]);
  });

  it("past the processing budget it fails like an upload, and what it cut late is never stored", async () => {
    let release = () => {};
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let holding = false;
    const store = bucket(async () => {
      if (holding) await released;
    });
    const { target, photo } = await withUploadedPhoto(store);
    const putsBefore = store.puts.length;
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    holding = true;

    const result = await call("shelter.photos.crop", crop(target, photo.storageKey, ON_THE_BLOCK), {
      uploads: uploadsOf(store, {}, 50),
    });

    expect(result.status).toBe(500);
    expect(logged.mock.calls).toEqual([[{ event: "photo_processing_over_budget", budgetMs: 50 }]]);
    release();
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(store.puts).toHaveLength(putsBefore);
    expect((await reload(target.id)).photos).toEqual(target.photos);
  });
});

describe("who receives a source key (crop frame, condition 2)", () => {
  it("a support view reads the animal with every source withheld, and can't crop", async () => {
    const { target, photo, store } = await withUploadedPhoto();
    const support: KabinetPrincipal = {
      kind: "support_view",
      moderatorId: "11111111-1111-4111-8111-111111111111" as never,
      shelterId: shelter.id,
    };

    const read = await call(
      "shelter.animals.byId",
      { animalId: target.id },
      {
        uploads: uploadsOf(store),
        principal: support,
      },
    );
    expect(read.status).toBe(200);
    expect(read.body.photoCrops).toEqual([
      {
        storageKey: photo.storageKey,
        framing: { kind: "attention" },
        source: { kind: "withheld" },
      },
    ]);
    expect(read.raw).not.toMatch(/source-[0-9a-f]{8}-/);

    const cropped = await call(
      "shelter.photos.crop",
      crop(target, photo.storageKey, ON_THE_BLOCK),
      { uploads: uploadsOf(store), principal: support },
    );
    expect(cropped.status).toBe(403);
    expect(errorOf(cropped.body).code).toBe("FORBIDDEN");
  });

  it("another shelter's admin reads nothing of it: 404, like a missing animal", async () => {
    const { target, store } = await withUploadedPhoto();
    const otherShelter = makeShelter({
      publicLocation: { ...makeShelter().publicLocation, cityId: cityId as never },
    });
    await shelterRepo(db).insert(otherShelter);
    const read = await call(
      "shelter.animals.byId",
      { animalId: target.id },
      {
        uploads: uploadsOf(store),
        principal: { kind: "shelter_admin", shelterAdminId: ADMIN, shelterId: otherShelter.id },
      },
    );
    expect(read.status).toBe(404);
    expect(read.raw).not.toMatch(/source-[0-9a-f]{8}-/);
  });
});
