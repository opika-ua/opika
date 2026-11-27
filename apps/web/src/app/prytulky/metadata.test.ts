import { describe, expect, it } from "vitest";
import { sheltersIndexMetadataOf } from "./page";

const TITLE = "Притулки для тварин на Opika – перевірені вручну";
const DESCRIPTION =
  "Притулки й волонтерські ініціативи, які розмістили тварин на Opika. Кожну я перевіряю вручну. Пишете їм напряму.";

describe("/prytulky's metadata (the owner's approved title and description)", () => {
  it("is the whole head: title, description, canonical, link preview and Twitter card", () => {
    expect(sheltersIndexMetadataOf({ kind: "index", groups: [] })).toEqual({
      title: { absolute: TITLE },
      description: DESCRIPTION,
      openGraph: {
        type: "website",
        siteName: "Opika",
        locale: "uk_UA",
        images: [{ url: "/opengraph-image", width: 1200, height: 630, type: "image/png" }],
        title: TITLE,
        description: DESCRIPTION,
      },
      twitter: {
        card: "summary_large_image",
        images: ["/opengraph-image"],
        title: TITLE,
        description: DESCRIPTION,
      },
      alternates: { canonical: "/prytulky" },
    });
  });

  it("sets no robots of its own, so it is indexable as the site is", () => {
    expect(sheltersIndexMetadataOf({ kind: "index", groups: [] }).robots).toBeUndefined();
  });

  it("a refusal to answer is noindex; a 404 sets nothing of its own", () => {
    expect(sheltersIndexMetadataOf({ kind: "rate_limited" })).toEqual({
      robots: { index: false, follow: false },
    });
    expect(sheltersIndexMetadataOf({ kind: "not_found" })).toEqual({});
  });
});
