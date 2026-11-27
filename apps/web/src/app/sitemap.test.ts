import { randomUUID } from "node:crypto";
import { animalRepo, cityRepo, galleryRepo, shelterRepo } from "@opika/db/repos";
import { makeAnimal, makeCity, makeShelter, setupTestDatabase, truncateAll } from "@opika/db/test";
import type { AnimalPhoto, CityId, ShelterVerification } from "@opika/domain";
import { resolveSitemap } from "next/dist/build/webpack/loaders/metadata/resolve-route-data";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cityPagePath } from "../features/gallery/filter-url";
import { absoluteUrl } from "../seo/json-ld-builders";
import sitemap from "./sitemap";

/**
 * The served route end to end: fictional fixtures in the test database, `sitemap()` itself, then
 * Next's own renderer, so the `<image:image>` tags counted are the ones a crawler would read.
 */
let served: TestDb | undefined;
vi.mock("../api/db", () => ({
  getDb: () => {
    if (served === undefined) throw new Error("the test database is not set up");
    return served;
  },
}));

type TestDb = Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;
beforeAll(async () => {
  const setup = await setupTestDatabase();
  served = setup.db;
  cleanup = setup.cleanup;
});
afterAll(async () => cleanup?.());

const db = (): TestDb => {
  if (served === undefined) throw new Error("the test database is not set up");
  return served;
};

const NOW = new Date("2026-08-05T12:00:00.000Z");
const BASE = "https://cdn.test.invalid";
const MODERATOR = randomUUID() as never;

beforeEach(async () => {
  await truncateAll(db());
  // `sitemap()` reads the clock; only Date is faked, so the driver's timers still run.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.stubEnv("NEXT_PUBLIC_R2_PUBLIC_BASE_URL", BASE);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const photo = (storageKey: string): AnimalPhoto => ({
  storageKey,
  width: 1600,
  height: 2000,
  alt: null,
});
const PAUSED: ShelterVerification = {
  status: "paused",
  verifiedAt: NOW,
  verifiedBy: MODERATOR,
  pausedAt: NOW,
  pausedBy: { kind: "moderator", moderatorId: MODERATOR },
  reason: { code: "relocation", note: null },
  evidence: { items: [], submittedAt: NOW },
};
const PENDING: ShelterVerification = {
  status: "pending",
  submittedAt: NOW,
  evidence: { items: [], submittedAt: NOW },
};

async function shelterIn(
  cityId: CityId,
  verification?: ShelterVerification,
  earlyListingSince: Date | null = null,
) {
  const base = makeShelter();
  const shelter = makeShelter({
    ...(verification && { verification }),
    earlyListingSince,
    publicLocation: { ...base.publicLocation, cityId },
  });
  await shelterRepo(db()).insert(shelter);
  return shelter;
}

/** A verified shelter with two indexable animals, plus a paused and an early-listed (unverified) one. */
async function seed() {
  const city = makeCity();
  await cityRepo(db()).insert(city);
  const verified = await shelterIn(city.id);
  const paused = await shelterIn(city.id, PAUSED);
  const early = await shelterIn(city.id, PENDING, new Date(NOW.getTime() - 86_400_000));
  const rudyi = makeAnimal({
    shelterId: verified.id,
    name: "Рудий",
    photos: [
      photo("animals/rudyi/second"),
      photo("seed-photos/cat-1.jpg"),
      photo("animals/rudyi/first"),
    ],
  });
  const sirko = makeAnimal({
    shelterId: verified.id,
    name: "Сірко",
    photos: [photo("animals/sirko/one")],
  });
  const atPaused = makeAnimal({
    shelterId: paused.id,
    name: "На паузі",
    photos: [photo("animals/paused/one")],
  });
  const atEarly = makeAnimal({
    shelterId: early.id,
    name: "Ранній",
    photos: [photo("animals/early/one")],
  });
  await animalRepo(db()).insertMany(
    [rudyi, sirko, atPaused, atEarly].map((animal) => ({ animal, cityId: city.id })),
  );
  return { city, verified, rudyi, sirko, atPaused, atEarly };
}

const locsOf = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const imageLocsOf = (xml: string) =>
  [...xml.matchAll(/<image:loc>([^<]+)<\/image:loc>/g)].map((m) => m[1]);
const blockOf = (xml: string, url: string) =>
  xml.split("<url>").find((block) => block.includes(`<loc>${url}</loc>`)) ?? "";

describe("sitemap.xml image entries", () => {
  it("one <image:loc> per real photo of an indexable animal, in stored order; none for a noindex animal", async () => {
    const { rudyi, sirko, atPaused, atEarly } = await seed();
    const xml = resolveSitemap(await sitemap());

    expect(xml).toContain('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"');
    // Three real photos among the indexable animals; the seed key and the noindex animals add none.
    expect(imageLocsOf(xml)).toHaveLength(3);
    expect(imageLocsOf(blockOf(xml, absoluteUrl(`/tvaryny/${rudyi.id}`)))).toEqual([
      `${BASE}/animals/rudyi/second/detail.webp`,
      `${BASE}/animals/rudyi/first/detail.webp`,
    ]);
    expect(imageLocsOf(blockOf(xml, absoluteUrl(`/tvaryny/${sirko.id}`)))).toEqual([
      `${BASE}/animals/sirko/one/detail.webp`,
    ]);
    for (const hidden of [atPaused, atEarly]) {
      expect(xml).not.toContain(hidden.id);
      expect(xml).not.toContain(hidden.photos[0]?.storageKey);
    }
  });

  it("keeps the URL list, its order and lastmod as before the images", async () => {
    const { city, verified } = await seed();
    const [order, cityPages] = await Promise.all([
      galleryRepo(db()).sitemapRows({ now: NOW }),
      galleryRepo(db()).cityPages({ now: NOW }),
    ]);
    const withImages = resolveSitemap(await sitemap());

    // The list the route served before this change, for these fixtures.
    expect(locsOf(withImages)).toEqual(
      [
        "/",
        "/pro",
        "/prytulkam",
        "/polityka-konfidentsiinosti",
        "/prytulky",
        cityPagePath(city.slug),
        `/prytulky/${verified.id}`,
        ...order.map((row) => `/tvaryny/${row.id}`),
      ].map(absoluteUrl),
    );
    const lastmods = [...withImages.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1]);
    expect(lastmods).toEqual([cityPages[0]?.lastModified.toISOString()]);
    expect(blockOf(withImages, absoluteUrl(cityPagePath(city.slug)))).toContain("<lastmod>");

    // With no photo base the route renders no image at all; take the images out and the two agree.
    vi.stubEnv("NEXT_PUBLIC_R2_PUBLIC_BASE_URL", "");
    const without = resolveSitemap(await sitemap());
    expect(without).not.toContain("image:");
    expect(
      withImages
        .replace(' xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"', "")
        .replaceAll(/<image:image>\n<image:loc>[^<]+<\/image:loc>\n<\/image:image>\n/g, ""),
    ).toBe(without);
  });
});
