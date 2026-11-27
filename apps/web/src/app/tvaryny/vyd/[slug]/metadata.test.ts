import { describe, expect, it } from "vitest";
import { speciesPageHeading } from "../../../../features/gallery/species-page-text";
import { speciesOfSlug, speciesPagePath } from "../../../../features/gallery/species-pages";
import { expectOgUrlIsCanonical } from "../../../../seo/og-url-assert";
import { speciesPageMetadataOf } from "./page";

const SITE_IMAGE = { url: "/opengraph-image", width: 1200, height: 630, type: "image/png" };

/** The whole head, spelled out: the owner's approved copy, verbatim (2026-11-27). */
const head = (title: string, description: string, canonical: string) => ({
  title: { absolute: title },
  description,
  openGraph: {
    type: "website",
    siteName: "Opika",
    locale: "uk_UA",
    images: [SITE_IMAGE],
    title,
    description,
    url: `https://opika.org.ua${canonical}`,
  },
  twitter: { card: "summary_large_image", images: ["/opengraph-image"], title, description },
  alternates: { canonical },
});

describe("the species pages' head (owner, 2026-11-27)", () => {
  it("/tvaryny/vyd/sobaky: title, description, canonical, Open Graph and Twitter in full", () => {
    expect(speciesPageMetadataOf("dog", 1, "/tvaryny/vyd/sobaky")).toEqual(
      head(
        "Взяти собаку з притулку – Opika",
        "Собаки з притулків і від волонтерів України шукають дім. Оберіть місто й вік та напишіть притулку напряму.",
        "/tvaryny/vyd/sobaky",
      ),
    );
  });

  it("/tvaryny/vyd/koty: title, description, canonical, Open Graph and Twitter in full", () => {
    expect(speciesPageMetadataOf("cat", 1, "/tvaryny/vyd/koty")).toEqual(
      head(
        "Взяти кота з притулку – Opika",
        "Коти з притулків і від волонтерів України шукають дім. Оберіть місто й вік та напишіть притулку напряму.",
        "/tvaryny/vyd/koty",
      ),
    );
  });

  it("page 2 onwards: «– сторінка {N}» before the site name, the same description", () => {
    expect(speciesPageMetadataOf("dog", 3, "/tvaryny/vyd/sobaky?stor=3")).toEqual(
      head(
        "Взяти собаку з притулку – сторінка 3 – Opika",
        "Собаки з притулків і від волонтерів України шукають дім. Оберіть місто й вік та напишіть притулку напряму.",
        "/tvaryny/vyd/sobaky?stor=3",
      ),
    );
  });

  it("the headings are «Собаки шукають дім» and «Коти шукають дім»", () => {
    expect(speciesPageHeading("dog")).toBe("Собаки шукають дім");
    expect(speciesPageHeading("cat")).toBe("Коти шукають дім");
  });
});

describe("the species pages' og:url", () => {
  it("is the page's canonical, absolute, on page 1 and page 2", () => {
    expectOgUrlIsCanonical(
      speciesPageMetadataOf("dog", 1, "/tvaryny/vyd/sobaky"),
      "/tvaryny/vyd/sobaky",
    );
    expectOgUrlIsCanonical(
      speciesPageMetadataOf("cat", 2, "/tvaryny/vyd/koty?stor=2"),
      "/tvaryny/vyd/koty?stor=2",
    );
  });
});

describe("species page addresses", () => {
  it("are /tvaryny/vyd/sobaky and /tvaryny/vyd/koty, and only those slugs name a species", () => {
    expect(speciesPagePath("dog")).toBe("/tvaryny/vyd/sobaky");
    expect(speciesPagePath("cat")).toBe("/tvaryny/vyd/koty");
    expect(speciesOfSlug("sobaky")).toBe("dog");
    expect(speciesOfSlug("koty")).toBe("cat");
    expect(speciesOfSlug("dog")).toBeNull();
    expect(speciesOfSlug("")).toBeNull();
  });
});
