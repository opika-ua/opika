import type { AnimalPhoto } from "@opika/domain";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DetailPhotoGallery, sliderOverflowOf } from "./DetailPhotoGallery";

function photo(storageKey: string): AnimalPhoto {
  return { storageKey, width: 1200, height: 900, alt: null };
}

const THREE_PHOTOS = [photo("/a.jpg"), photo("/b.jpg"), photo("/c.jpg")];

/**
 * Pet card PR 5 (Figma `75:425`/`88:1929`, owner decision 7): replaced the
 * old dot-indicator/thumbnail-strip gallery (`detail-photo-dot`/
 * `detail-photo-thumbnail`, this file's own pre-PR-5 tests) with a native
 * scroll-snap slider - no library, a "next" button that scrolls one photo,
 * a "prev" button that appears once scrolled. `scrollBy`/`scrollLeft` are
 * stubbed below since happy-dom doesn't implement real scroll geometry.
 */
describe("DetailPhotoGallery", () => {
  it("renders every photo (capped at 3) inside the scroll container, each with its own alt text", () => {
    render(<DetailPhotoGallery photos={THREE_PHOTOS} altFallback="Мурчик" />);

    const scroller = screen.getByRole("region", { name: "Фотографії тварини" });
    const photos = screen.getAllByTestId("detail-photo");
    expect(photos).toHaveLength(3);
    const imgs = photos.map((p) => p.querySelector("img"));
    expect(imgs[0]?.getAttribute("src")).toContain(encodeURIComponent("/a.jpg"));
    expect(imgs[1]?.getAttribute("src")).toContain(encodeURIComponent("/b.jpg"));
    expect(imgs[2]?.getAttribute("src")).toContain(encodeURIComponent("/c.jpg"));
    expect(imgs.every((img) => img?.getAttribute("alt") === "Мурчик")).toBe(true);
    expect(scroller.contains(photos[0] as Node)).toBe(true);
  });

  it("caps at 3 photos - a 4th never renders", () => {
    render(<DetailPhotoGallery photos={[...THREE_PHOTOS, photo("/d.jpg")]} altFallback="Мурчик" />);

    expect(screen.getAllByTestId("detail-photo")).toHaveLength(3);
    const allSrcs = Array.from(document.querySelectorAll("img")).map((el) =>
      el.getAttribute("src"),
    );
    expect(allSrcs.some((src) => src?.includes(encodeURIComponent("/d.jpg")))).toBe(false);
  });

  it("the next button scrolls the container forward by one photo's width plus the gap", () => {
    render(<DetailPhotoGallery photos={THREE_PHOTOS} altFallback="Мурчик" />);
    const scroller = screen.getByRole("region", { name: "Фотографії тварини" });
    const scrollBy = vi.fn();
    Object.defineProperty(scroller, "scrollBy", { value: scrollBy, configurable: true });

    fireEvent.click(screen.getByRole("button", { name: "Наступне фото" }));

    expect(scrollBy).toHaveBeenCalledWith({ left: 384, behavior: "smooth" });
  });

  it("the prev button is absent until the container has scrolled, then scrolls backward", () => {
    render(<DetailPhotoGallery photos={THREE_PHOTOS} altFallback="Мурчик" />);
    const scroller = screen.getByRole("region", { name: "Фотографії тварини" });
    expect(screen.queryByRole("button", { name: "Попереднє фото" })).toBeNull();

    Object.defineProperty(scroller, "scrollLeft", { value: 384, configurable: true });
    fireEvent.scroll(scroller);

    const prev = screen.getByRole("button", { name: "Попереднє фото" });
    const scrollBy = vi.fn();
    Object.defineProperty(scroller, "scrollBy", { value: scrollBy, configurable: true });
    fireEvent.click(prev);
    expect(scrollBy).toHaveBeenCalledWith({ left: -384, behavior: "smooth" });
  });

  /**
   * Mutation proof: a version of the next button gated only on `canScroll`
   * (the old rule, no end check) would still pass every other test in this
   * file - a real screenshot caught it staying visible, and clickable doing
   * nothing, once the strip had nothing further to reveal. `scrollWidth`/
   * `clientWidth` are stubbed to a real-looking, already-at-the-end
   * relationship (`scrollLeft + clientWidth === scrollWidth`), the same
   * non-zero-`clientWidth` precondition `sliderOverflowOf`'s own tests use
   * to get a conclusive reading out of happy-dom.
   */
  it("the next button disappears once scrolled to the end - no wrap-around, same as prev at the start", () => {
    render(<DetailPhotoGallery photos={THREE_PHOTOS} altFallback="Мурчик" />);
    const scroller = screen.getByRole("region", { name: "Фотографії тварини" });
    screen.getByRole("button", { name: "Наступне фото" }); // throws if absent

    Object.defineProperty(scroller, "clientWidth", { value: 1000, configurable: true });
    Object.defineProperty(scroller, "scrollWidth", { value: 1128, configurable: true });
    Object.defineProperty(scroller, "scrollLeft", { value: 128, configurable: true });
    fireEvent.scroll(scroller);

    expect(screen.queryByRole("button", { name: "Наступне фото" })).toBeNull();
    screen.getByRole("button", { name: "Попереднє фото" }); // still here, scrolled > 0
  });

  it("no slider buttons at all for a single-photo animal", () => {
    render(<DetailPhotoGallery photos={[photo("/only.jpg")]} altFallback="Мурчик" />);

    expect(screen.getAllByTestId("detail-photo")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Наступне фото" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Попереднє фото" })).toBeNull();
  });

  /**
   * Mutation proof: a version of this component that unconditionally
   * rendered an empty scroll container (even with zero photos) would still
   * pass every test above. This is the one that would catch it - confirmed
   * red against that mutation (dropping the `visible.length === 0` early
   * return) before being kept.
   */
  it("renders nothing at all for an animal with no photos", () => {
    const { container } = render(<DetailPhotoGallery photos={[]} altFallback="Мурчик" />);

    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
  });

  /**
   * Pet card PR 5 follow-up: a real screenshot caught two photos narrow
   * enough to both fit the panel showing a "next" button that scrolled
   * nothing - the old rule was "2+ photos" alone, with no check that there
   * was anything to scroll to. `clientWidth`/`scrollWidth` are stubbed on
   * the prototype (not the instance, per the component's own comment on
   * `sliderOverflowOf`: a real measurement only happens once both are
   * non-zero, which happy-dom's default layout-less 0/0 never is) so the
   * mount effect's own measurement sees real-looking, equal values.
   */
  describe("no slider buttons when the photos already fit (no real overflow)", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("renders two photos that fit with no next/prev buttons at all", () => {
      vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1000);
      vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(1000);

      render(
        <DetailPhotoGallery photos={[photo("/a.jpg"), photo("/b.jpg")]} altFallback="Мурчик" />,
      );

      expect(screen.getAllByTestId("detail-photo")).toHaveLength(2);
      expect(screen.queryByRole("button", { name: "Наступне фото" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Попереднє фото" })).toBeNull();
    });

    /**
     * Mutation proof: a version of `canScroll` that only checked
     * `visible.length > 1` (the old rule) would still pass every other test
     * in this file - this is the one that catches it. Confirmed red against
     * that exact mutation before being kept.
     */
    it("still shows the next button when the same photo count genuinely overflows", () => {
      vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1000);
      vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(1128);

      render(
        <DetailPhotoGallery photos={[photo("/a.jpg"), photo("/b.jpg")]} altFallback="Мурчик" />,
      );

      expect(screen.getAllByRole("button", { name: "Наступне фото" })).toHaveLength(1);
    });
  });
});

describe("sliderOverflowOf", () => {
  it('is "unknown" when the container hasn\'t been laid out (clientWidth 0) - never read as "fits"', () => {
    expect(sliderOverflowOf(0, 0)).toBe("unknown");
    expect(sliderOverflowOf(1128, 0)).toBe("unknown");
  });

  it('is "overflows" once the content is wider than the container by more than the rounding slack', () => {
    expect(sliderOverflowOf(1128, 1000)).toBe("overflows");
  });

  it('is "fits" when the content is no wider than the container (within 1px of rounding slack)', () => {
    expect(sliderOverflowOf(1000, 1000)).toBe("fits");
    expect(sliderOverflowOf(1000.5, 1000)).toBe("fits");
  });
});
