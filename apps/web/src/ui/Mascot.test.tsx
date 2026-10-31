import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Mascot, MascotPerch } from "./Mascot";
import { compactOffset } from "./mascot-fit";
import { MASCOT_SHAPES } from "./mascot-shapes";
import { mascotKindFor } from "./mascot-species";

afterEach(cleanup);

function svgOf(ui: React.ReactElement): SVGElement {
  const { container } = render(ui);
  const svg = container.querySelector("svg");
  if (!svg) throw new Error("no svg");
  return svg;
}

describe("Mascot", () => {
  it.each([
    [{ kind: "cat", pose: "sit", variant: "collar" }, "cat-sit-collar"],
    [{ kind: "cat", pose: "sit" }, "cat-sit"],
    [{ kind: "cat", pose: "lie" }, "cat-lie"],
    [{ kind: "cat", pose: "stand" }, "cat-stand"],
    [{ kind: "cat", pose: "stand", variant: "tail" }, "cat-stand-tail"],
    [{ kind: "dog", pose: "sit" }, "dog-sit"],
    [{ kind: "dog", pose: "lie" }, "dog-lie"],
    [{ kind: "dog", pose: "stand" }, "dog-stand"],
  ] as const)("renders the %j asset", (pose, key) => {
    const svg = svgOf(<Mascot {...pose} size={48} />);
    expect(svg.getAttribute("data-mascot")).toBe(key);
    const shape = MASCOT_SHAPES[key];
    expect(svg.getAttribute("viewBox")).toBe(`0 0 ${shape.w} ${shape.h}`);
    expect(svg.querySelectorAll("path")).toHaveLength(shape.paths.length);
  });

  it("is decorative: hidden from assistive tech, out of the tab order, no text", () => {
    const svg = svgOf(<Mascot kind="cat" pose="lie" size={32} />);
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("focusable")).toBe("false");
    expect(svg.getAttribute("tabindex")).toBeNull();
    expect(svg.textContent).toBe("");
    expect(svg.getAttribute("class")).toContain("pointer-events-none");
  });

  it("keeps the cat's eyes as even-odd cut-outs", () => {
    const svg = svgOf(<Mascot kind="cat" pose="lie" size={48} />);
    expect(svg.querySelector('path[fill-rule="evenodd"]')).not.toBeNull();
  });

  it("perches on the top edge at the chosen corner and offset", () => {
    const left = svgOf(<Mascot kind="dog" pose="sit" size={64} perch="top-left" offset={16} />);
    expect(left.getAttribute("class")).toContain("bottom-full");
    expect(left.getAttribute("class")).toContain("left-4");
    cleanup();
    const right = svgOf(<Mascot kind="dog" pose="sit" size={64} perch="top-right" />);
    expect(right.getAttribute("class")).toContain("right-0");
  });

  it("uses a smaller height step on a phone", () => {
    expect(svgOf(<Mascot kind="cat" pose="sit" size={96} />).getAttribute("class")).toContain(
      "max-tablet:h-16",
    );
  });
});

describe("mascotKindFor", () => {
  it("picks the dog only for a dogs-only selection", () => {
    expect(mascotKindFor({ kind: "oneOf", values: ["dog"] })).toBe("dog");
  });
  it("picks the cat for a cats-only selection", () => {
    expect(mascotKindFor({ kind: "oneOf", values: ["cat"] })).toBe("cat");
  });
  it("picks the cat for a mixed or unfiltered view", () => {
    expect(mascotKindFor({ kind: "oneOf", values: ["dog", "cat"] })).toBe("cat");
    expect(mascotKindFor({ kind: "any" })).toBe("cat");
    expect(mascotKindFor({ kind: "oneOf", values: [] })).toBe("cat");
  });
});

describe("Mascot below 360px", () => {
  it("steps the height down once more and never goes under 32", () => {
    for (const [size, cls] of [
      [32, "max-compact:h-8"],
      [48, "max-compact:h-8"],
      [64, "max-compact:h-8"],
      [96, "max-compact:h-12"],
    ] as const) {
      expect(svgOf(<Mascot kind="cat" pose="sit" size={size} />).getAttribute("class")).toContain(
        cls,
      );
      cleanup();
    }
  });

  it("caps the perch inset at 16 and keeps smaller insets", () => {
    expect(compactOffset(32)).toBe(16);
    expect(compactOffset(24)).toBe(16);
    expect(compactOffset(16)).toBe(16);
    expect(compactOffset(8)).toBe(8);
    expect(compactOffset(4)).toBe(4);
    expect(compactOffset(0)).toBe(0);
    const left = svgOf(<Mascot kind="dog" pose="sit" size={48} perch="top-left" offset={32} />);
    expect(left.getAttribute("class")).toContain("left-8");
    expect(left.getAttribute("class")).toContain("max-compact:left-4");
    cleanup();
    const right = svgOf(<Mascot kind="dog" pose="sit" size={48} perch="top-right" offset={24} />);
    expect(right.getAttribute("class")).toContain("max-compact:right-4");
  });

  it("keeps a seated group inside its parent", () => {
    const { container } = render(
      <MascotPerch perch="top-right" offset={24}>
        <Mascot kind="cat" pose="sit" size={48} />
      </MascotPerch>,
    );
    const group = container.querySelector("[data-mascot-group]");
    expect(group?.getAttribute("class")).toContain("max-w-full");
    expect(group?.getAttribute("class")).toContain("max-compact:right-4");
  });
});
