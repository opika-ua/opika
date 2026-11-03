// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MedicalStatus } from "./MedicalStatus";
import type { MedicalRow } from "./medical-labels";

afterEach(cleanup);

const ROWS = [
  { label: "Щеплення", value: "done", source: "vet", date: null },
  { label: "Стерилізація", value: "unknown", source: "shelter", date: null },
] as unknown as readonly MedicalRow[];

describe("MedicalStatus definition list", () => {
  it("holds only dt/dd, or div-wrapped dt/dd pairs, directly inside the dl", () => {
    const { container } = render(<MedicalStatus rows={ROWS} notes={null} />);
    const dl = container.querySelector("dl") as HTMLElement;
    for (const child of Array.from(dl.children)) {
      expect(["DT", "DD", "DIV"]).toContain(child.tagName);
      if (child.tagName === "DIV") {
        for (const inner of Array.from(child.children)) {
          expect(["DT", "DD"]).toContain(inner.tagName);
        }
        expect(child.querySelectorAll("dt").length).toBe(1);
      }
    }
    expect(dl.querySelectorAll("dt")).toHaveLength(ROWS.length);
  });
});
