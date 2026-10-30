import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAnchored } from "./anchored";
import { InfoTip } from "./InfoTip";

type Observer = {
  cb: IntersectionObserverCallback;
  options: IntersectionObserverInit | undefined;
  disconnected: boolean;
};
let observers: Observer[] = [];

beforeEach(() => {
  observers = [];
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      private readonly record: Observer;
      constructor(cb: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        this.record = { cb, options, disconnected: false };
        observers.push(this.record);
      }
      observe() {}
      disconnect() {
        this.record.disconnected = true;
      }
    },
  );
  document.documentElement.style.setProperty("--sticky-header-h", "64px");
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.style.removeProperty("--sticky-header-h");
});

const report = (isIntersecting: boolean) =>
  act(() => {
    for (const o of observers) {
      o.cb([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver);
    }
  });

function Probe({ place, onHidden }: { place: () => void; onHidden: () => void }) {
  const ref = useRef<HTMLButtonElement | null>(null);
  useAnchored(true, ref, place, onHidden);
  return (
    <button ref={ref} type="button">
      anchor
    </button>
  );
}

describe("useAnchored", () => {
  it("places on mount, scroll and resize", () => {
    const place = vi.fn();
    render(<Probe place={place} onHidden={vi.fn()} />);
    const base = place.mock.calls.length;
    expect(base).toBeGreaterThan(0);
    fireEvent.scroll(window);
    fireEvent(window, new Event("resize"));
    expect(place.mock.calls.length).toBe(base + 2);
  });

  it("observes with the header height as a negative top margin and closes when not intersecting", () => {
    const onHidden = vi.fn();
    render(<Probe place={vi.fn()} onHidden={onHidden} />);
    expect(observers[0]?.options).toMatchObject({ rootMargin: "-64px 0px 0px 0px", threshold: 0 });
    report(true);
    expect(onHidden).not.toHaveBeenCalled();
    report(false);
    expect(onHidden).toHaveBeenCalledTimes(1);
  });
});

describe("InfoTip when its trigger is hidden", () => {
  it("closes, and returns focus to the trigger when it was inside the card", async () => {
    render(
      <InfoTip label="Підказка" closeLabel="Закрити">
        Текст
      </InfoTip>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Підказка" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Закрити" }));
    report(false);
    expect(screen.queryByText("Текст")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Підказка" }));
  });

  it("does not take focus when it was elsewhere", async () => {
    render(
      <>
        <InfoTip label="Підказка" closeLabel="Закрити">
          Текст
        </InfoTip>
        <input aria-label="Інше" />
      </>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Підказка" }));
    const other = screen.getByLabelText("Інше");
    act(() => other.focus());
    // focus leaving already closes the card; reopen state is not needed, only that focus stays put.
    report(false);
    expect(document.activeElement).toBe(other);
  });
});
