import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { browserTriggers, LOAD_DELAY_MS } from "./load-client";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("browserTriggers.afterLoadDelay", () => {
  it("fires LOAD_DELAY_MS after the load event, not before", () => {
    vi.spyOn(document, "readyState", "get").mockReturnValue("loading");
    const fire = vi.fn();
    const stop = browserTriggers.afterLoadDelay(fire);
    vi.advanceTimersByTime(LOAD_DELAY_MS * 2);
    expect(fire).not.toHaveBeenCalled();

    window.dispatchEvent(new Event("load"));
    vi.advanceTimersByTime(LOAD_DELAY_MS - 1);
    expect(fire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fire).toHaveBeenCalledTimes(1);
    stop();
    vi.restoreAllMocks();
  });

  it("arms at once when the page is already complete, and the clean-up cancels it", () => {
    vi.spyOn(document, "readyState", "get").mockReturnValue("complete");
    const fire = vi.fn();
    const stop = browserTriggers.afterLoadDelay(fire);
    stop();
    vi.advanceTimersByTime(LOAD_DELAY_MS * 2);
    expect(fire).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});

describe("browserTriggers.onInteraction", () => {
  it("fires once on the first pointer, key or touch event, and not after the clean-up", () => {
    const fire = vi.fn();
    const stop = browserTriggers.onInteraction(fire);
    window.dispatchEvent(new Event("keydown"));
    expect(fire).toHaveBeenCalledTimes(1);
    stop();
    window.dispatchEvent(new Event("pointerdown"));
    window.dispatchEvent(new Event("touchstart"));
    expect(fire).toHaveBeenCalledTimes(1);
  });
});

describe("browserTriggers.onError", () => {
  it("passes an error event's error, or builds one from its message", () => {
    const fire = vi.fn();
    const stop = browserTriggers.onError(fire);
    const boom = new Error("boom");
    window.dispatchEvent(new ErrorEvent("error", { error: boom, message: "boom" }));
    window.dispatchEvent(new ErrorEvent("error", { message: "no object" }));
    expect(fire.mock.calls[0]?.[0]).toBe(boom);
    expect(fire.mock.calls[1]?.[0]).toBeInstanceOf(Error);
    expect(fire.mock.calls[1]?.[0]).toMatchObject({ message: "no object" });
    stop();
  });

  it("passes an unhandled rejection's reason, and stops after the clean-up", () => {
    const fire = vi.fn();
    const stop = browserTriggers.onError(fire);
    const reason = new Error("rejected");
    const event = new Event("unhandledrejection") as Event & { reason: unknown };
    event.reason = reason;
    window.dispatchEvent(event);
    expect(fire).toHaveBeenCalledWith(reason);
    stop();
    window.dispatchEvent(event);
    expect(fire).toHaveBeenCalledTimes(1);
  });
});
