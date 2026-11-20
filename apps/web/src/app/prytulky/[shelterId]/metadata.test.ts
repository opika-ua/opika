import { beforeEach, describe, expect, it, vi } from "vitest";
import {
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
  it("title is handoff B2's, with the shelter's name and city", async () => {
    expect((await generateMetadata({ params, searchParams })).title).toEqual({
      absolute: "Лапа допомоги – тварини шукають дім, Бровари – Opika",
    });
  });

  it("falls back to the name and brand rather than an empty city when it doesn't resolve", async () => {
    current = stubShelterPageClient({
      kind: "answer",
      shelter: makeShelterPageShelter({ publicLocation: { cityId: "unknown-city-id" as never } }),
    });
    expect((await generateMetadata({ params, searchParams })).title).toEqual({
      absolute: "Лапа допомоги – Opika",
    });
  });

  it("canonical is always the bare shelter URL, with no ?sort=/?page=", async () => {
    const withQuery = Promise.resolve({ sort: "longest_waiting", page: "2" });
    expect(
      (await generateMetadata({ params, searchParams: withQuery })).alternates?.canonical,
    ).toBe(`/prytulky/${SHELTER_ID}`);
  });

  it("openGraph carries the same title as the page", async () => {
    const metadata = await generateMetadata({ params, searchParams });
    expect(metadata.openGraph?.title).toBe("Лапа допомоги – тварини шукають дім, Бровари – Opika");
  });

  it("RATE_LIMITED is kept out of search results", async () => {
    current = stubShelterPageClient({ kind: "refuse", code: "RATE_LIMITED" });
    expect((await generateMetadata({ params, searchParams })).robots).toEqual({
      index: false,
      follow: false,
    });
  });

  /**
   * `REGISTRY_HAS_NO_REAL_SHELTERS` is `false` since launch step 13, so the demo branch needs a
   * module mock to be reached - the same `vi.doMock` + `vi.resetModules` +
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

    it("is handoff B2's, from the species the shelter lists, once real shelters exist", async () => {
      vi.doMock("../../../seo-flags", () => ({ REGISTRY_HAS_NO_REAL_SHELTERS: false }));
      const { generateMetadata: freshGenerateMetadata } = await import("./page");
      const description = (await freshGenerateMetadata({ params, searchParams })).description;
      expect(description).toBe(
        "Лапа допомоги, Бровари: собаки, які шукають дім. Контакти – на картці кожної тварини.",
      );
    });

    it("names both species from the shelter's unfiltered counts, whatever the filter in the URL", async () => {
      vi.doMock("../../../seo-flags", () => ({ REGISTRY_HAS_NO_REAL_SHELTERS: false }));
      const catsOnly = Promise.resolve({ vyd: "cat" });
      const { generateMetadata: freshGenerateMetadata } = await import("./page");
      const description = (await freshGenerateMetadata({ params, searchParams: catsOnly }))
        .description;
      expect(description).toBe(
        "Лапа допомоги, Бровари: собаки й коти, які шукають дім. Контакти – на картці кожної тварини.",
      );
    });
  });
});
