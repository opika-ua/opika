import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ukPublic } from "@opika/i18n/public";
import { describe, expect, it } from "vitest";

describe("the codifier credit lives on /pro only", () => {
  it("has no footer namespace in the public catalogue", () => {
    expect(Object.keys(ukPublic)).not.toContain("footer");
  });

  it("the root layout draws no footer", () => {
    const layout = readFileSync(join(__dirname, "app", "layout.tsx"), "utf8");
    expect(layout).not.toMatch(/Footer/);
  });
});
