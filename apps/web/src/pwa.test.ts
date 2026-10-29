import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "./app/manifest";
import { PAGE_COLOR, PWA_ICONS } from "./pwa";

describe("web app manifest", () => {
  const m = manifest();

  it("names the app from brand.ts", () => {
    expect(m.name).toBe("Собаки й коти з притулків Київщини – Opika");
    expect(m.short_name).toBe("Opika");
  });

  it("starts in the gallery, installs standalone, in Ukrainian", () => {
    expect(m).toMatchObject({
      start_url: "/tvaryny",
      scope: "/",
      display: "standalone",
      lang: "uk",
    });
  });

  it("takes both colours from the page token", () => {
    const css = readFileSync(join(__dirname, "app/globals.css"), "utf8");
    expect(/--color-page:\s*(#[0-9a-fA-F]{6})/.exec(css)?.[1]?.toLowerCase()).toBe(PAGE_COLOR);
    expect(m.theme_color).toBe(PAGE_COLOR);
    expect(m.background_color).toBe(PAGE_COLOR);
  });

  it("lists 192 and 512 icons plus a maskable one, and each file exists at its size", () => {
    expect(m.icons?.map((i) => `${i.sizes}:${i.purpose}`)).toEqual([
      "192x192:any",
      "512x512:any",
      "512x512:maskable",
    ]);
    for (const icon of PWA_ICONS) {
      const png = readFileSync(join(__dirname, "../public", icon.src));
      const [w, h] = [png.readUInt32BE(16), png.readUInt32BE(20)];
      expect(`${w}x${h}`).toBe(icon.sizes);
    }
  });

  it("has an apple touch icon of 180x180 as a file convention, next to the svg favicon", () => {
    expect(existsSync(join(__dirname, "app/icon.svg"))).toBe(true);
    const png = readFileSync(join(__dirname, "app/apple-icon.png"));
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([180, 180]);
  });
});
