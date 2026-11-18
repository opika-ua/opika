import { describe, expect, it, vi } from "vitest";
import { SITE_ORIGIN } from "../brand";
import { buildSitemapEntries, SITEMAP_URL_LIMIT } from "./sitemap-entries";

describe("buildSitemapEntries", () => {
  it("is empty and reads nothing while the site is not discoverable", async () => {
    const animals = vi.fn();
    const cities = vi.fn();
    expect(await buildSitemapEntries(false, { animals, cities })).toEqual([]);
    expect(animals).not.toHaveBeenCalled();
    expect(cities).not.toHaveBeenCalled();
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
    const urls = (await buildSitemapEntries(true, { animals, cities: async () => [] })).map(
      (e) => e.url,
    );
    expect(animals).toHaveBeenCalledTimes(1);
    expect(urls).toContain(`${SITE_ORIGIN}/tvaryny/a2`);
    expect(urls.filter((u) => u.endsWith("/prytulky/s1"))).toHaveLength(1);
    expect(urls).not.toContain(`${SITE_ORIGIN}/`);
    expect(urls).toContain(`${SITE_ORIGIN}/tvaryny`);
    expect(urls.every((u) => u.startsWith(SITE_ORIGIN))).toBe(true);
  });

  it("never exceeds the protocol limit", async () => {
    const items = Array.from({ length: SITEMAP_URL_LIMIT + 5 }, (_, i) => ({
      id: `a${i}`,
      shelterId: "s",
    }));
    const out = await buildSitemapEntries(true, {
      animals: async () => items,
      cities: async () => [{ slug: "kyiv", lastModified: new Date() }],
    });
    expect(out).toHaveLength(SITEMAP_URL_LIMIT);
    // City pages sit ahead of the animals, so the limit cuts animals first.
    expect(out.some((entry) => entry.url.endsWith("/tvaryny/misto/kyiv"))).toBe(true);
  });
});
