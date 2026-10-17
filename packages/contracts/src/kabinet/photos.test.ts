import { describe, expect, it } from "vitest";
import {
  KABINET_MAX_BODY_BYTES,
  PHOTO_UPLOAD_MAX_FILE_BYTES,
  shelterPhotosContract,
} from "./procedures";

type Parse = { safeParse: (v: unknown) => { success: boolean } };
const input = (procedure: { "~orpc": { inputSchema?: unknown } }) =>
  procedure["~orpc"].inputSchema as Parse;

const ANIMAL = "a0000000-0000-4000-8000-000000000001";
const key = (n: number) => `animals/${ANIMAL}/k${n}`;

describe("photo upload size limits (P-Q7)", () => {
  // Transcribed literally: 4 MiB is the approved ceiling, not a value read back.
  it("the body ceiling is 4 MiB and the file fits inside it", () => {
    expect(KABINET_MAX_BODY_BYTES).toBe(4_194_304);
    expect(PHOTO_UPLOAD_MAX_FILE_BYTES).toBeLessThan(KABINET_MAX_BODY_BYTES);
  });

  it("add takes a file up to the file limit and refuses one byte more", () => {
    const at = new File([new Uint8Array(PHOTO_UPLOAD_MAX_FILE_BYTES)], "p.jpg");
    const over = new File([new Uint8Array(PHOTO_UPLOAD_MAX_FILE_BYTES + 1)], "p.jpg");
    expect(input(shelterPhotosContract.add).safeParse({ animalId: ANIMAL, file: at }).success).toBe(
      true,
    );
    expect(
      input(shelterPhotosContract.add).safeParse({ animalId: ANIMAL, file: over }).success,
    ).toBe(false);
  });

  it("add refuses a string where the file goes", () => {
    expect(
      input(shelterPhotosContract.add).safeParse({ animalId: ANIMAL, file: "data:image/jpeg" })
        .success,
    ).toBe(false);
  });
});

describe("reorder names exactly the photos it read (P-Q3)", () => {
  const reorder = input(shelterPhotosContract.reorder);

  it("accepts a permutation", () => {
    expect(
      reorder.safeParse({
        animalId: ANIMAL,
        expectedPhotoKeys: [key(1), key(2), key(3)],
        nextPhotoKeys: [key(3), key(1), key(2)],
      }).success,
    ).toBe(true);
  });

  it.each([
    ["a photo dropped", [key(1), key(2)]],
    ["a photo added", [key(1), key(2), key(3), key(4)]],
    ["a photo swapped for another", [key(1), key(2), key(9)]],
    ["a photo repeated", [key(1), key(1), key(2)]],
  ])("refuses %s", (_label, nextPhotoKeys) => {
    expect(
      reorder.safeParse({
        animalId: ANIMAL,
        expectedPhotoKeys: [key(1), key(2), key(3)],
        nextPhotoKeys,
      }).success,
    ).toBe(false);
  });

  it("refuses an eleven-photo list (K-Q11)", () => {
    const eleven = Array.from({ length: 11 }, (_, i) => key(i));
    expect(
      reorder.safeParse({ animalId: ANIMAL, expectedPhotoKeys: eleven, nextPhotoKeys: eleven })
        .success,
    ).toBe(false);
  });
});

describe("remove names a photo the screen shows", () => {
  const remove = input(shelterPhotosContract.remove);

  it("accepts one of the expected keys and refuses any other", () => {
    expect(
      remove.safeParse({ animalId: ANIMAL, expectedPhotoKeys: [key(1)], storageKey: key(1) })
        .success,
    ).toBe(true);
    expect(
      remove.safeParse({ animalId: ANIMAL, expectedPhotoKeys: [key(1)], storageKey: key(2) })
        .success,
    ).toBe(false);
  });
});
