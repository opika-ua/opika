import { describe, expect, it, vi } from "vitest";
import { SITE_ORIGIN } from "../brand";
import { buildSitemapEntries, SITEMAP_URL_LIMIT } from "./sitemap-entries";

describe("buildSitemapEntries", () => {
  it("is empty and reads nothing while the site is not discoverable", async () => {
    const animals = vi.fn();
    expect(await buildSitemapEntries(false, { animals })).toEqual([]);
    expect(animals).not.toHaveBeenCalled();
  });

  it("lists animals, deduplicated shelters and static pages from one read", async () => {
    const animals = vi.fn(async () => [
      { id: "a1", shelterId: "s1" },
      { id: "a2", shelterId: "s1" },
    ]);
    const urls = (await buildSitemapEntries(true, { animals })).map((e) => e.url);
    expect(animals).toHaveBeenCalledTimes(1);
    expect(urls).toContain(`${SITE_ORIGIN}/tvaryny/a2`);
    expect(urls.filter((u) => u.endsWith("/prytulky/s1"))).toHaveLength(1);
    expect(urls.every((u) => u.startsWith(SITE_ORIGIN))).toBe(true);
  });

  it("never exceeds the protocol limit", async () => {
    const items = Array.from({ length: SITEMAP_URL_LIMIT + 5 }, (_, i) => ({
      id: `a${i}`,
      shelterId: "s",
    }));
    const out = await buildSitemapEntries(true, { animals: async () => items });
    expect(out).toHaveLength(SITEMAP_URL_LIMIT);
  });
});
