import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `/tvaryny`'s `metadata` export (PR B, the SEO review of page titles) is a plain
 * object, computed once at module load from `REGISTRY_HAS_NO_REAL_SHELTERS` - so,
 * same as the root layout's own `linkPreviewDescription`, reaching the branch where
 * real shelters exist needs the module reloaded under a mock, not just a fresh call.
 * The same `vi.doMock` + `vi.resetModules` + dynamic re-import pattern
 * `AnimalDetailScreen.test.tsx` uses for its own demo-gated branches.
 */
describe("/tvaryny's own metadata", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("title is the subject alone - the root template appends the brand", async () => {
    vi.doMock("../../seo-flags", () => ({ REGISTRY_HAS_NO_REAL_SHELTERS: true }));
    const { metadata } = await import("./page");
    expect(metadata.title).toBe("Собаки й коти з притулків Київщини");
  });

  it("canonical is always the bare path, regardless of any filter/sort/page query", async () => {
    vi.doMock("../../seo-flags", () => ({ REGISTRY_HAS_NO_REAL_SHELTERS: true }));
    const { metadata } = await import("./page");
    expect(metadata.alternates?.canonical).toBe("/tvaryny");
  });

  it("description is the D-2 demo disclosure while the registry holds no real shelters", async () => {
    vi.doMock("../../seo-flags", () => ({ REGISTRY_HAS_NO_REAL_SHELTERS: true }));
    const { metadata } = await import("./page");
    expect(metadata.description).toBe(
      "На сайті поки немає справжніх притулків - усі картки тут демонстраційні.",
    );
  });

  it("description no longer mentions «гортайте по одній» once real shelters exist - the deck is off", async () => {
    vi.doMock("../../seo-flags", () => ({ REGISTRY_HAS_NO_REAL_SHELTERS: false }));
    const { metadata } = await import("./page");
    expect(metadata.description).toBe(
      "Собаки й коти з перевірених притулків Київщини шукають дім. Перегляньте список.",
    );
    expect(metadata.description).not.toContain("гортайте");
  });
});
