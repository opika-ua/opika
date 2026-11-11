import { describe, expect, it } from "vitest";
import {
  DESCRIPTION,
  makeShelterPageShelter,
  makeShelterPageView,
} from "../../../features/shelters/test-fixtures";
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

  it("is left to the root layout's default when the shelter has no text", () => {
    for (const none of [null, { uk: "   ", en: null } as const]) {
      const metadata = metadataFor(none);
      expect(metadata.description).toBeUndefined();
      expect(metadata.openGraph?.description).toBeUndefined();
      expect(metadata.title).toBeDefined();
    }
  });

  it("cuts a long text at a word boundary instead of sending all of it", () => {
    const long = `${"слово ".repeat(400)}кінець`;
    const description = metadataFor({ uk: long, en: null }).description;
    expect(typeof description).toBe("string");
    expect((description as string).length).toBeLessThan(long.length);
  });
});
