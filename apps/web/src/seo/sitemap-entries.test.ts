import { describe, expect, it, vi } from "vitest";
import { SITE_ORIGIN } from "../brand";
import { buildSitemapEntries, SITEMAP_URL_LIMIT } from "./sitemap-entries";

const pageOf = (items: { id: string; shelterId: string }[], totalPages: number) => ({
  items,
  totalPages,
});

describe("buildSitemapEntries", () => {
  it("is empty and reads nothing while the site is not discoverable", async () => {
    const animalPage = vi.fn();
    expect(await buildSitemapEntries(false, { animalPage })).toEqual([]);
    expect(animalPage).not.toHaveBeenCalled();
  });

  it("walks every page and lists animals, deduplicated shelters and static pages", async () => {
    const animalPage = vi.fn(async (page: number) =>
      page === 1
        ? pageOf([{ id: "a1", shelterId: "s1" }], 2)
        : pageOf([{ id: "a2", shelterId: "s1" }], 2),
    );
    const urls = (await buildSitemapEntries(true, { animalPage })).map((e) => e.url);
    expect(animalPage).toHaveBeenCalledTimes(2);
    expect(urls).toContain(`${SITE_ORIGIN}/tvaryny/a2`);
    expect(urls.filter((u) => u.endsWith("/prytulky/s1"))).toHaveLength(1);
    expect(urls.every((u) => u.startsWith(SITE_ORIGIN))).toBe(true);
  });

  it("never exceeds the protocol limit", async () => {
    const items = Array.from({ length: SITEMAP_URL_LIMIT + 5 }, (_, i) => ({
      id: `a${i}`,
      shelterId: "s",
    }));
    const out = await buildSitemapEntries(true, { animalPage: async () => pageOf(items, 1) });
    expect(out).toHaveLength(SITEMAP_URL_LIMIT);
  });
});
