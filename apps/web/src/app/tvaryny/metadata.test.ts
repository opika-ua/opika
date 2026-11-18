import type { CityLabelView } from "@opika/contracts";
import type { CityId } from "@opika/domain";
import { describe, expect, it, vi } from "vitest";
import { galleryMetadataOf } from "./page";

const TITLE = "Взяти собаку чи кота з притулку – Opika";
const DESCRIPTION =
  "Собаки й коти з притулків України шукають дім. Оберіть місто, вік і розмір та напишіть притулку напряму.";

const BROVARY = {
  id: "c1000000-0000-4000-8000-000000000001" as CityId,
  slug: "brovary-kyivska",
  kind: "city",
  nameScope: "unique_in_ukraine",
  regionId: "r0000000-0000-4000-8000-000000000001",
  name: "Бровари",
  regionShort: "Київська обл.",
  raion: null,
} as unknown as CityLabelView;

/** A client that resolves `brovary-kyivska` (and its former slug `brovary`); `hasPage` says whether its page exists. */
function stubClient(hasPage: boolean) {
  const resolveTokens = vi.fn(async ({ tokens }: { tokens: string[] }) =>
    tokens.map((token) =>
      token === BROVARY.slug
        ? { token, city: BROVARY, via: "slug" as const }
        : token === "brovary"
          ? { token, city: BROVARY, via: "alias" as const }
          : { token, city: null, via: null },
    ),
  );
  const withPages = vi.fn(async () => (hasPage ? [{ cityId: BROVARY.id, species: ["dog"] }] : []));
  return { client: { cities: { resolveTokens, withPages } } as never, resolveTokens, withPages };
}

const canonicalOf = async (hasPage: boolean, searchParams: Record<string, string>) =>
  (await galleryMetadataOf(stubClient(hasPage).client, searchParams)).alternates?.canonical;

describe("/tvaryny's own metadata (SEO handoff B2)", () => {
  it("title is the approved one, whole: the root template adds nothing", async () => {
    const metadata = await galleryMetadataOf(stubClient(false).client, {});
    expect(metadata.title).toEqual({ absolute: TITLE });
    expect(TITLE.length).toBeLessThanOrEqual(60);
  });

  it("description is the approved one", async () => {
    const metadata = await galleryMetadataOf(stubClient(false).client, {});
    expect(metadata.description).toBe(DESCRIPTION);
    expect(DESCRIPTION.length).toBeLessThan(155);
  });

  it("the link preview and the Twitter card carry the same strings, keeping the site name and locale", async () => {
    const metadata = await galleryMetadataOf(stubClient(false).client, {});
    expect(metadata.openGraph).toMatchObject({
      title: TITLE,
      description: DESCRIPTION,
      siteName: "Opika",
      locale: "uk_UA",
    });
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
      title: TITLE,
      description: DESCRIPTION,
    });
  });

  it("canonical is the bare path for any filter, sort or page without a single city", async () => {
    expect(await canonicalOf(true, {})).toBe("/tvaryny");
    expect(await canonicalOf(true, { vyd: "dog", sort: "longest_waiting", stor: "3" })).toBe(
      "/tvaryny",
    );
  });
});

describe("/tvaryny?misto= canonical (SEO B3, owner 2026-11-18)", () => {
  it("one city with a page: the city page, filters and sort dropped, the page number kept", async () => {
    expect(await canonicalOf(true, { misto: BROVARY.slug })).toBe("/tvaryny/misto/brovary-kyivska");
    expect(
      await canonicalOf(true, {
        misto: BROVARY.slug,
        vyd: "dog",
        vik: "baby",
        sort: "longest_waiting",
        stor: "3",
      }),
    ).toBe("/tvaryny/misto/brovary-kyivska?stor=3");
  });

  it("a former slug's canonical names the current one", async () => {
    expect(await canonicalOf(true, { misto: "brovary", stor: "2" })).toBe(
      "/tvaryny/misto/brovary-kyivska?stor=2",
    );
  });

  it("one city without a page keeps today's canonical", async () => {
    expect(await canonicalOf(false, { misto: BROVARY.slug, stor: "3" })).toBe("/tvaryny");
  });

  it("two cities, a city with an oblast, or an unknown city keep it too", async () => {
    const { client, withPages } = stubClient(true);
    for (const searchParams of [
      { misto: `${BROVARY.slug},irpin` },
      { misto: BROVARY.slug, obl: "kyivska" },
      { misto: "atlantis" },
    ]) {
      expect((await galleryMetadataOf(client, searchParams)).alternates?.canonical).toBe(
        "/tvaryny",
      );
    }
    expect(withPages).not.toHaveBeenCalled();
  });
});
