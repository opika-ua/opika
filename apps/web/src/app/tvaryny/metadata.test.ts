import { describe, expect, it } from "vitest";
import { metadata } from "./page";

const TITLE = "Взяти собаку чи кота з притулку – Opika";
const DESCRIPTION =
  "Собаки й коти з притулків України шукають дім. Оберіть місто, вік і розмір та напишіть притулку напряму.";

describe("/tvaryny's own metadata (SEO handoff B2)", () => {
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

  it("canonical is always the bare path, regardless of any filter/sort/page query", () => {
    expect(metadata.alternates?.canonical).toBe("/tvaryny");
  });
});
