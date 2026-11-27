import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SITE_ORIGIN } from "../brand";
import {
  animalBreadcrumbs,
  organizationJsonLd,
  serializeJsonLd,
  shelterBreadcrumbs,
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

  it("points the last shelter crumb at the shelter page", () => {
    const list = shelterBreadcrumbs("Шукають дім", { id: "s1", displayName: "Дім" }) as {
      itemListElement: { item: string }[];
    };
    expect(list.itemListElement.at(-1)?.item).toBe(`${SITE_ORIGIN}/prytulky/s1`);
  });

  it("escapes < so a name cannot close the script element", () => {
    const out = serializeJsonLd(animalBreadcrumbs("x", { id: "a", name: "</script><b>" }));
    expect(out).not.toContain("<");
    expect(JSON.parse(out).itemListElement[1].name).toBe("</script><b>");
  });
});
