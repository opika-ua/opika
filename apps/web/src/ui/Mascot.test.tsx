import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Mascot } from "./Mascot";
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
