import { describe, expect, it } from "vitest";
import { galleryCanonicalOf, galleryMetadataOf } from "./page";

const TITLE = "Взяти собаку чи кота з притулку – Opika";
const DESCRIPTION =
  "Собаки й коти з притулків України шукають дім. Оберіть місто, вік і розмір та напишіть притулку напряму.";

/** The canonical rule itself is `galleryCanonicalPath`'s (filter-url.test) and, over a database, `misto/[slug]/page.test.tsx`'s. */
describe("/tvaryny's own metadata (SEO handoff B2)", () => {
  const metadata = galleryMetadataOf("/tvaryny");

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
});
