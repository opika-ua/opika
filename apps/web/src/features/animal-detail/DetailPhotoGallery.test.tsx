import type { AnimalPhoto } from "@opika/domain";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DetailPhotoGallery } from "./DetailPhotoGallery";

function photo(storageKey: string, alt: string | null = null): AnimalPhoto {
  return { storageKey, width: 1200, height: 900, alt: alt === null ? null : { uk: alt, en: null } };
}

const THREE_PHOTOS = [photo("/a.jpg"), photo("/b.jpg"), photo("/c.jpg")];
const REGION = { name: "Фотографії тварини" };

/** happy-dom has no layout: give the scroller real-looking widths before it mounts. */
function stubWidths(clientWidth: number, scrollWidth: number) {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(clientWidth);
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(scrollWidth);
}

function imagesIn(region: HTMLElement): HTMLImageElement[] {
  return Array.from(region.querySelectorAll("img"));
}

describe("DetailPhotoGallery", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders every photo (capped at 3) in one named region, falling back to the animal's name for alt", () => {
    render(<DetailPhotoGallery photos={THREE_PHOTOS} altFallback="Мурчик" />);

    const imgs = imagesIn(screen.getByRole("region", REGION));
    expect(imgs).toHaveLength(3);
    expect(imgs[0]?.getAttribute("src")).toContain(encodeURIComponent("/a.jpg"));
    expect(imgs[2]?.getAttribute("src")).toContain(encodeURIComponent("/c.jpg"));
    expect(imgs.every((img) => img.getAttribute("alt") === "Мурчик")).toBe(true);
  });

  it("uses a photo's own alt text when it has one", () => {
    render(<DetailPhotoGallery photos={[photo("/a.jpg", "Мурчик спить")]} altFallback="Мурчик" />);

    expect(screen.getByRole("img", { name: "Мурчик спить" })).toBeTruthy();
  });

  it("a 4th photo never renders", () => {
    render(<DetailPhotoGallery photos={[...THREE_PHOTOS, photo("/d.jpg")]} altFallback="Мурчик" />);

    const imgs = imagesIn(screen.getByRole("region", REGION));
    expect(imgs).toHaveLength(3);
    expect(
      imgs.some((img) => img.getAttribute("src")?.includes(encodeURIComponent("/d.jpg"))),
    ).toBe(false);
  });

  it("renders nothing at all for an animal with no photos", () => {
    const { container } = render(<DetailPhotoGallery photos={[]} altFallback="Мурчик" />);

    expect(container.firstChild).toBeNull();
  });

  it("no slider buttons for a single photo", () => {
    stubWidths(1000, 1000);
    render(<DetailPhotoGallery photos={[photo("/only.jpg")]} altFallback="Мурчик" />);

    expect(screen.queryByRole("button", { name: "Наступне фото" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Попереднє фото" })).toBeNull();
  });

  it("no slider buttons when the photos already fit", () => {
    stubWidths(1000, 1000);
    render(<DetailPhotoGallery photos={[photo("/a.jpg"), photo("/b.jpg")]} altFallback="Мурчик" />);

    expect(screen.queryByRole("button", { name: "Наступне фото" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Попереднє фото" })).toBeNull();
  });

  it("when the photos overflow: next shows and scrolls forward, prev appears once scrolled", () => {
    stubWidths(360, 1128);
    render(<DetailPhotoGallery photos={THREE_PHOTOS} altFallback="Мурчик" />);
    const scroller = screen.getByRole("region", REGION);
    const scrollBy = vi.fn();
    Object.defineProperty(scroller, "scrollBy", { value: scrollBy, configurable: true });

    expect(screen.queryByRole("button", { name: "Попереднє фото" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Наступне фото" }));
    expect(scrollBy).toHaveBeenCalledTimes(1);
    expect(scrollBy.mock.calls[0]?.[0].left).toBeGreaterThan(0);

    Object.defineProperty(scroller, "scrollLeft", { value: 300, configurable: true });
    fireEvent.scroll(scroller);
    fireEvent.click(screen.getByRole("button", { name: "Попереднє фото" }));
    expect(scrollBy.mock.calls[1]?.[0].left).toBeLessThan(0);
  });

  it("next disappears once scrolled to the end - no wrap-around", () => {
    stubWidths(360, 1128);
    render(<DetailPhotoGallery photos={THREE_PHOTOS} altFallback="Мурчик" />);
    const scroller = screen.getByRole("region", REGION);

    Object.defineProperty(scroller, "scrollLeft", { value: 768, configurable: true });
    fireEvent.scroll(scroller);

    expect(screen.queryByRole("button", { name: "Наступне фото" })).toBeNull();
    expect(screen.getByRole("button", { name: "Попереднє фото" })).toBeTruthy();
  });
  it("jumps instead of gliding when the visitor asked for reduced motion", () => {
    stubWidths(360, 1128);
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query) => ({ matches: query.includes("reduce"), media: query }) as MediaQueryList,
    );
    render(<DetailPhotoGallery photos={THREE_PHOTOS} altFallback="Мурчик" />);
    const scroller = screen.getByRole("region", REGION);
    const scrollBy = vi.fn();
    Object.defineProperty(scroller, "scrollBy", { value: scrollBy, configurable: true });

    fireEvent.click(screen.getByRole("button", { name: "Наступне фото" }));

    expect(scrollBy.mock.calls[0]?.[0].behavior).toBe("auto");
  });
});
