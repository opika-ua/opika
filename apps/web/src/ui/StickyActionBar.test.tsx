import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StickyActionBar } from "./StickyActionBar";
import {
  BOTTOM_BAR,
  bottomBarBoxes,
  keyboardInsetOf,
  liftAboveBars,
  revealAboveBar,
} from "./sticky-bar";

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

describe("liftAboveBars", () => {
  const H = 800;
  const TOAST = 72;

  it("leaves the toast on the bottom edge when no bar is in its way", () => {
    expect(liftAboveBars([], H, TOAST)).toBe(0);
    // A bar higher up the screen (a form bar left in the flow) is not touched by the toast.
    expect(liftAboveBars([{ top: 300, bottom: 400 }], H, TOAST)).toBe(0);
    // Off screen below.
    expect(liftAboveBars([{ top: 820, bottom: 900 }], H, TOAST)).toBe(0);
  });

  it("puts it on the top edge of a bar along the bottom (the tab bar, a draft's save bar)", () => {
    expect(liftAboveBars([{ top: 734, bottom: 800 }], H, TOAST)).toBe(66);
    expect(liftAboveBars([{ top: 700, bottom: 784 }], H, TOAST)).toBe(100);
  });

  it("clears a bar stacked on another, in whatever order they are found", () => {
    const nav = { top: 734, bottom: 800 };
    const pill = { top: 664, bottom: 720 };
    expect(liftAboveBars([nav, pill], H, TOAST)).toBe(136);
    expect(liftAboveBars([pill, nav], H, TOAST)).toBe(136);
  });

  it("counts a bar the toast would only graze, never one it already clears", () => {
    expect(liftAboveBars([{ top: 650, bottom: 729 }], H, TOAST)).toBe(150);
    expect(liftAboveBars([{ top: 650, bottom: 728 }], H, TOAST)).toBe(0);
  });
});

describe("bottomBarBoxes", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  const bar = (style: string, box: { top: number; bottom: number } | null) => {
    const element = document.createElement("div");
    element.setAttribute("data-bottom-bar", BOTTOM_BAR["data-bottom-bar"]);
    element.setAttribute("style", style);
    element.getBoundingClientRect = () =>
      ({ top: box?.top ?? 0, bottom: box?.bottom ?? 0 }) as DOMRect;
    element.getClientRects = () => (box === null ? [] : [box]) as unknown as DOMRectList;
    document.body.append(element);
  };

  it("reads only marked bars that are fixed or sticky and displayed", () => {
    bar("position: fixed", { top: 734, bottom: 800 });
    bar("position: sticky", { top: 700, bottom: 784 });
    // The nav as a side rail from desktop, and a nav the form hides on a phone.
    bar("position: static", { top: 100, bottom: 400 });
    bar("position: fixed", null);
    expect(bottomBarBoxes()).toEqual([
      { top: 734, bottom: 800 },
      { top: 700, bottom: 784 },
    ]);
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

  describe("the focus-in reveal timers", () => {
    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    const focusField = () => {
      const input = document.createElement("input");
      document.body.append(input);
      input.getBoundingClientRect = () => ({ bottom: 900 }) as DOMRect;
      act(() => input.focus());
      return input;
    };

    it("still reveals the focused field after the settle delay while mounted", () => {
      vi.useFakeTimers();
      const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
      render(
        <StickyActionBar>
          <button type="button">Зберегти</button>
        </StickyActionBar>,
      );
      const input = focusField();
      vi.advanceTimersByTime(300);
      expect(scrollBy).toHaveBeenCalled();
      input.remove();
    });

    it("does nothing after unmount: no late reveal, no document access", () => {
      vi.useFakeTimers();
      const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
      const { unmount } = render(
        <StickyActionBar>
          <button type="button">Зберегти</button>
        </StickyActionBar>,
      );
      const input = focusField();
      const active = vi.spyOn(document, "activeElement", "get");
      unmount();
      active.mockClear();
      expect(() => vi.advanceTimersByTime(1000)).not.toThrow();
      expect(active).not.toHaveBeenCalled();
      expect(scrollBy).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
      input.remove();
    });
  });
});
