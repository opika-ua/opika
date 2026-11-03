// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

describe("one facts formatter (UX-2)", () => {
  it("the social image builds its facts line with animalFactsParts", () => {
    const og = readFileSync(join(SRC, "seo", "og-image.tsx"), "utf8");
    expect(og).toContain("animalFactsParts(");
    expect(og).not.toMatch(/speciesWordFor|sexWordFor/);
  });

  it("no source file still uses a retired facts helper (the swipe deck is retired in its own PR)", () => {
    const retired = /\b(sizeChipWordFor|ageChipWordFor|cardMetaLine)\b/;
    const offenders = sources(SRC)
      .filter((file) => retired.test(readFileSync(file, "utf8")))
      .map((file) => file.slice(SRC.length));
    expect(offenders).toEqual([]);
  });
});
