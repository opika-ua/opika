import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PhotoSlider, type PhotoSliderItem } from "./PhotoSlider";

const LABELS = {
  label: "Фотогалерея",
  prevLabel: "Попереднє фото",
  nextLabel: "Наступне фото",
  counterTemplate: "Фото {n} з {total}",
  rowPrevLabel: "Попередні фото",
  rowNextLabel: "Наступні фото",
  rowCounterTemplate: "{first}–{last} з {total}",
} as const;

const photos = (count: number): PhotoSliderItem[] =>
  Array.from({ length: count }, (_, index) => ({ src: `/p${index}.jpg`, alt: "" }));

/** happy-dom has no layout: a desktop row 900px wide, each photo's slot a third of it. */
function renderRow(count: number) {
  const slot = 900 / Math.min(count, 3);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(900);
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(slot * count);
  render(<PhotoSlider photos={photos(count)} sizes="300px" slide="hero" {...LABELS} />);
  const scroller = screen.getByRole("region", { name: "Фотогалерея" });
  const scrollTo = vi.fn();
  Object.defineProperty(scroller, "scrollTo", { value: scrollTo, configurable: true });
  return { scroller, scrollTo };
}

function scrollBy(scroller: HTMLElement, left: number) {
  Object.defineProperty(scroller, "scrollLeft", { value: left, configurable: true });
  fireEvent.scroll(scroller);
}

const prev = () => screen.queryByRole("button", { name: "Попередні фото" });
const next = () => screen.queryByRole("button", { name: "Наступні фото" });
const counter = () => screen.queryByText(/^\d+–\d+ з \d+$/);

function press(button: HTMLElement | null) {
  if (button === null) throw new Error("the arrow is not there");
  fireEvent.click(button);
}

describe("PhotoSlider hero, from desktop: the row of three", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("five photos: each arrow moves one photo, with no wrap-around, and the counter follows", () => {
    const { scrollTo } = renderRow(5);

    expect(prev()).toBeNull();
    expect(counter()?.textContent).toBe("1–3 з 5");
    expect(counter()?.getAttribute("aria-live")).toBe("polite");

    press(next());
    expect(scrollTo.mock.calls[0]?.[0].left).toBe(300);
    expect(counter()?.textContent).toBe("2–4 з 5");
    expect(prev()).not.toBeNull();
    expect(next()).not.toBeNull();

    press(next());
    expect(scrollTo.mock.calls[1]?.[0].left).toBe(600);
    expect(counter()?.textContent).toBe("3–5 з 5");
    expect(next()).toBeNull();

    press(prev());
    press(prev());
    expect(counter()?.textContent).toBe("1–3 з 5");
    expect(prev()).toBeNull();
    expect(scrollTo).toHaveBeenCalledTimes(4);
  });

  it.each([1, 2, 3])("%i photos fit whole: no arrows and no counter", (count) => {
    renderRow(count);

    expect(screen.getByRole("region", { name: "Фотогалерея" }).children).toHaveLength(count);
    expect(prev()).toBeNull();
    expect(next()).toBeNull();
    expect(counter()).toBeNull();
  });

  it("scrolling by hand (a swipe, a trackpad) moves the counter and the arrows too", () => {
    const { scroller } = renderRow(5);

    scrollBy(scroller, 600);

    expect(counter()?.textContent).toBe("3–5 з 5");
    expect(next()).toBeNull();
    expect(prev()).not.toBeNull();
  });

  it("a second press during the glide goes on from where the row is heading", () => {
    const { scroller, scrollTo } = renderRow(5);

    press(next());
    scrollBy(scroller, 100);
    expect(counter()?.textContent).toBe("2–4 з 5");
    press(next());

    expect(scrollTo.mock.calls[1]?.[0].left).toBe(600);
    expect(counter()?.textContent).toBe("3–5 з 5");
  });

  it("the arrow that hides at an end hands its focus to the other one", () => {
    renderRow(4);
    next()?.focus();

    press(next());

    expect(next()).toBeNull();
    expect(document.activeElement).toBe(prev());

    press(prev());

    expect(prev()).toBeNull();
    expect(document.activeElement).toBe(next());
  });

  it("glides by default and jumps when the visitor asked for reduced motion", () => {
    const { scrollTo } = renderRow(5);
    const matchMedia = vi
      .spyOn(window, "matchMedia")
      .mockImplementation((query) => ({ matches: false, media: query }) as MediaQueryList);

    press(next());
    expect(scrollTo.mock.calls[0]?.[0].behavior).toBe("smooth");

    matchMedia.mockImplementation(
      (query) => ({ matches: query.includes("reduce"), media: query }) as MediaQueryList,
    );
    press(next());
    expect(scrollTo.mock.calls[1]?.[0].behavior).toBe("auto");
  });
});

describe("PhotoSlider peek", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("still steps by most of the visible width", () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(1200);
    render(
      <PhotoSlider
        photos={photos(3)}
        sizes="300px"
        label="Фото"
        prevLabel="Попереднє фото"
        nextLabel="Наступне фото"
      />,
    );
    const scroller = screen.getByRole("region", { name: "Фото" });
    const scrollByMock = vi.fn();
    Object.defineProperty(scroller, "scrollBy", { value: scrollByMock, configurable: true });

    fireEvent.click(screen.getByRole("button", { name: "Наступне фото" }));

    expect(scrollByMock.mock.calls[0]?.[0].left).toBe(360);
  });
});
