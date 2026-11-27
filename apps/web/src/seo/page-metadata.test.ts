import { describe, expect, it } from "vitest";
import { expectOgUrlIsCanonical } from "./og-url-assert";
import { ABOUT_SEO, gallerySeo, PRIVACY_SEO, seoMetadata } from "./page-metadata";

const SITE_CARD = "/opengraph-image";

describe("seoMetadata's preview image", () => {
  it("names the site card for Open Graph and Twitter by default", () => {
    const metadata = seoMetadata("Тест – Opika", "Опис", "/x");
    expect(metadata.openGraph?.images).toEqual([
      { url: SITE_CARD, width: 1200, height: 630, type: "image/png" },
    ]);
    expect(metadata.twitter?.images).toEqual([SITE_CARD]);
  });

  it("names none when the route segment has its own opengraph-image (BR-7)", () => {
    const metadata = seoMetadata("Тест – Opika", "Опис", "/x", "segment");
    expect(metadata.openGraph).not.toHaveProperty("images");
    expect(metadata.twitter).not.toHaveProperty("images");
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image" });
  });

  it.each([
    ["/", gallerySeo(1, "/")],
    ["/pro", ABOUT_SEO],
    ["/polityka-konfidentsiinosti", PRIVACY_SEO],
  ])("%s carries the site card", (_route, metadata) => {
    expect(metadata.openGraph?.images).toEqual([expect.objectContaining({ url: SITE_CARD })]);
    expect(metadata.twitter?.images).toEqual([SITE_CARD]);
  });
});

describe("seoMetadata's canonical", () => {
  it("is the one source of the canonical link and the absolute og:url, query string kept", () => {
    expectOgUrlIsCanonical(seoMetadata("Тест – Opika", "Опис", "/x?stor=2"), "/x?stor=2");
    expectOgUrlIsCanonical(seoMetadata("Тест – Opika", "Опис", "/x", "segment"), "/x");
  });

  it.each([
    ["/", gallerySeo(1, "/")],
    ["/?stor=2", gallerySeo(2, "/?stor=2")],
    ["/pro", ABOUT_SEO],
    ["/polityka-konfidentsiinosti", PRIVACY_SEO],
  ])("%s: og:url is its canonical", (canonical, metadata) => {
    expectOgUrlIsCanonical(metadata, canonical);
  });
});
