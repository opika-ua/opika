import { describe, expect, it, vi } from "vitest";
import { SITE_ORIGIN } from "../brand";
import { buildSitemapEntries, SITEMAP_URL_LIMIT } from "./sitemap-entries";

/** Below the species pages' threshold: neither page exists. */
const speciesCounts = async () => ({ dog: 0, cat: 0 });

describe("buildSitemapEntries", () => {
  it("is empty and reads nothing while the site is not discoverable", async () => {
    const animals = vi.fn();
    const cities = vi.fn();
    const species = vi.fn();
    expect(await buildSitemapEntries(false, { animals, cities, speciesCounts: species })).toEqual(
      [],
    );
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
    });
    const cityEntries = entries.filter((entry) => entry.url.includes("/tvaryny/misto/"));
    expect(cityEntries).toEqual([
      { url: `${SITE_ORIGIN}/tvaryny/misto/kyiv`, lastModified: kyivAt },
      { url: `${SITE_ORIGIN}/tvaryny/misto/lviv`, lastModified: lvivAt },
    ]);
  });

  it("lists animals, deduplicated shelters and static pages from one read", async () => {
    const animals = vi.fn(async () => [
      { id: "a1", shelterId: "s1" },
      { id: "a2", shelterId: "s1" },
    ]);
    const urls = (
      await buildSitemapEntries(true, { animals, cities: async () => [], speciesCounts })
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
      })
    ).map((e) => e.url);
    expect(urls).toContain(`${SITE_ORIGIN}/polityka-konfidentsiinosti`);
  });

  it("lists /prytulky only while a shelter is listed, i.e. while the page answers 200", async () => {
    const urlsWith = async (animals: readonly { id: string; shelterId: string }[]) =>
      (
        await buildSitemapEntries(true, {
          animals: async () => animals,
          cities: async () => [],
          speciesCounts,
        })
      ).map((e) => e.url);
    const index = `${SITE_ORIGIN}/prytulky`;
    expect(await urlsWith([])).not.toContain(index);
    const listed = await urlsWith([{ id: "a1", shelterId: "s1" }]);
    expect(listed.filter((u) => u === index)).toHaveLength(1);
    // With the static pages, ahead of the cities and the long tail the URL limit could cut.
    expect(listed.indexOf(index)).toBeLessThan(listed.indexOf(`${SITE_ORIGIN}/prytulky/s1`));
  });

  it("never exceeds the protocol limit", async () => {
    const items = Array.from({ length: SITEMAP_URL_LIMIT + 5 }, (_, i) => ({
      id: `a${i}`,
      shelterId: "s",
    }));
    const out = await buildSitemapEntries(true, {
      animals: async () => items,
      cities: async () => [{ slug: "kyiv", lastModified: new Date() }],
      speciesCounts: async () => ({ dog: 10, cat: 10 }),
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
    });
    expect(entries.filter((entry) => entry.url.includes("/tvaryny/vyd/"))).toEqual([
      { url: `${SITE_ORIGIN}/tvaryny/vyd/sobaky` },
    ]);
  });
});
