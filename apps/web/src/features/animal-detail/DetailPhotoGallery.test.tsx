import type { AnimalPhoto } from "@opika/domain";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DetailPhotoGallery } from "./DetailPhotoGallery";

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
});
