import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AnimalIdSchema, type PhotoFraming } from "@opika/domain";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import type { ImageStorageClient } from "./r2-client";
import { storePhoto, uploadAnimalPhoto } from "./upload-animal-photo";
import { IMAGE_VARIANTS } from "./variants";

const REPO_ROOT = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));
const REAL_PHOTO = resolve(REPO_ROOT, "apps/web/public/seed-photos/dog-3.jpg");
const ANIMAL_ID = AnimalIdSchema.parse("a0000000-0000-4000-8000-000000000000");
const IDS = {
  photoId: "b1000000-0000-4000-8000-000000000001",
  sourceId: "c2000000-0000-4000-8000-000000000002",
};
const KEY = "animals/a0000000-0000-4000-8000-000000000000/b1000000-0000-4000-8000-000000000001";
const SOURCE_KEY = `${KEY}/source-c2000000-0000-4000-8000-000000000002.webp`;
const ATTENTION: PhotoFraming = { kind: "attention" };
const DIMENSIONS = { width: 1023, height: 782 };

/**
 * `ImageStorageClient` exists precisely so `uploadAnimalPhoto` can be
 * tested without a real bucket - round-1 review found this test missing
 * despite the interface already supporting it, not a gap that needed new
 * infrastructure to close.
 */
function fakeR2Client() {
  const puts: Array<{ key: string; contentType: string; body: Buffer }> = [];
  const client: ImageStorageClient = {
    async put(key, body, contentType) {
      puts.push({ key, contentType, body });
    },
    async get() {
      throw new Error("the onboarding upload never reads");
    },
  };
  return { client, puts };
}

