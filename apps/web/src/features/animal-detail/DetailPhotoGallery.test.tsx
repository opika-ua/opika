import type { AnimalPhoto } from "@opika/domain";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DetailPhotoGallery } from "./DetailPhotoGallery";

function photo(storageKey: string): AnimalPhoto {
  return { storageKey, width: 1200, height: 900, alt: null };
}

const THREE_PHOTOS = [photo("/a.jpg"), photo("/b.jpg"), photo("/c.jpg")];

describe("DetailPhotoGallery", () => {
  it("shows the first photo active, with all three photos as clickable thumbnails", () => {
    render(<DetailPhotoGallery photos={THREE_PHOTOS} altFallback="Мурчик" />);

    const main = within(screen.getByTestId("detail-photo")).getByRole("img");
    expect(main.getAttribute("src")).toContain(encodeURIComponent("/a.jpg"));

    // All three, not "the other two" — the mock's own D1 frame shows the
    // active photo *inside* the thumbnail strip, ringed, not excluded from it.
    const thumbnails = screen.getAllByTestId("detail-photo-thumbnail");
    expect(thumbnails).toHaveLength(3);
    expect(thumbnails[0]?.getAttribute("aria-pressed")).toBe("true");
    expect(thumbnails[1]?.getAttribute("aria-pressed")).toBe("false");
  });

  it("clicking a thumbnail makes it the active photo — it stays in the strip, ringed, rather than swapping out", () => {
    render(<DetailPhotoGallery photos={THREE_PHOTOS} altFallback="Мурчик" />);

    const thumbnails = screen.getAllByTestId("detail-photo-thumbnail");
    const second = thumbnails[1];
    if (!second) throw new Error("expected a second thumbnail");
    fireEvent.click(second);

    const main = within(screen.getByTestId("detail-photo")).getByRole("img");
    expect(main.getAttribute("src")).toContain(encodeURIComponent("/b.jpg"));

    // Still three thumbnails, same three photos, just a different one ringed.
    const thumbnailsAfter = screen.getAllByTestId("detail-photo-thumbnail");
    expect(thumbnailsAfter).toHaveLength(3);
    expect(thumbnailsAfter[0]?.getAttribute("aria-pressed")).toBe("false");
    expect(thumbnailsAfter[1]?.getAttribute("aria-pressed")).toBe("true");
    const srcs = thumbnailsAfter.map((el) => el.querySelector("img")?.getAttribute("src"));
    expect(srcs.some((src) => src?.includes(encodeURIComponent("/a.jpg")))).toBe(true);
    expect(srcs.some((src) => src?.includes(encodeURIComponent("/b.jpg")))).toBe(true);
    expect(srcs.some((src) => src?.includes(encodeURIComponent("/c.jpg")))).toBe(true);
  });

  it("clicking a dot activates the same photo a thumbnail click would, on mobile", () => {
    render(<DetailPhotoGallery photos={THREE_PHOTOS} altFallback="Мурчик" />);

    const dots = screen.getAllByTestId("detail-photo-dot");
    expect(dots).toHaveLength(3);
    const third = dots[2];
    if (!third) throw new Error("expected a third dot");
    fireEvent.click(third);

    const main = within(screen.getByTestId("detail-photo")).getByRole("img");
    expect(main.getAttribute("src")).toContain(encodeURIComponent("/c.jpg"));
    expect(dots[2]?.getAttribute("aria-selected")).toBe("true");
    expect(dots[0]?.getAttribute("aria-selected")).toBe("false");
  });

  it("caps at 3 photos — a 4th never becomes a thumbnail, dot, or reachable active photo", () => {
    render(<DetailPhotoGallery photos={[...THREE_PHOTOS, photo("/d.jpg")]} altFallback="Мурчик" />);

    expect(screen.getAllByTestId("detail-photo-thumbnail")).toHaveLength(3);
    expect(screen.getAllByTestId("detail-photo-dot")).toHaveLength(3);
    const allSrcs = Array.from(document.querySelectorAll("img")).map((el) =>
      el.getAttribute("src"),
    );
    expect(allSrcs.some((src) => src?.includes(encodeURIComponent("/d.jpg")))).toBe(false);
  });

  it("renders no dots or thumbnails for a single-photo animal", () => {
    render(<DetailPhotoGallery photos={[photo("/only.jpg")]} altFallback="Мурчик" />);

    expect(screen.queryByTestId("detail-photo-dot")).toBeNull();
    expect(screen.queryByTestId("detail-photo-thumbnail")).toBeNull();
    expect(within(screen.getByTestId("detail-photo")).getByRole("img")).toBeTruthy();
  });

  it("renders nothing in the photo box for an animal with no photos at all, without throwing", () => {
    render(<DetailPhotoGallery photos={[]} altFallback="Мурчик" />);

    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByTestId("detail-photo")).toBeTruthy();
  });
});
