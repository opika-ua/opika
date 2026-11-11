import { describe, expect, it } from "vitest";
import {
  DESCRIPTION,
  makeShelterPageShelter,
  makeShelterPageView,
} from "../../../features/shelters/test-fixtures";
import { LINK_PREVIEW_DESCRIPTION } from "../../../seo-text";
import { shelterMetadataOf } from "./page";

const metadataFor = (description: { uk: string; en: null } | null) =>
  shelterMetadataOf({
    kind: "shelter",
    view: makeShelterPageView({ shelter: makeShelterPageShelter({ description }) }),
  });

describe("the shelter page's meta description", () => {
  it("is the shelter's text, for the page and the link preview", () => {
    const metadata = metadataFor({ uk: DESCRIPTION, en: null });
    expect(metadata.description).toBe(DESCRIPTION);
    expect(metadata.openGraph?.description).toBe(DESCRIPTION);
  });

  it("falls back to the root layout's default, for the page and the share preview, when the shelter has no text", () => {
    for (const none of [null, { uk: "   ", en: null } as const]) {
      const metadata = metadataFor(none);
      expect(metadata.description).toBe(LINK_PREVIEW_DESCRIPTION);
      expect(metadata.openGraph?.description).toBe(LINK_PREVIEW_DESCRIPTION);
      expect(String(metadata.openGraph?.description).length).toBeGreaterThan(0);
    }
  });

  it("cuts a long text at a word boundary instead of sending all of it", () => {
    const long = `${"слово ".repeat(400)}кінець`;
    const description = metadataFor({ uk: long, en: null }).description;
    expect(typeof description).toBe("string");
    expect((description as string).length).toBeLessThan(long.length);
  });
});
