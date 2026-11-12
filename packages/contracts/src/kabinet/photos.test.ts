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

describe("crop names a photo the screen shows, with a frame or the automatic crop", () => {
  const crop = input(shelterPhotosContract.crop);
  const frame = { kind: "frame", frame: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 } } as const;

  it("accepts one of the expected keys with a frame or attention", () => {
    for (const framing of [frame, { kind: "attention" }]) {
      expect(
        crop.safeParse({
          animalId: ANIMAL,
          expectedPhotoKeys: [key(1)],
          storageKey: key(1),
          framing,
        }).success,
      ).toBe(true);
    }
  });

  it("refuses a key the screen doesn't show", () => {
    expect(
      crop.safeParse({
        animalId: ANIMAL,
        expectedPhotoKeys: [key(1)],
        storageKey: key(2),
        framing: frame,
      }).success,
    ).toBe(false);
  });

  it.each([
    ["a frame past the right edge", { kind: "frame", frame: { x: 0.6, y: 0, w: 0.5, h: 0.5 } }],
    ["a zero-width frame", { kind: "frame", frame: { x: 0, y: 0, w: 0, h: 0.5 } }],
    ["an extra key on the frame", { kind: "frame", frame: { ...frame.frame, z: 1 } }],
    ["a frame without its kind", frame.frame],
    ["an unknown kind", { kind: "centre" }],
  ])("refuses %s", (_label, framing) => {
    expect(
      crop.safeParse({ animalId: ANIMAL, expectedPhotoKeys: [key(1)], storageKey: key(1), framing })
        .success,
    ).toBe(false);
  });

  it("is strict: a source key or a shelter id sent along is refused", () => {
    const base = {
      animalId: ANIMAL,
      expectedPhotoKeys: [key(1)],
      storageKey: key(1),
      framing: frame,
    };
    expect(crop.safeParse({ ...base, sourceObjectKey: `${key(1)}/source-x.webp` }).success).toBe(
      false,
    );
    expect(crop.safeParse({ ...base, shelterId: ANIMAL }).success).toBe(false);
  });
});
