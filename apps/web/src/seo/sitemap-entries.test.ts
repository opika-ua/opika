import { describe, expect, it, vi } from "vitest";
import { SITE_ORIGIN } from "../brand";
import { buildSitemapEntries, SITEMAP_URL_LIMIT, type SitemapAnimal } from "./sitemap-entries";

const PHOTO_BASE = "https://cdn.test.invalid";

/** Below the species pages' threshold: neither page exists. */
const speciesCounts = async () => ({ dog: 0, cat: 0 });

describe("buildSitemapEntries", () => {
  it("is empty and reads nothing while the site is not discoverable", async () => {
    const animals = vi.fn();
    const cities = vi.fn();
    const species = vi.fn();
    expect(
      await buildSitemapEntries(false, {
        animals,
        cities,
        speciesCounts: species,
        photoBaseUrl: undefined,
      }),
    ).toEqual([]);
    expect(animals).not.toHaveBeenCalled();
    expect(cities).not.toHaveBeenCalled();
    expect(species).not.toHaveBeenCalled();
  });

  it("lists exactly the cities with a page, each with its newest indexable animal's update (SEO B3)", async () => {
    const kyivAt = new Date("2026-11-17T08:00:00.000Z");
    const lvivAt = new Date("2026-11-10T08:00:00.000Z");
    const entries = await buildSitemapEntries(true, {
      animals: async () => [],
      cities: async () => [
        { slug: "kyiv", lastModified: kyivAt },
        { slug: "lviv", lastModified: lvivAt },
      ],
      speciesCounts,
      photoBaseUrl: undefined,
    });
    const cityEntries = entries.filter((entry) => entry.url.includes("/tvaryny/misto/"));
    expect(cityEntries).toEqual([
      { url: `${SITE_ORIGIN}/tvaryny/misto/kyiv`, lastModified: kyivAt },
      { url: `${SITE_ORIGIN}/tvaryny/misto/lviv`, lastModified: lvivAt },
    ]);
  });

  it("lists animals, deduplicated shelters and static pages from one read", async () => {
    const animals = vi.fn(async () => [
      { id: "a1", shelterId: "s1", photos: [] },
      { id: "a2", shelterId: "s1", photos: [] },
    ]);
    const urls = (
      await buildSitemapEntries(true, {
        animals,
        cities: async () => [],
        speciesCounts,
        photoBaseUrl: undefined,
      })
    ).map((e) => e.url);
    expect(animals).toHaveBeenCalledTimes(1);
    expect(urls).toContain(`${SITE_ORIGIN}/tvaryny/a2`);
    expect(urls.filter((u) => u.endsWith("/prytulky/s1"))).toHaveLength(1);
    expect(urls.filter((u) => u === `${SITE_ORIGIN}/`)).toHaveLength(1);
    expect(urls).not.toContain(`${SITE_ORIGIN}/tvaryny`);
    expect(urls.every((u) => u.startsWith(SITE_ORIGIN))).toBe(true);
  });

  it("lists the privacy policy, indexed like the other static pages", async () => {
    const urls = (
      await buildSitemapEntries(true, {
        animals: async () => [],
        cities: async () => [],
        speciesCounts,
        photoBaseUrl: undefined,
      })
    ).map((e) => e.url);
    expect(urls).toContain(`${SITE_ORIGIN}/polityka-konfidentsiinosti`);
  });

  it("lists /prytulky only while a shelter is listed, i.e. while the page answers 200", async () => {
    const urlsWith = async (animals: readonly SitemapAnimal[]) =>
      (
        await buildSitemapEntries(true, {
          animals: async () => animals,
          cities: async () => [],
          speciesCounts,
          photoBaseUrl: undefined,
        })
      ).map((e) => e.url);
    const index = `${SITE_ORIGIN}/prytulky`;
    expect(await urlsWith([])).not.toContain(index);
    const listed = await urlsWith([{ id: "a1", shelterId: "s1", photos: [] }]);
    expect(listed.filter((u) => u === index)).toHaveLength(1);
    // With the static pages, ahead of the cities and the long tail the URL limit could cut.
    expect(listed.indexOf(index)).toBeLessThan(listed.indexOf(`${SITE_ORIGIN}/prytulky/s1`));
  });

  it("never exceeds the protocol limit", async () => {
    const items = Array.from({ length: SITEMAP_URL_LIMIT + 5 }, (_, i) => ({
      id: `a${i}`,
      shelterId: "s",
      photos: [],
    }));
    const out = await buildSitemapEntries(true, {
      animals: async () => items,
      cities: async () => [{ slug: "kyiv", lastModified: new Date() }],
      speciesCounts: async () => ({ dog: 10, cat: 10 }),
      photoBaseUrl: undefined,
    });
    expect(out).toHaveLength(SITEMAP_URL_LIMIT);
    // Species and city pages sit ahead of the animals, so the limit cuts animals first.
    expect(out.some((entry) => entry.url.endsWith("/tvaryny/misto/kyiv"))).toBe(true);
    expect(out.some((entry) => entry.url.endsWith("/tvaryny/vyd/sobaky"))).toBe(true);
  });

  it("lists a species page at 10 indexable animals and not at 9, with no lastmod (owner, 2026-11-27)", async () => {
    const entries = await buildSitemapEntries(true, {
      animals: async () => [],
      cities: async () => [],
      speciesCounts: async () => ({ dog: 10, cat: 9 }),
      photoBaseUrl: undefined,
    });
    expect(entries.filter((entry) => entry.url.includes("/tvaryny/vyd/"))).toEqual([
      { url: `${SITE_ORIGIN}/tvaryny/vyd/sobaky` },
    ]);
  });

  it("gives an animal entry one detail WebP per real photo, in stored order, and skips a seed key", async () => {
    const entries = await buildSitemapEntries(true, {
      animals: async () => [
        {
          id: "a1",
          shelterId: "s1",
          photos: [
            { storageKey: "animals/a1/second" },
            { storageKey: "seed-photos/dog-1.jpg" },
            { storageKey: "animals/a1/first" },
          ],
        },
        { id: "a2", shelterId: "s1", photos: [{ storageKey: "seed-photos/cat-2.jpg" }] },
      ],
      cities: async () => [{ slug: "kyiv", lastModified: new Date("2026-11-17T08:00:00.000Z") }],
      speciesCounts: async () => ({ dog: 10, cat: 0 }),
      photoBaseUrl: PHOTO_BASE,
    });
    const withImages = entries.filter((entry) => "images" in entry);
    expect(withImages).toEqual([
      {
        url: `${SITE_ORIGIN}/tvaryny/a1`,
        images: [
          `${PHOTO_BASE}/animals/a1/second/detail.webp`,
          `${PHOTO_BASE}/animals/a1/first/detail.webp`,
        ],
      },
    ]);
    // An animal with no real photo is a plain page entry, like every non-animal URL.
    expect(entries).toContainEqual({ url: `${SITE_ORIGIN}/tvaryny/a2` });
  });

  it("names no image without a photo base URL", async () => {
    const entries = await buildSitemapEntries(true, {
      animals: async () => [
        { id: "a1", shelterId: "s1", photos: [{ storageKey: "animals/a1/p" }] },
      ],
      cities: async () => [],
      speciesCounts,
      photoBaseUrl: undefined,
    });
    expect(entries.some((entry) => "images" in entry)).toBe(false);
    expect(entries).toContainEqual({ url: `${SITE_ORIGIN}/tvaryny/a1` });
  });

  it("keeps the URL list, its order and every lastmod exactly as before the images", async () => {
    const kyivAt = new Date("2026-11-17T08:00:00.000Z");
    const entries = await buildSitemapEntries(true, {
      animals: async () => [
        { id: "a1", shelterId: "s1", photos: [{ storageKey: "animals/a1/p" }] },
        { id: "a2", shelterId: "s2", photos: [] },
        { id: "a3", shelterId: "s1", photos: [{ storageKey: "animals/a3/p" }] },
      ],
      cities: async () => [{ slug: "kyiv", lastModified: kyivAt }],
      speciesCounts: async () => ({ dog: 10, cat: 0 }),
      photoBaseUrl: PHOTO_BASE,
    });
    // The list today's code (before the images) produces for this source, in its order.
    const before: readonly (readonly [string, Date | undefined])[] = [
      ["/", undefined],
      ["/pro", undefined],
      ["/prytulkam", undefined],
      ["/polityka-konfidentsiinosti", undefined],
      ["/prytulky", undefined],
      ["/tvaryny/vyd/sobaky", undefined],
      ["/tvaryny/misto/kyiv", kyivAt],
      ["/prytulky/s1", undefined],
      ["/prytulky/s2", undefined],
      ["/tvaryny/a1", undefined],
      ["/tvaryny/a2", undefined],
      ["/tvaryny/a3", undefined],
    ];
    expect(
      entries.map((entry) => [entry.url, "lastModified" in entry ? entry.lastModified : undefined]),
    ).toEqual(before.map(([path, lastModified]) => [`${SITE_ORIGIN}${path}`, lastModified]));
  });
});
