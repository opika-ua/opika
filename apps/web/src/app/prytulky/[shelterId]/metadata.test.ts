import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DESCRIPTION,
  makeShelterPageShelter,
  SHELTER_ID,
  stubShelterPageClient,
} from "../../../features/shelters/test-fixtures";

/**
 * `generateMetadata` (unlike `loadShelterPage`, which every other test in this
 * directory calls directly with an explicit stub client) always resolves the real
 * default `anonymousRouterClient()` - the route handler never passes one. Mocking the
 * module is the only way to stub it here, so this lives in its own file rather than
 * inside `page.test.tsx`'s real-database describe block, which calls
 * `anonymousRouterClient(h.db)` with an argument this mock would otherwise have to
 * handle too.
 */
let current = stubShelterPageClient();
vi.mock("../../../api/server-client", () => ({ anonymousRouterClient: () => current.client }));

const { generateMetadata } = await import("./page");

beforeEach(() => {
  current = stubShelterPageClient();
});

const params = Promise.resolve({ shelterId: SHELTER_ID });
const searchParams = Promise.resolve({});

describe("the shelter page's metadata (PR B, the SEO review of page titles)", () => {
  it("title is the shelter's name, then its city", async () => {
    expect((await generateMetadata({ params, searchParams })).title).toBe("Лапа допомоги, Бровари");
  });

  it("drops the city segment rather than rendering an empty one when it doesn't resolve", async () => {
    current = stubShelterPageClient({
      kind: "answer",
      shelter: makeShelterPageShelter({ publicLocation: { cityId: "unknown-city-id" as never } }),
    });
    expect((await generateMetadata({ params, searchParams })).title).toBe("Лапа допомоги");
  });

  it("canonical is always the bare shelter URL, with no ?sort=/?page=", async () => {
    const withQuery = Promise.resolve({ sort: "longest_waiting", page: "2" });
    expect(
      (await generateMetadata({ params, searchParams: withQuery })).alternates?.canonical,
    ).toBe(`/prytulky/${SHELTER_ID}`);
  });

  it("openGraph carries no title of its own – Next fills it from the already-templated one", async () => {
    const metadata = await generateMetadata({ params, searchParams });
    expect(metadata.openGraph).not.toHaveProperty("title");
  });

  it("RATE_LIMITED is kept out of search results", async () => {
    current = stubShelterPageClient({ kind: "refuse", code: "RATE_LIMITED" });
    expect((await generateMetadata({ params, searchParams })).robots).toEqual({
      index: false,
      follow: false,
    });
  });

  /**
   * `REGISTRY_HAS_NO_REAL_SHELTERS` is `true` today, so the two branches need their
   * own module mock to reach each one - the same `vi.doMock` + `vi.resetModules` +
   * dynamic re-import pattern `AnimalDetailScreen.test.tsx` uses for its own
   * demo-gated branches.
   */
  describe("description, by REGISTRY_HAS_NO_REAL_SHELTERS", () => {
    beforeEach(() => {
      vi.resetModules();
    });

    it("is the D-2 demo disclosure while the registry holds no real shelters", async () => {
      vi.doMock("../../../seo-flags", () => ({ REGISTRY_HAS_NO_REAL_SHELTERS: true }));
      const { generateMetadata: freshGenerateMetadata } = await import("./page");
      const description = (await freshGenerateMetadata({ params, searchParams })).description;
      expect(description).toBe(
        "На сайті поки немає справжніх притулків – усі картки тут демонстраційні.",
      );
    });

    it("is the shelter's own text, never padded, once real shelters exist", async () => {
      vi.doMock("../../../seo-flags", () => ({ REGISTRY_HAS_NO_REAL_SHELTERS: false }));
      const { generateMetadata: freshGenerateMetadata } = await import("./page");
      const description = (await freshGenerateMetadata({ params, searchParams })).description;
      expect(description).toBe(DESCRIPTION);
      expect(DESCRIPTION.length).toBeLessThan(120);
    });

    /**
     * The test above uses the fixture's own short `DESCRIPTION` (under 120 characters),
     * so it can prove "never padded" but can't prove the 160-character ceiling is real
     * - found on review: removing the trim call entirely still left that test green.
     * This one supplies a shelter description long enough to actually force the cut.
     */
    it("trims a long shelter description to 160 characters, at a word boundary", async () => {
      vi.doMock("../../../seo-flags", () => ({ REGISTRY_HAS_NO_REAL_SHELTERS: false }));
      const longDescription =
        "Цей притулок опікується тваринами вже багато років і завжди радий новим друзям та " +
        "волонтерам, які готові допомогти з доглядом, прогулянками, транспортуванням до ветлікаря " +
        "та пошуком дому для кожного мешканця притулку.";
      expect(longDescription.length).toBeGreaterThan(160);
      current = stubShelterPageClient({
        kind: "answer",
        shelter: makeShelterPageShelter({ description: { uk: longDescription, en: null } }),
      });
      const { generateMetadata: freshGenerateMetadata } = await import("./page");
      const description = (await freshGenerateMetadata({ params, searchParams })).description;
      expect(description?.length).toBeLessThanOrEqual(160);
      expect(description?.length).toBeGreaterThan(120);
      expect(longDescription.startsWith(description ?? "")).toBe(true);
    });
  });
});
