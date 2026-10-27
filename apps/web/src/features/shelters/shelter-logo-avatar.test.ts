import { describe, expect, it } from "vitest";
import { shelterInitialsOf } from "./shelter-logo-avatar";

describe("shelterInitialsOf", () => {
  it("takes the first letter of each of the first two words, uppercase", () => {
    expect(shelterInitialsOf("Лапа допомоги")).toBe("ЛД");
  });

  it("skips a leading quote mark to find the real first letter", () => {
    expect(shelterInitialsOf("Притулок «Домівка»")).toBe("ПД");
  });

  it("ignores a third and later word", () => {
    expect(shelterInitialsOf("Дім для котів і собак")).toBe("ДД");
  });

  it("uses what's there for a one-word name", () => {
    expect(shelterInitialsOf("Домівка")).toBe("Д");
  });

  it("collapses repeated whitespace, including a leading/trailing one", () => {
    expect(shelterInitialsOf("  Лапа   допомоги  ")).toBe("ЛД");
  });
});
