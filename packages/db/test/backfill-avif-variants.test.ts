import { randomUUID } from "node:crypto";
import type { AnimalPhoto, CityId, PhotoFraming, ShelterId } from "@opika/domain";
import { sql } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  type BackfillStorage,
  formatPlan,
  loadBackfillPhotos,
  onACardNow,
  parseBackfillArgs,
  planAvifBackfill,
  runBackfill,
  writeAvifBackfill,
} from "../src/backfill-avif-variants";
import { cutPhotoVariants } from "../src/image-pipeline/crop-photo";
import { encodePhotoSource } from "../src/image-pipeline/photo-source";
import {
  IMAGE_VARIANT_NAMES,
  IMAGE_VARIANTS,
  photoSourceObjectKeyFor,
  variantObjectKey,
} from "../src/image-pipeline/variants";
import { executeRows } from "../src/raw-rows";
import { animalRepo } from "../src/repos/animal-repo";
import { cityRepo } from "../src/repos/city-repo";
import { type PhotoSource, photoSourcesRepo } from "../src/repos/photo-sources-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import {
  makeAnimal,
  makeCity,
  makeShelter,
  setupTestDatabase,
  truncateAll,
} from "../src/test-utils/index";

/**
 * The AVIF backfill (owner, 2026-11-16): new objects only, never an overwrite or a delete, the
 * WebP left as it was, idempotent, and each photo cut from its kept source or else its detail.webp.
 */
let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());
beforeEach(async () => truncateAll(db));

/** A bucket as R2 behaves for this job: a put to a taken key is refused (`IfNoneMatch: *`). */
function bucket() {
  const objects = new Map<string, Buffer>();
  const puts: { key: string; contentType: string }[] = [];
  const reads: string[] = [];
  const failingGets = new Set<string>();
  /** Runs once, on the next get: a photo taken off its card while the run is cutting it. */
  const onGet: { next: (() => Promise<void>) | null } = { next: null };
  const storage: BackfillStorage = {
    async put(key, body, contentType) {
      if (objects.has(key)) throw new Error("PreconditionFailed");
      objects.set(key, body);
      puts.push({ key, contentType });
    },
    async get(key) {
      reads.push(key);
      const hook = onGet.next;
      onGet.next = null;
      await hook?.();
      const body = objects.get(key);
      if (body === undefined || failingGets.has(key)) throw new Error("NoSuchKey");
      return body;
    },
    async exists(key) {
      reads.push(key);
      return objects.has(key);
    },
  };
  return { objects, puts, reads, failingGets, onGet, storage };
}
type Bucket = ReturnType<typeof bucket>;

/** 2000 × 1500 grey with a red block at x 1000-1600, y 200-1000. */
const SOURCE_FILE = await sharp({
  create: { width: 2000, height: 1500, channels: 3, background: { r: 60, g: 60, b: 60 } },
})
  .composite([
    {
      input: await sharp({
        create: { width: 600, height: 800, channels: 3, background: "#ff0000" },
      })
        .png()
        .toBuffer(),
      left: 1000,
      top: 200,
    },
  ])
  .png()
  .toBuffer();
const SOURCE = await encodePhotoSource(SOURCE_FILE);
/** 400 × 500 at (1100, 300): inside the red block. */
const RED_FRAME: PhotoFraming = { kind: "frame", frame: { x: 0.55, y: 0.2, w: 0.2, h: 1 / 3 } };
const DETAIL_WEBP = await sharp({
  create: { width: 1120, height: 1400, channels: 3, background: { r: 0, g: 0, b: 255 } },
})
  .webp({ quality: 82 })
  .toBuffer();
const PLACEHOLDER = Buffer.from([1]);

let cityId: CityId;
let shelterId: ShelterId;
beforeEach(async () => {
  const city = makeCity();
  await cityRepo(db).insert(city);
  cityId = city.id;
  const shelter = makeShelter({
    publicLocation: { ...makeShelter().publicLocation, cityId } as never,
    logo: { storageKey: `shelters/${randomUUID()}/logo/${randomUUID()}`, width: 160, height: 160 },
  });
  await shelterRepo(db).insert(shelter);
  shelterId = shelter.id;
});

type Stored = { storageKey: string; source: PhotoSource | null };

