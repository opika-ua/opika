// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { AnimalPageView } from "../features/animal-detail/animal-page-load";
import { makeDetailAnimal, makeDetailShelter } from "../features/animal-detail/test-fixtures";
import { animalOgImage, OG_SIZE, SHORT_ANIMAL_CACHE, siteOgImage } from "./og-image";

async function render(response: Response) {
  const bytes = new Uint8Array(await response.arrayBuffer());
  const view = new DataView(bytes.buffer);
  return { bytes, width: view.getUint32(16), height: view.getUint32(20) };
}

function viewOf(
  animal: ReturnType<typeof makeDetailAnimal>,
  cityName: string | null = "Бровари",
): AnimalPageView {
  return { animal, cityName, shelter: makeDetailShelter() } as AnimalPageView;
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

describe("link-preview image headers", () => {
  const cacheOf = (res: Response) => res.headers.get("cache-control");
  const withShelter = (
    shelter: Parameters<typeof makeDetailShelter>[0],
    animal: Parameters<typeof makeDetailAnimal>[0] = { photos: [] },
  ): AnimalPageView =>
    ({
      animal: makeDetailAnimal(animal),
      cityName: "Бровари",
      shelter: makeDetailShelter(shelter),
    }) as AnimalPageView;

  it("a verified shelter's animal keeps the hour cache with stale-while-revalidate, and is noindex", async () => {
    const res = await animalOgImage(withShelter({ verification: "verified" }));
    expect(cacheOf(res)).toBe("public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400");
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
  });

  it("an early-listed shelter's animal gets about five minutes and no stale-while-revalidate", async () => {
    const res = await animalOgImage(withShelter({ verification: "listed_before_verification" }));
    expect(cacheOf(res)).toBe(SHORT_ANIMAL_CACHE);
    expect(cacheOf(res)).toContain("s-maxage=300");
    expect(cacheOf(res)).not.toContain("stale-while-revalidate");
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
  });

  it("the short cache also holds with a photo, which takes the palette-compression path", async () => {
    const res = await animalOgImage(
      withShelter(
        { verification: "listed_before_verification" },
        { photos: [{ storageKey: "seed-photos/cat-1.jpg", width: 800, height: 1000, alt: null }] },
      ),
    );
    expect(cacheOf(res)).toBe(SHORT_ANIMAL_CACHE);
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
  });

  it("a paused shelter's animal gets the short cache too", async () => {
    const res = await animalOgImage(
      withShelter({ verification: "verified" }, { photos: [], availability: { kind: "paused" } }),
    );
    expect(cacheOf(res)).toBe(SHORT_ANIMAL_CACHE);
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
  });

  it("the site card keeps its day cache; as the fallback for an unknown id it is short", async () => {
    const site = await siteOgImage();
    expect(cacheOf(site)).toContain("s-maxage=86400");
    expect(site.headers.get("x-robots-tag")).toBe("noindex");
    const unknown = await siteOgImage(SHORT_ANIMAL_CACHE);
    expect(cacheOf(unknown)).toBe(SHORT_ANIMAL_CACHE);
    expect(unknown.headers.get("x-robots-tag")).toBe("noindex");
  });
});
