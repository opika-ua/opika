import { describe, expect, it } from "vitest";
import { ABOUT_SEO, GALLERY_SEO, seoMetadata } from "./page-metadata";

const SITE_CARD = "/opengraph-image";

describe("seoMetadata's preview image", () => {
  it("names the site card for Open Graph and Twitter by default", () => {
    const metadata = seoMetadata("Тест – Opika", "Опис");
    expect(metadata.openGraph?.images).toEqual([
      { url: SITE_CARD, width: 1200, height: 630, type: "image/png" },
    ]);
    expect(metadata.twitter?.images).toEqual([SITE_CARD]);
  });

  it("names none when the route segment has its own opengraph-image (BR-7)", () => {
    const metadata = seoMetadata("Тест – Opika", "Опис", "segment");
    expect(metadata.openGraph).not.toHaveProperty("images");
    expect(metadata.twitter).not.toHaveProperty("images");
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image" });
  });

  it.each([
    ["/tvaryny", GALLERY_SEO],
    ["/pro", ABOUT_SEO],
  ])("%s carries the site card", (_route, metadata) => {
    expect(metadata.openGraph?.images).toEqual([expect.objectContaining({ url: SITE_CARD })]);
    expect(metadata.twitter?.images).toEqual([SITE_CARD]);
  });
});