/**
 * One animal whose photos are stored as before AVIF: five WebP variants (a real detail.webp, the
 * rest placeholders, never read), and a kept source when `framing` is given.
 */
async function animalWith(store: Bucket, framings: readonly (PhotoFraming | null)[]) {
  const draft = makeAnimal({ shelterId });
  const stored: Stored[] = [];
  for (const framing of framings) {
    const storageKey = `animals/${draft.id}/${randomUUID()}`;
    for (const variant of IMAGE_VARIANT_NAMES) {
      const body = variant === "detail" ? DETAIL_WEBP : PLACEHOLDER;
      store.objects.set(variantObjectKey(storageKey, variant, "webp"), body);
    }
    let source: PhotoSource | null = null;
    if (framing !== null) {
      source = {
        storageKey,
        sourceObjectKey: photoSourceObjectKeyFor(storageKey, randomUUID()),
        origin: "upload",
        width: SOURCE.width,
        height: SOURCE.height,
        framing,
      };
      store.objects.set(source.sourceObjectKey, SOURCE.bytes);
    }
    stored.push({ storageKey, source });
  }
  const photos: AnimalPhoto[] = stored.map(({ storageKey }) => ({
    storageKey,
    width: SOURCE.width,
    height: SOURCE.height,
    alt: null,
  }));
  const animal = { ...draft, photos };
  await animalRepo(db).insert(animal, cityId);
  const sources = stored.flatMap(({ source }) => (source === null ? [] : [source]));
  if (sources.length > 0)
    await photoSourcesRepo(db).insertForAnimal(animal.id, sources, new Date());
  return stored;
}

/** The kabinet's removal, as far as the backfill can see it: the key leaves `animals.photos`. */
async function takeOffItsCard(storageKey: string): Promise<void> {
  await executeRows(
    db,
    sql`UPDATE "animals" SET "photos" = (SELECT jsonb_agg(photo) FROM jsonb_array_elements("photos") AS photo WHERE photo->>'storageKey' <> ${storageKey}) WHERE "photos" @> ${JSON.stringify([{ storageKey }])}::jsonb`,
  );
}

const avifKeysOf = (storageKey: string) =>
  IMAGE_VARIANT_NAMES.map((variant) => variantObjectKey(storageKey, variant, "avif"));

/** Mean absolute difference per channel of two same-size images, decoded. */
async function meanDifference(a: Buffer, b: Buffer): Promise<number> {
  const [left, right] = await Promise.all(
    [a, b].map((bytes) => sharp(bytes).removeAlpha().raw().toBuffer()),
  );
  if (left === undefined || right === undefined || left.length !== right.length) {
    throw new Error("the two images differ in size");
  }
  let sum = 0;
  for (let i = 0; i < left.length; i += 1) sum += Math.abs((left[i] ?? 0) - (right[i] ?? 0));
  return sum / left.length;
}

