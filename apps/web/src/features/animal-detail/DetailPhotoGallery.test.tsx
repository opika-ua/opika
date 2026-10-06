import type { AnimalPhoto } from "@opika/domain";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DetailPhotoGallery } from "./DetailPhotoGallery";

function photo(storageKey: string): AnimalPhoto {
  return { storageKey, width: 1200, height: 900, alt: null };
}

const FOUR_PHOTOS = [photo("/a.jpg"), photo("/b.jpg"), photo("/c.jpg"), photo("/d.jpg")];

describe("DetailPhotoGallery", () => {
  it("shows the first photo active, with the other three as clickable thumbnails", () => {
    render(<DetailPhotoGallery photos={FOUR_PHOTOS} altFallback="Мурчик" pipsOverlay={null} />);

    const main = within(screen.getByTestId("detail-photo")).getByRole("img");
    expect(main.getAttribute("src")).toContain(encodeURIComponent("/a.jpg"));

    const thumbnails = screen.getAllByTestId("detail-photo-thumbnail");
    expect(thumbnails).toHaveLength(3);
  });

  it("clicking a thumbnail swaps it into the active photo slot — O-10's own complaint, that the others were never really viewable", () => {
    render(<DetailPhotoGallery photos={FOUR_PHOTOS} altFallback="Мурчик" pipsOverlay={null} />);

    const secondThumbnail = screen.getAllByTestId("detail-photo-thumbnail")[0];
    if (!secondThumbnail) throw new Error("expected at least one thumbnail");
    fireEvent.click(secondThumbnail);

    const main = within(screen.getByTestId("detail-photo")).getByRole("img");
    expect(main.getAttribute("src")).toContain(encodeURIComponent("/b.jpg"));

    // The clicked photo is no longer offered as a thumbnail — it's the main
    // photo now — and the one it displaced (/a.jpg) takes its place instead.
    // `alt=""` on a thumbnail is deliberate (decorative; the button's own
    // `aria-label` carries the accessible name), so these are queried as
    // plain DOM nodes, not by role "img".
    const thumbnailSrcs = screen
      .getAllByTestId("detail-photo-thumbnail")
      .map((el) => el.querySelector("img")?.getAttribute("src"));
    expect(thumbnailSrcs.some((src) => src?.includes(encodeURIComponent("/a.jpg")))).toBe(true);
    expect(thumbnailSrcs.some((src) => src?.includes(encodeURIComponent("/b.jpg")))).toBe(false);
  });

  it("clicking a dot swaps the active photo on mobile, the same as a thumbnail click on desktop", () => {
    render(<DetailPhotoGallery photos={FOUR_PHOTOS} altFallback="Мурчик" pipsOverlay={null} />);

    const dots = screen.getAllByTestId("detail-photo-dot");
    expect(dots).toHaveLength(4);
    expect(dots[2]).not.toBeUndefined();
    fireEvent.click(dots[2] as HTMLElement);

    const main = within(screen.getByTestId("detail-photo")).getByRole("img");
    expect(main.getAttribute("src")).toContain(encodeURIComponent("/c.jpg"));
    expect(dots[2]?.getAttribute("aria-selected")).toBe("true");
    expect(dots[0]?.getAttribute("aria-selected")).toBe("false");
  });

  it("caps at 4 photos — a 5th never becomes a thumbnail, dot, or reachable active photo", () => {
    render(
      <DetailPhotoGallery
        photos={[...FOUR_PHOTOS, photo("/e.jpg")]}
        altFallback="Мурчик"
        pipsOverlay={null}
      />,
    );

    expect(screen.getAllByTestId("detail-photo-thumbnail")).toHaveLength(3);
    expect(screen.getAllByTestId("detail-photo-dot")).toHaveLength(4);
    // Every `<img>` regardless of role — thumbnails are deliberately
    // decorative (`alt=""`, role "presentation"), so `getAllByRole("img")`
    // alone would miss them and this check would pass by accident.
    const allSrcs = Array.from(document.querySelectorAll("img")).map((el) =>
      el.getAttribute("src"),
    );
    expect(allSrcs.some((src) => src?.includes(encodeURIComponent("/e.jpg")))).toBe(false);
  });

  it("renders no dots or thumbnails for a single-photo animal", () => {
    render(
      <DetailPhotoGallery photos={[photo("/only.jpg")]} altFallback="Мурчик" pipsOverlay={null} />,
    );

    expect(screen.queryByTestId("detail-photo-dot")).toBeNull();
    expect(screen.queryByTestId("detail-photo-thumbnail")).toBeNull();
    expect(within(screen.getByTestId("detail-photo")).getByRole("img")).toBeTruthy();
  });

  it("renders nothing in the photo box for an animal with no photos at all, without throwing", () => {
    render(<DetailPhotoGallery photos={[]} altFallback="Мурчик" pipsOverlay={null} />);

    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByTestId("detail-photo")).toBeTruthy();
  });

  it("renders the caller's pips overlay as a sibling, unaffected by which photo is active", () => {
    render(
      <DetailPhotoGallery
        photos={FOUR_PHOTOS}
        altFallback="Мурчик"
        pipsOverlay={<span data-testid="pips-stub">pips</span>}
      />,
    );

    expect(screen.getByTestId("pips-stub")).toBeTruthy();
    fireEvent.click(screen.getAllByTestId("detail-photo-thumbnail")[0] as HTMLElement);
    expect(screen.getByTestId("pips-stub")).toBeTruthy();
  });
});
