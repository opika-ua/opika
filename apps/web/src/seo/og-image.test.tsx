// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { AnimalPageView } from "../features/animal-detail/animal-page-load";
import { makeDetailAnimal } from "../features/animal-detail/test-fixtures";
import { animalOgImage, OG_SIZE, siteOgImage } from "./og-image";

async function render(response: Response) {
  const bytes = new Uint8Array(await response.arrayBuffer());
  const view = new DataView(bytes.buffer);
  return { bytes, width: view.getUint32(16), height: view.getUint32(20) };
}

function viewOf(
  animal: ReturnType<typeof makeDetailAnimal>,
  cityName: string | null = "Бровари",
): AnimalPageView {
  return { animal, cityName } as AnimalPageView;
}

describe("link-preview images (BR-7)", () => {
  it("the site card is a 1200x630 PNG", async () => {
    const res = await siteOgImage();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    const { width, height, bytes } = await render(res);
    expect({ width, height }).toEqual(OG_SIZE);
    expect(bytes.length).toBeGreaterThan(5_000);
  });

  it("an animal with a photo renders at the same size, and the photo shows in the bytes", async () => {
    const withPhoto = await render(
      await animalOgImage(
        viewOf(
          makeDetailAnimal({
            photos: [{ storageKey: "seed-photos/cat-1.jpg", width: 800, height: 1000, alt: null }],
          }),
        ),
      ),
    );
    const withoutPhoto = await render(
      await animalOgImage(viewOf(makeDetailAnimal({ photos: [] }))),
    );
    expect({ width: withPhoto.width, height: withPhoto.height }).toEqual(OG_SIZE);
    expect({ width: withoutPhoto.width, height: withoutPhoto.height }).toEqual(OG_SIZE);
    expect(withPhoto.bytes.length).toBeGreaterThan(withoutPhoto.bytes.length * 2);
  });

  it("a photo that cannot be had degrades to the no-photo card instead of failing", async () => {
    const missing = await render(
      await animalOgImage(
        viewOf(
          makeDetailAnimal({
            photos: [{ storageKey: "seed-photos/nope.jpg", width: 1, height: 1, alt: null }],
          }),
        ),
      ),
    );
    const none = await render(await animalOgImage(viewOf(makeDetailAnimal({ photos: [] }))));
    expect(missing.bytes.length).toBe(none.bytes.length);
  });

  it("a Cyrillic name is drawn: the card with a name outweighs the one without", async () => {
    const named = await render(
      await animalOgImage(viewOf(makeDetailAnimal({ name: "Їжачок Ґрейс", photos: [] }))),
    );
    const blank = await render(
      await animalOgImage(viewOf(makeDetailAnimal({ name: " ", photos: [] }))),
    );
    expect(named.bytes.length).toBeGreaterThan(blank.bytes.length + 1_000);
  });

  it("a very long name still renders", async () => {
    const res = await animalOgImage(
      viewOf(
        makeDetailAnimal({ name: "Олександра Ґвендолін Марія-Терезія Другорядна", photos: [] }),
      ),
    );
    expect((await render(res)).width).toBe(OG_SIZE.width);
  });

  it("carries nothing that can go stale: no age, reserved state or relative date reaches the card", async () => {
    const young = await render(
      await animalOgImage(viewOf(makeDetailAnimal({ photos: [], ageBucket: "young" }))),
    );
    const senior = await render(
      await animalOgImage(
        viewOf(makeDetailAnimal({ photos: [], ageBucket: "senior", listingKind: "reserved" })),
      ),
    );
    expect(Buffer.from(young.bytes).equals(Buffer.from(senior.bytes))).toBe(true);
  });

  it("is cache-friendly and short-lived for an animal", async () => {
    const res = await animalOgImage(viewOf(makeDetailAnimal({ photos: [] })));
    expect(res.headers.get("cache-control")).toMatch(/s-maxage=3600/);
  });
});
