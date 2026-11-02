import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Mascot } from "./Mascot";
import { PerchedWords } from "./PerchedWords";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (HTMLElement.prototype as { offsetTop?: number }).offsetTop;
});

function mascotParentText(container: HTMLElement): string {
  return container.querySelector("[data-mascot]")?.parentElement?.textContent ?? "";
}

function setup(text: string) {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  const mascot = <Mascot kind="cat" pose="lie" size={48} perch="word" />;
  return render(
    <h1>
      <PerchedWords text={text} mascot={mascot} />
    </h1>,
  );
}

describe("PerchedWords", () => {
  it("keeps the whole heading text readable as one string", () => {
    const { container } = setup("Шукають дім");
    expect(container.querySelector("h1")?.textContent).toBe("Шукають дім");
  });

  it("seats the mascot on the last word when the text fits on one line", () => {
    const { container } = setup("Шукають дім");
    expect(mascotParentText(container)).toBe("дім");
  });

  it("is decorative: the mascot adds no text and stays hidden from assistive tech", () => {
    const { container } = setup("Шукають дім");
    expect(container.querySelector("[data-mascot]")?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("PerchedWords on a wrapped line", () => {
  it("moves the mascot to the last word that stayed on the first line", () => {
    Object.defineProperty(HTMLElement.prototype, "offsetTop", {
      configurable: true,
      get(this: HTMLElement) {
        return this.hasAttribute("data-word") && this.textContent === "дім" ? 40 : 0;
      },
    });
    const { container } = setup("Шукають дім");
    expect(mascotParentText(container)).toBe("Шукають");
  });
});
