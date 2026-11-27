import { NO_FILTERS } from "@opika/domain";
import { describe, expect, it } from "vitest";
import { galleryCanonicalPath } from "../../features/gallery/filter-url";
import { expectOgUrlIsCanonical } from "../../seo/og-url-assert";
import { galleryCanonicalOf, galleryMetadataOf } from "./page";

const TITLE = "Взяти собаку чи кота з притулку – Opika";
const DESCRIPTION =
  "Собаки й коти з притулків України шукають дім. Оберіть місто, вік і розмір та напишіть притулку напряму.";

/** The canonical rule itself is `galleryCanonicalPath`'s (filter-url.test) and, over a database, `misto/[slug]/page.test.tsx`'s. */
describe("the gallery's own metadata (SEO handoff B2)", () => {
  const metadata = galleryMetadataOf("/");

  it("title is the approved one, whole: the root template adds nothing", () => {
    expect(metadata.title).toEqual({ absolute: TITLE });
    expect(TITLE.length).toBeLessThanOrEqual(60);
  });

  it("description is the approved one", () => {
    expect(metadata.description).toBe(DESCRIPTION);
    expect(DESCRIPTION.length).toBeLessThan(155);
  });

  it("the link preview and the Twitter card carry the same strings, keeping the site name and locale", () => {
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

  it("carries the canonical it is given; a former-slug redirect's is the bare gallery", () => {
    expect(galleryMetadataOf("/tvaryny/misto/kyiv?stor=2").alternates?.canonical).toBe(
      "/tvaryny/misto/kyiv?stor=2",
    );
    expect(galleryCanonicalOf({ kind: "redirect", href: "/?misto=kyiv" })).toBe("/");
  });

  it("page 1 carries no page suffix", () => {
    expect(galleryMetadataOf("/", 1).title).toEqual({ absolute: TITLE });
  });
});

describe("the paginated gallery's head (page 2)", () => {
  it("title, description, canonical, Open Graph and Twitter in full", () => {
    const title = "Взяти собаку чи кота з притулку – сторінка 2 – Opika";
    const metadata = galleryMetadataOf("/?stor=2", 2);
    expect(Array.from(title).length).toBeLessThanOrEqual(60);
    expect(metadata.title).toEqual({ absolute: title });
    expect(metadata.description).toBe(DESCRIPTION);
    expect(metadata.alternates?.canonical).toBe("/?stor=2");
    expect(metadata.openGraph).toMatchObject({ title, description: DESCRIPTION });
    expect(metadata.twitter).toMatchObject({ title, description: DESCRIPTION });
  });
});

describe("the gallery's og:url is its canonical", () => {
  it("page 1 and page 2 are each their own", () => {
    expectOgUrlIsCanonical(galleryMetadataOf("/"), "/");
    expectOgUrlIsCanonical(galleryMetadataOf("/?stor=2", 2), "/?stor=2");
  });

  it("a filtered or re-sorted gallery names the bare gallery, whatever the page", () => {
    const canonical = galleryCanonicalPath(NO_FILTERS, "longest_waiting", 2, new Map());
    expectOgUrlIsCanonical(galleryMetadataOf(canonical, 2), "/");
  });
});
