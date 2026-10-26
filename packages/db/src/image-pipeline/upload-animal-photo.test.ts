import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AnimalIdSchema } from "@opika/domain";
import { describe, expect, it } from "vitest";
import type { ImageStorageClient } from "./r2-client";
import { uploadAnimalPhoto } from "./upload-animal-photo";

const REPO_ROOT = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));
const REAL_PHOTO = resolve(REPO_ROOT, "apps/web/public/seed-photos/dog-3.jpg");
const ANIMAL_ID = AnimalIdSchema.parse("a0000000-0000-4000-8000-000000000000");
const PHOTO_ID = "b1000000-0000-4000-8000-000000000001";

/**
 * `ImageStorageClient` exists precisely so `uploadAnimalPhoto` can be
 * tested without a real bucket - round-1 review found this test missing
 * despite the interface already supporting it, not a gap that needed new
 * infrastructure to close.
 */
function fakeR2Client() {
  const puts: Array<{ key: string; contentType: string; byteLength: number }> = [];
  const client: ImageStorageClient = {
    async put(key, body, contentType) {
      puts.push({ key, contentType, byteLength: body.byteLength });
    },
  };
  return { client, puts };
}

describe("uploadAnimalPhoto", () => {
  it("uploads all three variants under the derived storage key, each as image/webp", async () => {
    const { client, puts } = fakeR2Client();
    await uploadAnimalPhoto(client, REAL_PHOTO, ANIMAL_ID, PHOTO_ID, {
      width: 1023,
      height: 782,
    });

    const keys = puts.map((p) => p.key).sort();
    expect(keys).toEqual([
      "animals/a0000000-0000-4000-8000-000000000000/b1000000-0000-4000-8000-000000000001/card.webp",
      "animals/a0000000-0000-4000-8000-000000000000/b1000000-0000-4000-8000-000000000001/detail.webp",
      "animals/a0000000-0000-4000-8000-000000000000/b1000000-0000-4000-8000-000000000001/thumb.webp",
    ]);
    for (const p of puts) {
      expect(p.contentType).toBe("image/webp");
      expect(p.byteLength).toBeGreaterThan(0);
    }
  });

  it("refuses a photo id that isn't a fresh UUID, such as an array index (P-Q13)", async () => {
    const { client, puts } = fakeR2Client();
    await expect(
      uploadAnimalPhoto(client, REAL_PHOTO, ANIMAL_ID, "2", { width: 1023, height: 782 }),
    ).rejects.toThrow(/fresh random/);
    expect(puts).toEqual([]);
  });

  it("returns the ORIGINAL dimensions passed in, not any variant's fixed size", async () => {
    const { client } = fakeR2Client();
    const photo = await uploadAnimalPhoto(client, REAL_PHOTO, ANIMAL_ID, PHOTO_ID, {
      width: 1023,
      height: 782,
    });

    // Real source dimensions, not any of IMAGE_VARIANTS' fixed sizes
    // (176x176 / 640x800 / 1120x1400) - a mistake here would silently
    // corrupt the aspect ratio every downstream reader trusts.
    expect(photo.width).toBe(1023);
    expect(photo.height).toBe(782);
  });

  it("the returned storageKey is the key the variants were stored under", async () => {
    const { client, puts } = fakeR2Client();
    const photo = await uploadAnimalPhoto(client, REAL_PHOTO, ANIMAL_ID, PHOTO_ID, {
      width: 1023,
      height: 782,
    });

    expect(photo.storageKey).toBe(
      "animals/a0000000-0000-4000-8000-000000000000/b1000000-0000-4000-8000-000000000001",
    );
    expect(puts.every((p) => p.key.startsWith(`${photo.storageKey}/`))).toBe(true);
  });
});
