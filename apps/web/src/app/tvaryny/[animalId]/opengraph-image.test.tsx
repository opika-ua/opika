// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SHORT_ANIMAL_CACHE } from "../../../seo/og-image";

const load = vi.fn();
vi.mock("../../../features/animal-detail/animal-page-load", () => ({
  loadAnimalPage: (...args: unknown[]) => load(...args),
}));

const { default: Image } = await import("./opengraph-image");

beforeEach(() => load.mockReset());

describe("the per-animal link-preview route", () => {
  it.each(["not_found", "rate_limited"] as const)(
    "a %s animal gets the site card, short-cached and noindex",
    async (kind) => {
      load.mockResolvedValue({ kind });
      const res = await Image({ params: Promise.resolve({ animalId: "unknown" }) });
      expect(res.headers.get("cache-control")).toBe(SHORT_ANIMAL_CACHE);
      expect(res.headers.get("x-robots-tag")).toBe("noindex");
    },
  );
});
