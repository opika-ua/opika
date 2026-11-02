// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { loadSentryClientWhenIdle, reportClientError } from "./load-client";

describe("loadSentryClientWhenIdle", () => {
  it("with no DSN schedules nothing and never requests the SDK module", () => {
    const schedule = vi.fn();
    const load = vi.fn();
    expect(loadSentryClientWhenIdle({ dsn: undefined, schedule, load })).toBe(false);
    expect(schedule).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
  });

  it("with a DSN waits for idle before loading, then starts the SDK once", async () => {
    let idle: () => void = () => {};
    const init = vi.fn();
    const load = vi.fn(async () => ({ initClientSentry: init }));
    const started = loadSentryClientWhenIdle({
      dsn: "https://k@o1.ingest.de.sentry.io/1",
      schedule: (callback) => {
        idle = callback;
      },
      load,
    });
    expect(started).toBe(true);
    expect(load).not.toHaveBeenCalled();
    idle();
    await vi.waitFor(() => expect(init).toHaveBeenCalledTimes(1));
    expect(init).toHaveBeenCalledWith("https://k@o1.ingest.de.sentry.io/1");
  });

  it("swallows a failed load so monitoring never breaks the page", async () => {
    const load = vi.fn(async () => {
      throw new Error("chunk blocked");
    });
    loadSentryClientWhenIdle({ dsn: "https://k@h.example/1", schedule: (cb) => cb(), load });
    await vi.waitFor(() => expect(load).toHaveBeenCalled());
  });
});

describe("reportClientError", () => {
  it("does nothing without a DSN", () => {
    expect(() => reportClientError(new Error("x"), undefined)).not.toThrow();
  });
});
