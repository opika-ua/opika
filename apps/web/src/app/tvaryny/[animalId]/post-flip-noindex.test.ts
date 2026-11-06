import { describe, expect, it, vi } from "vitest";
import { makeDetailAnimal, makeDetailShelter } from "../../../features/animal-detail/test-fixtures";
import { makeShelterPageView } from "../../../features/shelters/test-fixtures";

// The state after docs/launch-sequence.md step 14.1 (the flag is true, the gate is gone). Only mocked here;
// the constant itself is never changed by a test. REGISTRY_HAS_NO_REAL_SHELTERS stays as shipped.
vi.mock("../../../seo-flags", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../seo-flags")>()),
  SITE_IS_PUBLICLY_DISCOVERABLE: true,
}));

const { animalMetadataOf } = await import("./page");
const { shelterMetadataOf } = await import("../../prytulky/[shelterId]/page");

const animalLoad = (
  shelter: Parameters<typeof makeDetailShelter>[0],
  availability: "open" | "paused" = "open",
) => ({
  kind: "animal" as const,
  view: {
    animal: makeDetailAnimal({ availability: { kind: availability } }),
    shelter: makeDetailShelter(shelter),
    cityName: "Бровари",
    cityPlace: "м. Бровари",
    backToGalleryHref: "/tvaryny",
  },
});

describe("after the discoverability flip, revocable listings stay noindex but followable", () => {
  it("an early-listed shelter's animal page is noindex, follow", () => {
    expect(
      animalMetadataOf(animalLoad({ verification: "listed_before_verification" })).robots,
    ).toEqual({
      index: false,
      follow: true,
    });
  });

  it("a paused shelter's animal page is noindex, follow", () => {
    expect(animalMetadataOf(animalLoad({ verification: "verified" }, "paused")).robots).toEqual({
      index: false,
      follow: true,
    });
  });

  it("a verified, open shelter's animal page is indexable", () => {
    expect(animalMetadataOf(animalLoad({ verification: "verified" })).robots).toBeUndefined();
  });

  it("an early-listed or paused shelter's own page is noindex, follow; a verified one is indexable", () => {
    const page = (overrides: Parameters<typeof makeDetailShelter>[0]) =>
      shelterMetadataOf({
        kind: "shelter",
        view: makeShelterPageView({ shelter: makeDetailShelter(overrides) }),
      } as never).robots;
    expect(page({ verification: "listed_before_verification" })).toEqual({
      index: false,
      follow: true,
    });
    expect(
      page({ verification: "verified", availability: { kind: "paused", reason: "other" } }),
    ).toEqual({
      index: false,
      follow: true,
    });
    expect(page({ verification: "verified" })).toBeUndefined();
  });
});