const centreIsRed = async (bytes: Buffer) => {
  const { data, info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
  const i = (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * info.channels;
  return (data[i] ?? 0) > 200 && (data[i + 1] ?? 255) < 60 && (data[i + 2] ?? 255) < 60;
};

describe("parseBackfillArgs", () => {
  it("takes --prod, --expect <ep>, --commit and --bucket <name>, and nothing else", () => {
    expect(parseBackfillArgs([])).toEqual({
      kind: "dry_run",
      expect: undefined,
      bucket: undefined,
    });
    expect(parseBackfillArgs(["--bucket", "photos"])).toEqual({
      kind: "dry_run",
      expect: undefined,
      bucket: "photos",
    });
    expect(
      parseBackfillArgs(["--prod", "--expect", "ep-x", "--commit", "--bucket", "photos"]),
    ).toEqual({ kind: "commit", expect: "ep-x", bucket: "photos" });
    expect(parseBackfillArgs(["--comit"])).toMatchObject({ kind: "refused" });
    expect(parseBackfillArgs(["--expect"])).toMatchObject({ kind: "refused" });
    expect(parseBackfillArgs(["--expect", "ep-a", "--expect", "ep-b"])).toMatchObject({
      kind: "refused",
    });
    expect(parseBackfillArgs(["--bucket"])).toMatchObject({ kind: "refused" });
    expect(parseBackfillArgs(["--bucket", "a", "--bucket", "b"])).toMatchObject({
      kind: "refused",
    });
  });

  it("refuses --commit without --bucket: the database guard names no bucket", () => {
    expect(parseBackfillArgs(["--prod", "--expect", "ep-x", "--commit"])).toEqual({
      kind: "refused",
      reason: "--commit needs --bucket <name>, the bucket it writes to (the dry run prints it)",
    });
  });

  it("never echoes an argument that could be a pasted URL", () => {
    const refused = parseBackfillArgs(["postgres://user:secret@host/db"]);
    expect(refused.kind).toBe("refused");
    expect(JSON.stringify(refused)).not.toContain("secret");
  });
});

describe("loadBackfillPhotos", () => {
  it("lists every photo on a card with its kept source, and no logo or seed photo", async () => {
    const store = bucket();
    const [framed, bare] = await animalWith(store, [RED_FRAME, null]);
    const seed = makeAnimal({
      shelterId,
      photos: [{ storageKey: "seed-photos/dog-1.jpg", width: 1, height: 1, alt: null }] as never,
    });
    await animalRepo(db).insert(seed, cityId);

    const photos = await loadBackfillPhotos(db);

    // The frame comes back in stored units, so the source is compared by its key.
    expect(
      photos.map(({ storageKey, source }) => [storageKey, source?.sourceObjectKey ?? null]),
    ).toEqual(
      [
        [framed?.storageKey, framed?.source?.sourceObjectKey],
        [bare?.storageKey, null],
      ].sort((a, b) => ((a[0] ?? "") < (b[0] ?? "") ? -1 : 1)),
    );
  });
});

describe("planAvifBackfill (the dry run: reads only)", () => {
  it("sorts each photo by what it would be cut from, and writes nothing", async () => {
    const store = bucket();
    const [kept, detailOnly, done, lost, nothing] = await animalWith(store, [
      RED_FRAME,
      null,
      { kind: "attention" },
      { kind: "attention" },
      null,
    ]);
    if (!kept || !detailOnly || !done || !lost || !nothing) throw new Error("fixture");
    for (const key of avifKeysOf(done.storageKey)) store.objects.set(key, PLACEHOLDER);
    // Two of five written by a stopped run: only the other three are missing.
    for (const key of avifKeysOf(kept.storageKey).slice(0, 2)) store.objects.set(key, PLACEHOLDER);
    store.objects.delete(lost.source?.sourceObjectKey ?? "");
    store.objects.delete(variantObjectKey(nothing.storageKey, "detail", "webp"));
    const before = new Map(store.objects);

    const plans = await planAvifBackfill(store.storage, await loadBackfillPhotos(db));
    const byKey = new Map(plans.map((plan) => [plan.storageKey, plan]));

    expect(byKey.get(kept.storageKey)).toMatchObject({
      kind: "write",
      from: {
        path: "kept_source",
        size: { width: 2000, height: 1500 },
        cut: { kind: "frame", box: { left: 1100, top: 300, width: 400, height: 500 } },
      },
      missing: IMAGE_VARIANT_NAMES.slice(2),
    });
    expect(byKey.get(detailOnly.storageKey)).toMatchObject({
      kind: "write",
      from: {
        path: "detail_variant",
        objectKey: variantObjectKey(detailOnly.storageKey, "detail", "webp"),
        size: { width: 1120, height: 1400 },
        cut: { kind: "attention" },
      },
      missing: IMAGE_VARIANT_NAMES,
    });
    expect(byKey.get(done.storageKey)).toEqual({ kind: "done", storageKey: done.storageKey });
    expect(byKey.get(lost.storageKey)).toEqual({
      kind: "skip",
      storageKey: lost.storageKey,
      reason: "kept_source_missing",
    });
    expect(byKey.get(nothing.storageKey)).toEqual({
      kind: "skip",
      storageKey: nothing.storageKey,
      reason: "no_source",
    });
    expect(store.puts).toEqual([]);
    expect(store.objects).toEqual(before);

    const printed = formatPlan(plans).join("\n");
    expect(printed).toContain("Photos on a card (animals/ keys): 5");
    expect(printed).toContain("already have all 5 AVIF variants: 1");
    expect(printed).toContain("cut from the kept source: 1 (3 AVIF objects)");
    expect(printed).toContain("cut from detail.webp (no kept source): 1 (5 AVIF objects)");
    expect(printed).toContain("skipped, nothing to cut from: 2");
    // A kept source's key stays out of the output; photo keys are public URLs anyway.
    expect(printed).not.toContain("source-");
  });
});

describe("writeAvifBackfill (--commit)", () => {
  it("puts only the missing AVIF objects, as image/avif; every other object stays byte for byte", async () => {
    const store = bucket();
    const [kept, detailOnly] = await animalWith(store, [RED_FRAME, null]);
    if (!kept || !detailOnly) throw new Error("fixture");
    const partial = avifKeysOf(kept.storageKey).slice(0, 2);
    for (const key of partial) store.objects.set(key, PLACEHOLDER);
    const before = new Map(store.objects);

    const plans = await planAvifBackfill(store.storage, await loadBackfillPhotos(db));
    const result = await writeAvifBackfill(store.storage, plans, onACardNow(db));

    const expected = [
      ...avifKeysOf(kept.storageKey).slice(2),
      ...avifKeysOf(detailOnly.storageKey),
    ].sort();
    expect([...result.written].sort()).toEqual(expected);
    expect(result.failed).toEqual([]);
    expect(store.puts.map((put) => put.key).sort()).toEqual(expected);
    expect(store.puts.every((put) => put.contentType === "image/avif")).toBe(true);
    for (const [key, body] of before) expect(store.objects.get(key), key).toBe(body);
    expect(store.objects.size).toBe(before.size + expected.length);
  });

  it("cuts a kept source by its frame: the same pixels a crop's WebP shows", async () => {
    const store = bucket();
    const [kept] = await animalWith(store, [RED_FRAME]);
    if (!kept?.source) throw new Error("fixture");
    const plans = await planAvifBackfill(store.storage, await loadBackfillPhotos(db));
    await writeAvifBackfill(store.storage, plans, onACardNow(db));

    const plan = plans[0];
    if (plan?.kind !== "write") throw new Error("expected a write");
    const webp = await cutPhotoVariants(SOURCE.bytes, SOURCE, plan.from.cut, ["webp"]);
    for (const variant of IMAGE_VARIANT_NAMES) {
      const avif = store.objects.get(variantObjectKey(kept.storageKey, variant, "avif"));
      if (avif === undefined) throw new Error(`${variant}: not written`);
      const meta = await sharp(avif).metadata();
      expect([meta.format, meta.compression, meta.width, meta.height], variant).toEqual([
        "heif",
        "av1",
        IMAGE_VARIANTS[variant].width,
        IMAGE_VARIANTS[variant].height,
      ]);
      expect(await centreIsRed(avif), variant).toBe(true);
      expect(await meanDifference(avif, webp[variant].webp), variant).toBeLessThan(6);
    }
  });

  it("cuts a photo with no kept source from its detail.webp", async () => {
    const store = bucket();
    const [detailOnly] = await animalWith(store, [null]);
    if (!detailOnly) throw new Error("fixture");
    await writeAvifBackfill(
      store.storage,
      await planAvifBackfill(store.storage, await loadBackfillPhotos(db)),
      onACardNow(db),
    );
    for (const variant of IMAGE_VARIANT_NAMES) {
      const avif = store.objects.get(variantObjectKey(detailOnly.storageKey, variant, "avif"));
      if (avif === undefined) throw new Error(`${variant}: not written`);
      const { data, info } = await sharp(avif).raw().toBuffer({ resolveWithObject: true });
      expect([info.width, info.height], variant).toEqual([
        IMAGE_VARIANTS[variant].width,
        IMAGE_VARIANTS[variant].height,
      ]);
      // detail.webp is solid blue, so every AVIF cut from it is too.
      expect(data[2] ?? 0, variant).toBeGreaterThan(200);
    }
  });

  it("is idempotent: a second run finds every photo done and writes nothing", async () => {
    const store = bucket();
    await animalWith(store, [RED_FRAME, null]);
    await writeAvifBackfill(
      store.storage,
      await planAvifBackfill(store.storage, await loadBackfillPhotos(db)),
      onACardNow(db),
    );
    const putsAfterFirst = store.puts.length;

    const again = await planAvifBackfill(store.storage, await loadBackfillPhotos(db));
    expect(again.every((plan) => plan.kind === "done")).toBe(true);
    expect(await writeAvifBackfill(store.storage, again, onACardNow(db))).toEqual({
      written: [],
      removed: [],
      failed: [],
    });
    expect(store.puts).toHaveLength(putsAfterFirst);
  });

  it("records a photo it can't read and goes on with the rest", async () => {
    const store = bucket();
    const [broken, fine] = await animalWith(store, [null, null]);
    if (!broken || !fine) throw new Error("fixture");
    store.failingGets.add(variantObjectKey(broken.storageKey, "detail", "webp"));

    const result = await writeAvifBackfill(
      store.storage,
      await planAvifBackfill(store.storage, await loadBackfillPhotos(db)),
      onACardNow(db),
    );

    expect(result.failed).toEqual([{ storageKey: broken.storageKey, message: "NoSuchKey" }]);
    expect([...result.written].sort()).toEqual(avifKeysOf(fine.storageKey).sort());
  });

  it("writes nothing for a photo taken off its card after the plan, and goes on with the rest", async () => {
    const store = bucket();
    const [leaving, staying] = await animalWith(store, [null, null]);
    if (!leaving || !staying) throw new Error("fixture");
    const plans = await planAvifBackfill(store.storage, await loadBackfillPhotos(db));
    expect(plans.every((plan) => plan.kind === "write")).toBe(true);
    // The shelter removes the photo while the run is reading it, after the plan was made.
    store.onGet.next = () => takeOffItsCard(leaving.storageKey);

    const result = await writeAvifBackfill(store.storage, plans, onACardNow(db));

    expect(result.removed).toEqual([leaving.storageKey]);
    expect([...result.written].sort()).toEqual(avifKeysOf(staying.storageKey).sort());
    expect(store.puts.filter((put) => put.key.startsWith(`${leaving.storageKey}/`))).toEqual([]);
  });
});

describe("runBackfill (the run past the database guards)", () => {
  const lines = () => {
    const printed: string[] = [];
    return { printed, print: (line: string) => printed.push(line) };
  };

  it("a dry run prints the bucket and the plan and never puts, with photos to write", async () => {
    const store = bucket();
    await animalWith(store, [RED_FRAME, null]);
    const out = lines();

    const code = await runBackfill(
      { kind: "dry_run", expect: undefined, bucket: undefined },
      { db, storage: store.storage, bucketName: "photos", print: out.print },
    );

    expect(code).toBe(0);
    expect(store.puts).toEqual([]);
    expect(out.printed[0]).toBe("Bucket: photos");
    expect(out.printed).toContain("DRY RUN (nothing is written)");
    expect(out.printed.join("\n")).toContain("cut from the kept source: 1 (5 AVIF objects)");
  });

  it("a commit with a --bucket that isn't the configured one reads and writes nothing", async () => {
    const store = bucket();
    await animalWith(store, [null]);
    const out = lines();

    const code = await runBackfill(
      { kind: "commit", expect: undefined, bucket: "photos-staging" },
      { db, storage: store.storage, bucketName: "photos", print: out.print },
    );

    expect(code).toBe(1);
    expect(store.reads).toEqual([]);
    expect(store.puts).toEqual([]);
    expect(out.printed).toEqual([
      "REFUSED: --bucket does not name the configured bucket (R2_BUCKET_NAME is photos). Nothing was read or written.",
    ]);
  });

  it("a commit naming the configured bucket writes every missing AVIF object", async () => {
    const store = bucket();
    const [photo] = await animalWith(store, [null]);
    if (!photo) throw new Error("fixture");
    const out = lines();

    const code = await runBackfill(
      { kind: "commit", expect: undefined, bucket: "photos" },
      { db, storage: store.storage, bucketName: "photos", print: out.print },
    );

    expect(code).toBe(0);
    expect(store.puts.map((put) => put.key).sort()).toEqual(avifKeysOf(photo.storageKey).sort());
    expect(out.printed).toContain("Written: 5 AVIF objects");
  });
});
