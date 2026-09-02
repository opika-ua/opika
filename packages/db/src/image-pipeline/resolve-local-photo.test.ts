import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
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
});
