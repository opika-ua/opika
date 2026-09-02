import { AnimalIdSchema } from "@opika/domain";
import { describe, expect, it } from "vitest";
import {
  animalPhotoStorageKey,
  IMAGE_VARIANTS,
  isRealPhotoKey,
  nearestVariant,
  r2PublicUrl,
  variantObjectKey,
} from "./variants";

const ANIMAL_ID = AnimalIdSchema.parse("a0000000-0000-4000-8000-000000000000");

describe("nearestVariant", () => {
  it("picks thumb for anything at or below 176", () => {
    expect(nearestVariant(88)).toBe("thumb");
    expect(nearestVariant(176)).toBe("thumb");
  });

  it("picks card for the measured gallery/deck 2x range", () => {
    expect(nearestVariant(177)).toBe("card");
    expect(nearestVariant(624)).toBe("card");
    expect(nearestVariant(640)).toBe("card");
  });

  it("picks detail for anything above card, up to and beyond the detail width", () => {
    expect(nearestVariant(641)).toBe("detail");
    expect(nearestVariant(1120)).toBe("detail");
  });

  it("never upscales past detail — the largest variant is the ceiling", () => {
    expect(nearestVariant(4000)).toBe("detail");
  });
});

describe("animalPhotoStorageKey", () => {
  it("derives a stable key from animal id and photo index", () => {
    expect(animalPhotoStorageKey(ANIMAL_ID, 0)).toBe(
      "animals/a0000000-0000-4000-8000-000000000000/0",
    );
    expect(animalPhotoStorageKey(ANIMAL_ID, 2)).toBe(
      "animals/a0000000-0000-4000-8000-000000000000/2",
    );
  });
});

describe("variantObjectKey", () => {
  it("appends the variant name and .webp extension", () => {
    expect(variantObjectKey("animals/x/0", "card")).toBe("animals/x/0/card.webp");
    expect(variantObjectKey("animals/x/0", "thumb")).toBe("animals/x/0/thumb.webp");
    expect(variantObjectKey("animals/x/0", "detail")).toBe("animals/x/0/detail.webp");
  });
});

describe("isRealPhotoKey", () => {
  it("recognises the animals/ namespace this module writes keys into", () => {
    expect(isRealPhotoKey("animals/a0000000-0000-4000-8000-000000000000/0")).toBe(true);
  });

  it("does not mistake seed.ts's actual storage keys for real ones — no leading slash either way", () => {
    // packages/db/src/seed.ts literally stores "seed-photos/dog-1.jpg", not
    // "/seed-photos/dog-1.jpg" — a leading-slash check can't tell these
    // apart, which is exactly why this function doesn't use one.
    expect(isRealPhotoKey("seed-photos/cat-1.jpg")).toBe(false);
    expect(isRealPhotoKey("seed-photos/dog-5.jpg")).toBe(false);
  });

  it("does not mistake an already-root-relative static asset for a real key", () => {
    expect(isRealPhotoKey("/icon.svg")).toBe(false);
    expect(isRealPhotoKey("/_next/static/media/logo.png")).toBe(false);
  });
});

describe("r2PublicUrl", () => {
  it("joins the public base url and the derived variant key", () => {
    expect(r2PublicUrl("https://cdn.example.com", "animals/x/0", "card")).toBe(
      "https://cdn.example.com/animals/x/0/card.webp",
    );
  });

  it("does not double a trailing slash on the base url", () => {
    expect(r2PublicUrl("https://cdn.example.com/", "animals/x/0", "card")).toBe(
      "https://cdn.example.com/animals/x/0/card.webp",
    );
  });
});

describe("IMAGE_VARIANTS", () => {
  it("card and detail are 4:5, matching the design's own photo aspect ratio", () => {
    expect(IMAGE_VARIANTS.card.height / IMAGE_VARIANTS.card.width).toBeCloseTo(1.25, 5);
    expect(IMAGE_VARIANTS.detail.height / IMAGE_VARIANTS.detail.width).toBeCloseTo(1.25, 5);
  });

  it("thumb is square, matching the detail page's 88px thumbnails", () => {
    expect(IMAGE_VARIANTS.thumb.width).toBe(IMAGE_VARIANTS.thumb.height);
  });
});
