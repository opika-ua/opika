import { afterEach, describe, expect, it } from "vitest";
import { lockBodyScroll } from "./body-scroll-lock";

afterEach(() => {
  document.body.style.overflow = "";
});

describe("lockBodyScroll", () => {
  it("locks the page and gives back what was there before", () => {
    document.body.style.overflow = "auto";
    const release = lockBodyScroll();
    expect(document.body.style.overflow).toBe("hidden");
    release();
    expect(document.body.style.overflow).toBe("auto");
  });

  it("stays locked until the last of two stacked holds is released, in either order", () => {
    for (const outerFirst of [true, false]) {
      const outer = lockBodyScroll();
      const inner = lockBodyScroll();
      (outerFirst ? outer : inner)();
      expect(document.body.style.overflow, "one dialog is still open").toBe("hidden");
      (outerFirst ? inner : outer)();
      expect(document.body.style.overflow, "both dialogs are closed").toBe("");
    }
  });

  it("ignores a second release of the same hold", () => {
    const outer = lockBodyScroll();
    const inner = lockBodyScroll();
    inner();
    inner();
    expect(document.body.style.overflow).toBe("hidden");
    outer();
    expect(document.body.style.overflow).toBe("");
  });
});
