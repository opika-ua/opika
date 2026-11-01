import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StickyActionBar } from "./StickyActionBar";
import { keyboardInsetOf, revealAboveBar } from "./sticky-bar";

describe("keyboardInsetOf", () => {
  const base = { layoutHeight: 780, viewportHeight: 780, viewportOffsetTop: 0, scale: 1 };

  it("is 0 with no keyboard, however the browser rounds", () => {
    expect(keyboardInsetOf(base)).toBe(0);
    expect(keyboardInsetOf({ ...base, viewportHeight: 779.5 })).toBe(0);
  });

  it("is the height the keyboard takes off the visible viewport", () => {
    expect(keyboardInsetOf({ ...base, viewportHeight: 468 })).toBe(312);
  });

  it("counts the visual viewport's own scroll offset (iOS pans it above the keyboard)", () => {
    expect(keyboardInsetOf({ ...base, viewportHeight: 468, viewportOffsetTop: 100 })).toBe(212);
  });

  it("ignores a pinch zoom: a smaller visual viewport is not a keyboard", () => {
    expect(keyboardInsetOf({ ...base, viewportHeight: 390, scale: 2 })).toBe(0);
  });
});

describe("revealAboveBar", () => {
  afterEach(() => vi.restoreAllMocks());

  const field = (bottom: number) => {
    const input = document.createElement("input");
    input.getBoundingClientRect = () => ({ bottom }) as DOMRect;
    return input;
  };

  it("scrolls a field that ends under the bar until it clears it, with a margin", () => {
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
    revealAboveBar(field(700), 650);
    expect(scrollBy).toHaveBeenCalledWith({ top: 66 });
  });

  it("leaves a field that already ends above the bar alone", () => {
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
    revealAboveBar(field(400), 650);
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("never scrolls for a button, which is where focus sits in the bar itself", () => {
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
    const button = document.createElement("button");
    button.getBoundingClientRect = () => ({ bottom: 900 }) as DOMRect;
    revealAboveBar(button, 650);
    expect(scrollBy).not.toHaveBeenCalled();
  });
});

describe("StickyActionBar", () => {
  afterEach(() => {
    Object.defineProperty(window, "visualViewport", { value: undefined, configurable: true });
    document.documentElement.style.scrollPaddingBottom = "";
  });

  it("renders its buttons in the page (no script needed to reach them)", () => {
    render(
      <StickyActionBar>
        <button type="button">Зберегти</button>
      </StickyActionBar>,
    );
    expect(screen.getByRole("button", { name: "Зберегти" })).toBeTruthy();
  });

  it("lifts the bar above the keyboard when the visual viewport shrinks, and drops it again", () => {
    const viewport = Object.assign(new EventTarget(), { height: 780, offsetTop: 0, scale: 1 });
    Object.defineProperty(window, "visualViewport", { value: viewport, configurable: true });
    Object.defineProperty(document.documentElement, "clientHeight", {
      value: 780,
      configurable: true,
    });
    const { container } = render(
      <StickyActionBar>
        <button type="button">Зберегти</button>
      </StickyActionBar>,
    );
    const bar = container.firstElementChild as HTMLElement;
    expect(bar.style.transform).toBe("");

    act(() => {
      viewport.height = 468;
      viewport.dispatchEvent(new Event("resize"));
    });
    expect(bar.style.transform).toBe("translateY(-312px)");

    act(() => {
      viewport.height = 780;
      viewport.dispatchEvent(new Event("resize"));
    });
    expect(bar.style.transform).toBe("");
  });

  it("keeps the page's scroll padding clear of the bar while mounted, and gives it back after", () => {
    const { unmount } = render(
      <StickyActionBar>
        <button type="button">Зберегти</button>
      </StickyActionBar>,
    );
    expect(document.documentElement.style.scrollPaddingBottom).not.toBe("");
    unmount();
    expect(document.documentElement.style.scrollPaddingBottom).toBe("");
  });
});
