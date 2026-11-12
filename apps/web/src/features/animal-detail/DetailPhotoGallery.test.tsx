import { type AnimalPhoto, MAX_ANIMAL_PHOTOS } from "@opika/domain";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DetailPhotoGallery } from "./DetailPhotoGallery";

function photo(storageKey: string, alt: string | null = null): AnimalPhoto {
  return { storageKey, width: 1200, height: 900, alt: alt === null ? null : { uk: alt, en: null } };
}

const THREE_PHOTOS = [photo("/a.jpg"), photo("/b.jpg"), photo("/c.jpg")];
const REGION = { name: "Фотогалерея" };

/** happy-dom has no layout: give the scroller real-looking widths before it mounts. */
function stubWidths(clientWidth: number, scrollWidth: number) {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(clientWidth);
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(scrollWidth);
}

function imagesIn(region: HTMLElement): HTMLImageElement[] {
  return Array.from(region.querySelectorAll("img"));
}

type Watcher = {
  cb: IntersectionObserverCallback;
  options: IntersectionObserverInit | undefined;
  targets: Element[];
};
let watchers: Watcher[] = [];

/** The slider arms later slides through one observer; tests report which slides came into range. */
function stubObserver() {
  watchers = [];
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      private readonly watcher: Watcher;
      constructor(cb: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        this.watcher = { cb, options, targets: [] };
        watchers.push(this.watcher);
      }
      observe(target: Element) {
        this.watcher.targets.push(target);
      }
      disconnect() {}
    },
  );
}

function reveal(slideIndex: number) {
  const watcher = watchers[0];
  const target = watcher?.targets[slideIndex];
  if (!watcher || !target) throw new Error(`no observed slide ${slideIndex}`);
  act(() => {
    watcher.cb([{ isIntersecting: true, target } as IntersectionObserverEntry], {} as never);
  });
}

describe("DetailPhotoGallery", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("loads only the first photo until the others come into range, falling back to the animal's name for alt", () => {
    stubObserver();
    render(<DetailPhotoGallery photos={THREE_PHOTOS} altFallback="Мурчик" />);
    const region = screen.getByRole("region", REGION);

    expect(imagesIn(region)).toHaveLength(1);
    expect(watchers[0]?.options?.root).toBe(region);
    reveal(2);
    const imgs = imagesIn(region);
    expect(imgs).toHaveLength(2);
    expect(imgs[0]?.getAttribute("src")).toContain(encodeURIComponent("/a.jpg"));
    expect(imgs[1]?.getAttribute("src")).toContain(encodeURIComponent("/c.jpg"));
    expect(imgs.every((img) => img.getAttribute("alt") === "Мурчик")).toBe(true);
  });

  it("uses a photo's own alt text when it has one", () => {
    render(<DetailPhotoGallery photos={[photo("/a.jpg", "Мурчик спить")]} altFallback="Мурчик" />);

    expect(screen.getByRole("img", { name: "Мурчик спить" })).toBeTruthy();
  });

  it.each([1, 5, MAX_ANIMAL_PHOTOS])("shows all %i photos, in order, once armed", (count) => {
    stubObserver();
    const photos = Array.from({ length: count }, (_, i) => photo(`/p${i}.jpg`));
    render(<DetailPhotoGallery photos={photos} altFallback="Мурчик" />);
    for (let i = 1; i < count; i++) reveal(i);

    const imgs = imagesIn(screen.getByRole("region", REGION));
    expect(imgs).toHaveLength(count);
    imgs.forEach((img, i) => {
      expect(img.getAttribute("src")).toContain(encodeURIComponent(`/p${i}.jpg`));
    });
  });

  it("an armed slide stays loaded, and without IntersectionObserver every photo loads", () => {
    stubObserver();
    const { unmount } = render(<DetailPhotoGallery photos={THREE_PHOTOS} altFallback="Мурчик" />);
    reveal(1);
    reveal(1);
    expect(imagesIn(screen.getByRole("region", REGION))).toHaveLength(2);
    unmount();

    vi.stubGlobal("IntersectionObserver", undefined);
    render(<DetailPhotoGallery photos={THREE_PHOTOS} altFallback="Мурчик" />);
    expect(imagesIn(screen.getByRole("region", REGION))).toHaveLength(3);
  });

  it("an animal with no photos gets the phone's placeholder text and no slider", () => {
    render(<DetailPhotoGallery photos={[]} altFallback="Мурчик" />);

    expect(screen.getByText("Фото немає – притулок ще не надіслав")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Фотогалерея" })).toBeNull();
  });

  it("two photos get a counter whose accessible name says which one is showing", () => {
    stubWidths(400, 800);
    render(<DetailPhotoGallery photos={[photo("/a.jpg"), photo("/b.jpg")]} altFallback="Мурчик" />);

    expect(screen.getByRole("status").textContent).toBe("Фото 1 з 2");
    expect(screen.getByText("1/2")).toBeTruthy();
  });

  it("one photo has no counter", () => {
    stubWidths(400, 400);
    render(<DetailPhotoGallery photos={[photo("/only.jpg")]} altFallback="Мурчик" />);

    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByText("1/1")).toBeNull();
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

  it("when the photos overflow: next shows and scrolls forward one photo, prev appears once scrolled", () => {
    stubWidths(376, 1128);
    render(<DetailPhotoGallery photos={THREE_PHOTOS} altFallback="Мурчик" />);
    const scroller = screen.getByRole("region", REGION);
    const scrollTo = vi.fn();
    Object.defineProperty(scroller, "scrollTo", { value: scrollTo, configurable: true });

    expect(screen.queryByRole("button", { name: "Попереднє фото" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Наступне фото" }));
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo.mock.calls[0]?.[0].left).toBe(376);

    Object.defineProperty(scroller, "scrollLeft", { value: 376, configurable: true });
    fireEvent.scroll(scroller);
    fireEvent.click(screen.getByRole("button", { name: "Попереднє фото" }));
    expect(scrollTo.mock.calls[1]?.[0].left).toBe(0);
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
    const scrollTo = vi.fn();
    Object.defineProperty(scroller, "scrollTo", { value: scrollTo, configurable: true });

    fireEvent.click(screen.getByRole("button", { name: "Наступне фото" }));

    expect(scrollTo.mock.calls[0]?.[0].behavior).toBe("auto");
  });
});
