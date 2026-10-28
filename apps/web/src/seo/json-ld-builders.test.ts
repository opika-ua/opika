import { describe, expect, it } from "vitest";
import { SITE_ORIGIN } from "../brand";
import {
  animalBreadcrumbs,
  organizationJsonLd,
  serializeJsonLd,
  shelterBreadcrumbs,
} from "./json-ld-builders";

describe("json-ld builders", () => {
  it("builds an Organization with an absolute url", () => {
    const org = organizationJsonLd();
    expect(org["@type"]).toBe("Organization");
    expect(String(org.url).startsWith(SITE_ORIGIN)).toBe(true);
  });

  it("numbers animal breadcrumbs from 1 with absolute item urls", () => {
    const list = animalBreadcrumbs("Шукають дім", { id: "a1", name: "Рекс" }) as {
      itemListElement: { position: number; name: string; item: string }[];
    };
    expect(list.itemListElement.map((i) => i.position)).toEqual([1, 2]);
    expect(list.itemListElement.map((i) => i.item)).toEqual([
      `${SITE_ORIGIN}/tvaryny`,
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
