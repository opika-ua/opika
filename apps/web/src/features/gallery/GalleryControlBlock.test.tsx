import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GalleryControlBlock } from "./GalleryControlBlock";

/**
 * `fireEvent.transitionEnd(el, { propertyName })` doesn't work in this test
 * environment - happy-dom's `TransitionEvent` constructor silently drops
 * `propertyName` from its init dict (confirmed directly: constructing one by hand
 * with that option still reads back `undefined`). A plain `Event` with the property
 * assigned afterwards carries it through correctly, so that's what every test below
 * dispatches instead.
 */
function dispatchTransitionEnd(element: HTMLElement, propertyName: string) {
  const event = new Event("transitionend", { bubbles: true, cancelable: true }) as Event & {
    propertyName: string;
  };
  event.propertyName = propertyName;
  fireEvent(element, event);
}

describe("GalleryControlBlock", () => {
  it("renders the title and trailing content, and the dropdown row, by default open", () => {
    render(
      <GalleryControlBlock title={<h1>Каталог</h1>} trailing={<span>trailing</span>}>
        <span>row content</span>
      </GalleryControlBlock>,
    );

    expect(screen.getByText("Каталог")).toBeTruthy();
    expect(screen.getByText("trailing")).toBeTruthy();
    expect(screen.getByText("row content")).toBeTruthy();
    expect(screen.getByTestId("gallery-filter-toggle").getAttribute("aria-expanded")).toBe("true");
  });

  /**
   * The row stays mounted at all times now (it used to unmount on close) -
   * Oleksii asked for an animated height change, and an unmounted element
   * has no height to animate from. `aria-hidden`/`inert` are what verify
   * "closed" instead of DOM absence: `queryByText` doesn't look at either
   * one, so it would still find "row content" with the row merely collapsed
   * to zero height, which is why this isn't `toBeNull()` anymore.
   */
  it("clicking «Фільтр» marks the row aria-hidden and inert; clicking again clears both", () => {
    render(
      <GalleryControlBlock title={<h1>Каталог</h1>} trailing={null}>
        <span>row content</span>
      </GalleryControlBlock>,
    );

    const toggle = screen.getByTestId("gallery-filter-toggle");
    const row = screen.getByTestId("gallery-filter-row");
    expect(row.getAttribute("aria-hidden")).toBeNull();
    expect(row.inert).toBe(false);

    fireEvent.click(toggle);
    expect(row.getAttribute("aria-hidden")).toBe("true");
    expect(row.inert).toBe(true);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(toggle);
    expect(row.getAttribute("aria-hidden")).toBeNull();
    expect(row.inert).toBe(false);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("the toggle names what it controls, for assistive tech", () => {
    render(
      <GalleryControlBlock title={<h1>Каталог</h1>} trailing={null}>
        <span>row content</span>
      </GalleryControlBlock>,
    );

    const toggle = screen.getByTestId("gallery-filter-toggle");
    const controlledId = toggle.getAttribute("aria-controls");
    expect(controlledId).toBeTruthy();
    expect(document.getElementById(controlledId as string)).toBe(
      screen.getByTestId("gallery-filter-row"),
    );
  });

  /**
   * A real deployment surfaced this: the row's own `overflow-hidden` (needed only
   * while the grid-rows track animates) was clipping every dropdown's popup
   * permanently, not just mid-animation - confirmed against a real running page with
   * `document.elementFromPoint()`, not assumed from reading the CSS. This is a
   * behavioural assertion (an inline style driving whether content can render outside
   * the row, not its appearance), not a looks test.
   */
  describe("the row's overflow, once settled open (the dropdown-clipping fix)", () => {
    function innerWrapper() {
      return screen.getByTestId("gallery-filter-row").firstElementChild as HTMLElement;
    }

    it("starts overflow-visible on mount - nothing to animate yet, so nothing to clip", () => {
      render(
        <GalleryControlBlock title={<h1>Каталог</h1>} trailing={null}>
          <span>row content</span>
        </GalleryControlBlock>,
      );
      expect(innerWrapper().className).toContain("overflow-visible");
    });

    it("clips immediately on close, then un-clips only once the opening transition actually ends", () => {
      render(
        <GalleryControlBlock title={<h1>Каталог</h1>} trailing={null}>
          <span>row content</span>
        </GalleryControlBlock>,
      );
      const toggle = screen.getByTestId("gallery-filter-toggle");
      const row = screen.getByTestId("gallery-filter-row");

      fireEvent.click(toggle); // close
      expect(innerWrapper().className).toContain("overflow-hidden");

      fireEvent.click(toggle); // re-open
      // Still clipped - the opening transition hasn't finished yet.
      expect(innerWrapper().className).toContain("overflow-hidden");

      // A transitionend for an unrelated property must not un-clip it.
      dispatchTransitionEnd(row, "opacity");
      expect(innerWrapper().className).toContain("overflow-hidden");

      dispatchTransitionEnd(row, "grid-template-rows");
      expect(innerWrapper().className).toContain("overflow-visible");
    });

    it("a transitionend while the row is closing never un-clips it", () => {
      render(
        <GalleryControlBlock title={<h1>Каталог</h1>} trailing={null}>
          <span>row content</span>
        </GalleryControlBlock>,
      );
      const toggle = screen.getByTestId("gallery-filter-toggle");
      const row = screen.getByTestId("gallery-filter-row");

      fireEvent.click(toggle); // close
      dispatchTransitionEnd(row, "grid-template-rows");
      expect(innerWrapper().className).toContain("overflow-hidden");
    });

    /**
     * `motion-reduce:duration-0` makes the grid-rows transition zero-length for a
     * visitor with that OS preference - and a zero-duration CSS transition never
     * fires `transitionend` at all, so without its own check, `expanded` would never
     * become `true` again after the first close, clipping every dropdown from then on.
     */
    it("un-clips immediately on open when the visitor prefers reduced motion, with no transitionend to wait for", () => {
      const matchMedia = vi.fn().mockReturnValue({ matches: true });
      vi.stubGlobal("matchMedia", matchMedia);

      render(
        <GalleryControlBlock title={<h1>Каталог</h1>} trailing={null}>
          <span>row content</span>
        </GalleryControlBlock>,
      );
      const toggle = screen.getByTestId("gallery-filter-toggle");

      fireEvent.click(toggle); // close
      expect(innerWrapper().className).toContain("overflow-hidden");

      fireEvent.click(toggle); // re-open - no transitionend fired at all
      expect(innerWrapper().className).toContain("overflow-visible");

      vi.unstubAllGlobals();
    });
  });
});
