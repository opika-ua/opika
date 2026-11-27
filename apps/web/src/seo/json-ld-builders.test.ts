import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SITE_ORIGIN } from "../brand";
import {
  animalBreadcrumbs,
  cityBreadcrumbs,
  galleryTrail,
  type JsonLdObject,
  organizationJsonLd,
  serializeJsonLd,
  shelterBreadcrumbs,
  shelterTrail,
  speciesBreadcrumbs,
  speciesTrail,
  webSiteJsonLd,
} from "./json-ld-builders";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("json-ld builders", () => {
  it("builds the WebSite Google reads the site name from", () => {
    expect(webSiteJsonLd()).toEqual({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Opika",
      alternateName: ["Опіка", "opika.org.ua"],
      url: "https://opika.org.ua/",
    });
  });

  it("builds an Organization with a logo and only the owner-supplied profile", () => {
    expect(organizationJsonLd()).toEqual({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Opika",
      url: "https://opika.org.ua/",
      logo: "https://opika.org.ua/icons/icon-512.png",
      sameAs: ["https://www.instagram.com/opika.ua/"],
    });
  });

  it("points the logo at a square PNG of at least 112px served from public/", () => {
    const logo = new URL(String(organizationJsonLd().logo));
    expect(logo.origin).toBe(SITE_ORIGIN);
    const png = readFileSync(join(__dirname, "../../public", logo.pathname));
    expect(png.subarray(0, 8)).toEqual(PNG_SIGNATURE);
    const [width, height] = [png.readUInt32BE(16), png.readUInt32BE(20)];
    expect(width).toBe(height);
    expect(width).toBeGreaterThanOrEqual(112);
  });

  it("numbers animal breadcrumbs from 1 with absolute item urls", () => {
    const list = animalBreadcrumbs("Шукають дім", { id: "a1", name: "Рекс" }) as {
      itemListElement: { position: number; name: string; item: string }[];
    };
    expect(list.itemListElement.map((i) => i.position)).toEqual([1, 2]);
    expect(list.itemListElement.map((i) => i.item)).toEqual([
      `${SITE_ORIGIN}/`,
      `${SITE_ORIGIN}/tvaryny/a1`,
    ]);
    expect(list.itemListElement[1]?.name).toBe("Рекс");
  });

  describe("the gallery > city > animal trail", () => {
    const brovary = { name: "Бровари", path: "/tvaryny/misto/brovary" };
    const rex = { id: "a1", name: "Рекс" };
    type Item = { position: number; name: string; item: string };
    const itemsOf = (list: JsonLdObject): Item[] =>
      JSON.parse(serializeJsonLd(list)).itemListElement;

    it.each([
      {
        case: "an animal whose city has a page",
        trail: galleryTrail("Шукають дім", brovary, rex),
        paths: ["/", "/tvaryny/misto/brovary", "/tvaryny/a1"],
        names: ["Шукають дім", "Бровари", "Рекс"],
      },
      {
        case: "an animal whose city has no page",
        trail: galleryTrail("Шукають дім", null, rex),
        paths: ["/", "/tvaryny/a1"],
        names: ["Шукають дім", "Рекс"],
      },
      {
        case: "a city page",
        trail: galleryTrail("Шукають дім", brovary, null),
        paths: ["/", "/tvaryny/misto/brovary"],
        names: ["Шукають дім", "Бровари"],
      },
    ])("$case", ({ trail, paths, names }) => {
      expect(trail.map((crumb) => crumb.path)).toEqual(paths);
      expect(trail.map((crumb) => crumb.name)).toEqual(names);
    });

    it("renders valid JSON with positions from 1 and absolute urls, for each page type", () => {
      const withCity = animalBreadcrumbs("Шукають дім", rex, brovary);
      const lists = [
        withCity,
        animalBreadcrumbs("Шукають дім", rex),
        cityBreadcrumbs("Шукають дім", brovary),
      ];
      for (const list of lists) {
        const items = itemsOf(list);
        expect(items.map((i) => i.position)).toEqual(items.map((_, index) => index + 1));
        for (const { item } of items) {
          expect(new URL(item).origin).toBe(SITE_ORIGIN);
          expect(item.startsWith("https://")).toBe(true);
        }
      }
      expect(itemsOf(withCity).map((i) => i.item)).toEqual([
        `${SITE_ORIGIN}/`,
        `${SITE_ORIGIN}/tvaryny/misto/brovary`,
        `${SITE_ORIGIN}/tvaryny/a1`,
      ]);
    });
  });

  describe("the gallery > shelters > shelter trail", () => {
    const shelter = { id: "s1", displayName: "Дім" };
    type Item = { position: number; name: string; item: string };
    const itemsOf = (list: JsonLdObject): Item[] =>
      JSON.parse(serializeJsonLd(list)).itemListElement;

    it.each([
      {
        case: "with the shelters list",
        sheltersName: "Притулки" as string | null,
        paths: ["/", "/prytulky", "/prytulky/s1"],
        names: ["Шукають дім", "Притулки", "Дім"],
      },
      {
        case: "without the shelters list (it would answer 404)",
        sheltersName: null,
        paths: ["/", "/prytulky/s1"],
        names: ["Шукають дім", "Дім"],
      },
    ])("$case", ({ sheltersName, paths, names }) => {
      const trail = shelterTrail("Шукають дім", sheltersName, shelter);
      expect(trail.map((crumb) => crumb.path)).toEqual(paths);
      expect(trail.map((crumb) => crumb.name)).toEqual(names);

      const items = itemsOf(shelterBreadcrumbs("Шукають дім", sheltersName, shelter));
      expect(items.map((i) => i.position)).toEqual(items.map((_, index) => index + 1));
      expect(items.map((i) => i.item)).toEqual(paths.map((path) => `${SITE_ORIGIN}${path}`));
      expect(items.map((i) => i.name)).toEqual(names);
      for (const { item } of items) expect(item.startsWith("https://")).toBe(true);
    });
  });

  describe("the gallery > species page trail", () => {
    type Item = { position: number; name: string; item: string };

    it.each([
      { name: "Собаки шукають дім", path: "/tvaryny/vyd/sobaky" },
      { name: "Коти шукають дім", path: "/tvaryny/vyd/koty" },
    ])("$path: two levels, positions from 1, absolute urls, valid JSON", (species) => {
      const trail = speciesTrail("Шукають дім", species);
      expect(trail.map((crumb) => crumb.path)).toEqual(["/", species.path]);
      expect(trail.map((crumb) => crumb.name)).toEqual(["Шукають дім", species.name]);

      const list = JSON.parse(serializeJsonLd(speciesBreadcrumbs("Шукають дім", species)));
      expect(list["@type"]).toBe("BreadcrumbList");
      const items: Item[] = list.itemListElement;
      expect(items.map((i) => i.position)).toEqual([1, 2]);
      expect(items.map((i) => i.item)).toEqual([
        `${SITE_ORIGIN}/`,
        `${SITE_ORIGIN}${species.path}`,
      ]);
      expect(items.map((i) => i.name)).toEqual(["Шукають дім", species.name]);
    });
  });

  it("escapes < so a name cannot close the script element", () => {
    const out = serializeJsonLd(animalBreadcrumbs("x", { id: "a", name: "</script><b>" }));
    expect(out).not.toContain("<");
    expect(JSON.parse(out).itemListElement[1].name).toBe("</script><b>");
  });
});