const dir = mkdtempSync(join(tmpdir(), "opika-upload-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** A synthetic photo file: grey, a red block in its right half, bigger than any stored size. */
async function syntheticFile(width: number, height: number): Promise<string> {
  const block = await sharp({
    create: { width: Math.round(width / 4), height, channels: 3, background: "#ff0000" },
  })
    .png()
    .toBuffer();
  const path = join(dir, `photo-${width}x${height}.jpg`);
  writeFileSync(
    path,
    await sharp({ create: { width, height, channels: 3, background: "#808080" } })
      .composite([{ input: block, left: Math.round((width * 5) / 8), top: 0 }])
      .jpeg()
      .toBuffer(),
  );
  return path;
}

describe("uploadAnimalPhoto", () => {
  it("uploads every variant and the source under the derived storage key, each as image/webp", async () => {
    const { client, puts } = fakeR2Client();
    await uploadAnimalPhoto(client, REAL_PHOTO, ANIMAL_ID, IDS, DIMENSIONS, ATTENTION);

    expect(puts.map((p) => p.key).sort()).toEqual(
      [
        `${KEY}/card.webp`,
        `${KEY}/compact.webp`,
        `${KEY}/detail.webp`,
        `${KEY}/mid.webp`,
        SOURCE_KEY,
        `${KEY}/thumb.webp`,
      ].sort(),
    );
    for (const p of puts) {
      expect(p.contentType).toBe("image/webp");
      expect(p.body.byteLength).toBeGreaterThan(0);
    }
  });

  it("refuses a photo id or a source id that isn't a fresh UUID, such as an array index (P-Q13)", async () => {
    for (const ids of [
      { ...IDS, photoId: "2" },
      { ...IDS, sourceId: "2" },
    ]) {
      const { client, puts } = fakeR2Client();
      await expect(
        uploadAnimalPhoto(client, REAL_PHOTO, ANIMAL_ID, ids, DIMENSIONS, ATTENTION),
      ).rejects.toThrow(/fresh random/);
      expect(puts).toEqual([]);
    }
  });

  it("returns the ORIGINAL dimensions passed in, not any variant's fixed size", async () => {
    const { client } = fakeR2Client();
    const { photo } = await uploadAnimalPhoto(
      client,
      REAL_PHOTO,
      ANIMAL_ID,
      IDS,
      DIMENSIONS,
      ATTENTION,
    );

    // Real source dimensions, not any of IMAGE_VARIANTS' fixed sizes
    // (176x176 / 640x800 / 1120x1400) - a mistake here would silently
    // corrupt the aspect ratio every downstream reader trusts.
    expect(photo.width).toBe(1023);
    expect(photo.height).toBe(782);
    expect(photo.storageKey).toBe(KEY);
  });

  it("returns the source row: its key, origin, the stored source's own size and the framing", async () => {
    const { client, puts } = fakeR2Client();
    const { source } = await uploadAnimalPhoto(
      client,
      REAL_PHOTO,
      ANIMAL_ID,
      IDS,
      DIMENSIONS,
      ATTENTION,
    );
    const stored = puts.find((p) => p.key === SOURCE_KEY);
    const meta = await sharp(stored?.body).metadata();
    expect(source).toEqual({
      storageKey: KEY,
      sourceObjectKey: SOURCE_KEY,
      origin: "upload",
      width: meta.width,
      height: meta.height,
      framing: ATTENTION,
    });
    expect(meta.format).toBe("webp");
  });

  it("scales a file over 2000 px to fit, and cuts a frame from that copy (the red right half)", async () => {
    const path = await syntheticFile(4000, 3000);
    // 500 × 625 px of the 2000 × 1500 copy, inside the red block (x 1250-1750).
    const framing: PhotoFraming = {
      kind: "frame",
      frame: { x: 0.625, y: 0.2, w: 0.25, h: 625 / 1500 },
    };
    const { client, puts } = fakeR2Client();
    const { source } = await uploadAnimalPhoto(
      client,
      path,
      ANIMAL_ID,
      IDS,
      { width: 4000, height: 3000 },
      framing,
    );

    expect([source.width, source.height]).toEqual([2000, 1500]);
    expect(source.framing).toEqual(framing);
    for (const [name, spec] of Object.entries(IMAGE_VARIANTS)) {
      const body = puts.find((p) => p.key === `${KEY}/${name}.webp`)?.body;
      const { data, info } = await sharp(body).raw().toBuffer({ resolveWithObject: true });
      expect([info.width, info.height], name).toEqual([spec.width, spec.height]);
      // The frame lies inside the red block, so every variant is red through its middle.
      const i = (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * 3;
      expect(
        [data[i], data[i + 1], data[i + 2]].map((v) => (v ?? 0) > 200),
        name,
      ).toEqual([true, false, false]);
    }
  });

  it("refuses a frame its source can't cut before anything is stored", async () => {
    const path = await syntheticFile(4000, 3000);
    const { client, puts } = fakeR2Client();
    // 0.1 of the 2000 px copy is 200 px: under the 400 px minimum.
    await expect(
      uploadAnimalPhoto(
        client,
        path,
        ANIMAL_ID,
        IDS,
        { width: 4000, height: 3000 },
        { kind: "frame", frame: { x: 0, y: 0, w: 0.1, h: 250 / 1500 } },
      ),
    ).rejects.toThrow(/too_small/);
    expect(puts).toEqual([]);
  });
});

describe("storePhoto", () => {
  const variants = Object.fromEntries(
    Object.keys(IMAGE_VARIANTS).map((name) => [name, Buffer.from([1])]),
  ) as Record<keyof typeof IMAGE_VARIANTS, Buffer>;

  it.each([
    ["under another photo's key", `${KEY}x/source-c2000000-0000-4000-8000-000000000002.webp`],
    ["one level deeper", `${KEY}/source-x/c2000000-0000-4000-8000-000000000002.webp`],
    ["not named source-", `${KEY}/original.jpg`],
  ])("refuses a source %s, storing nothing", async (_label, objectKey) => {
    const { client, puts } = fakeR2Client();
    await expect(
      storePhoto(client, KEY, variants, { objectKey, bytes: Buffer.from([2]) }),
    ).rejects.toThrow(/directly under/);
    expect(puts).toEqual([]);
  });
});
