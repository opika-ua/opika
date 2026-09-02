import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveLocalPhotoPath, validateLocalPhoto } from "./resolve-local-photo";

const REPO_ROOT = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));
const SEED_PHOTOS_DIR = resolve(REPO_ROOT, "apps/web/public/seed-photos");
const INPUT_FILE = resolve(SEED_PHOTOS_DIR, "shelter-input.json");

describe("resolveLocalPhotoPath", () => {
  it("resolves a relative path against the input file's own directory, not process.cwd()", () => {
    expect(resolveLocalPhotoPath(INPUT_FILE, "cat-1.jpg")).toBe(
      resolve(SEED_PHOTOS_DIR, "cat-1.jpg"),
    );
    expect(resolveLocalPhotoPath(INPUT_FILE, "photos/cat-1.jpg")).toBe(
      resolve(SEED_PHOTOS_DIR, "photos/cat-1.jpg"),
    );
  });

  it("leaves an already-absolute path untouched", () => {
    const absolute = resolve(SEED_PHOTOS_DIR, "cat-1.jpg");
    expect(resolveLocalPhotoPath(INPUT_FILE, absolute)).toBe(absolute);
  });
});

describe("validateLocalPhoto", () => {
  it("reads real dimensions from a real image file, no network involved", async () => {
    const dimensions = await validateLocalPhoto(resolve(SEED_PHOTOS_DIR, "dog-3.jpg"));
    // Real, measured dimensions of this exact fixture (confirmed via sharp
    // metadata directly, not assumed) — a change here means the fixture
    // file itself changed, not that this function is guessing.
    expect(dimensions).toEqual({ width: 1023, height: 782 });
  });

  it("throws a clear error for a file that does not exist", async () => {
    await expect(
      validateLocalPhoto(resolve(SEED_PHOTOS_DIR, "does-not-exist.jpg")),
    ).rejects.toThrow(/not found/);
  });

  it("throws a clear error for a file that exists but is not a readable image", async () => {
    // SOURCES.md sits right next to the real photos — a real example of
    // "wrong file type", not a synthetic fixture.
    await expect(validateLocalPhoto(resolve(SEED_PHOTOS_DIR, "SOURCES.md"))).rejects.toThrow(
      /not a readable image/,
    );
  });

  describe("EXIF orientation", () => {
    // Round-1 review found the original implementation trusted sharp's
    // metadata().width/height directly, which report the STORED pixel
    // grid, not the displayed one — wrong for any photo carrying a 90°/270°
    // EXIF rotation tag, extremely common from phone cameras. Fixtures
    // generated with sharp's own withMetadata(), not hand-authored binary
    // files, so the exact tag value is verifiable in the test itself.
    let dir: string;

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), "opika-exif-test-"));
    });

    afterEach(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    async function writeFixture(orientation: number | undefined): Promise<string> {
      const path = join(dir, "photo.jpg");
      let pipeline = sharp({
        create: { width: 300, height: 200, channels: 3, background: { r: 200, g: 100, b: 50 } },
      });
      if (orientation !== undefined) pipeline = pipeline.withMetadata({ orientation });
      const buffer = await pipeline.jpeg().toBuffer();
      writeFileSync(path, buffer);
      return path;
    }

    it("reports stored dimensions unchanged when there is no rotation (orientation 1)", async () => {
      const path = await writeFixture(1);
      expect(await validateLocalPhoto(path)).toEqual({ width: 300, height: 200 });
    });

    it("reports stored dimensions unchanged when there is no EXIF orientation at all", async () => {
      const path = await writeFixture(undefined);
      expect(await validateLocalPhoto(path)).toEqual({ width: 300, height: 200 });
    });

    it("swaps width and height for a 90°-rotated source (orientation 6)", async () => {
      const path = await writeFixture(6);
      // Stored as 300x200; a 90° rotation means it actually displays as
      // 200x300 — this is the exact case a naive metadata().width/height
      // read gets backwards.
      expect(await validateLocalPhoto(path)).toEqual({ width: 200, height: 300 });
    });

    it("swaps width and height for a 270°-rotated source (orientation 8)", async () => {
      const path = await writeFixture(8);
      expect(await validateLocalPhoto(path)).toEqual({ width: 200, height: 300 });
    });

    it("does NOT swap for a mirrored-but-not-rotated orientation (4)", async () => {
      // Orientations 2-4 are flips, not 90°/270° rotations — the >= 5
      // threshold in resolve-local-photo.ts is deliberately specific to
      // the rotation cases, not "any non-1 orientation".
      const path = await writeFixture(4);
      expect(await validateLocalPhoto(path)).toEqual({ width: 300, height: 200 });
    });
  });
});
