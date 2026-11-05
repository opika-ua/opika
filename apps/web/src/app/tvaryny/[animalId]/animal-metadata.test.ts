import { describe, expect, it } from "vitest";
import { makeDetailAnimal, makeDetailShelter } from "../../../features/animal-detail/test-fixtures";
import { SITE_IS_PUBLICLY_DISCOVERABLE } from "../../../seo-flags";
import { animalMetadataOf } from "./page";

const view = (paused: boolean) => ({
  kind: "animal" as const,
  view: {
    animal: makeDetailAnimal({ availability: paused ? { kind: "paused" } : { kind: "open" } }),
    shelter: makeDetailShelter(),
    cityName: "Бровари",
    cityPlace: "м. Бровари",
    backToGalleryHref: "/tvaryny",
  },
});

describe("animal page metadata", () => {
  it("a paused shelter's animal is noindex, follow", () => {
    expect(animalMetadataOf(view(true)).robots).toEqual({
      index: false,
      follow: SITE_IS_PUBLICLY_DISCOVERABLE,
    });
  });

  it("an open shelter's animal sets no robots of its own", () => {
    expect(animalMetadataOf(view(false)).robots).toBeUndefined();
  });

  it("an animal of a shelter still under review is noindex, follow", () => {
    const early = view(false);
    early.view.shelter = makeDetailShelter({ verification: "listed_before_verification" });
    const metadata = animalMetadataOf(early);
    expect(metadata.robots).toEqual({ index: false, follow: SITE_IS_PUBLICLY_DISCOVERABLE });
    // The demo notice outranks the preview line while no real shelter exists; the line is pinned in copy-status.
  });

  it("the description does not mention the pause (previews stay stable)", () => {
    expect(String(animalMetadataOf(view(true)).description)).not.toMatch(/пауз|не приймає/);
  });
});
