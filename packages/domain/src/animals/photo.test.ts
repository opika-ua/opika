import { describe, expect, it } from "vitest";
import { AnimalSchema } from "./animal";
import { MAX_ANIMAL_PHOTOS, PHOTO_MAX_EDGE_PX } from "./photo";

const photo = (n: number) => ({
  storageKey: `animals/a0000000-0000-4000-8000-000000000000/p${n}`,
  width: 800,
  height: 1000,
  alt: null,
});

describe("the photo cap on the stored animal (K-Q11)", () => {
  // Literal values transcribed from Oleksii's answers, not the constants read back.
  it("is ten photos and 2000 px", () => {
    expect(MAX_ANIMAL_PHOTOS).toBe(10);
    expect(PHOTO_MAX_EDGE_PX).toBe(2000);
  });

  it("accepts ten photos and refuses eleven", () => {
    const photos = AnimalSchema.shape.photos;
    expect(photos.safeParse(Array.from({ length: 10 }, (_, i) => photo(i))).success).toBe(true);
    expect(photos.safeParse(Array.from({ length: 11 }, (_, i) => photo(i))).success).toBe(false);
  });
});
