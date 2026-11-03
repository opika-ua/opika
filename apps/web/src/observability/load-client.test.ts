// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  loadSentryClientDeferred,
  MAX_QUEUED_ERRORS,
  reportClientError,
  type Triggers,
} from "./load-client";

const DSN = "https://k@o1.ingest.de.sentry.io/1";

function setup(opts: { dsn?: string | undefined } = { dsn: DSN }) {
  const fire = { delay: () => {}, interaction: () => {}, error: (_e: unknown) => {} };
  const stops = vi.fn();
  const triggers: Triggers = {
    afterLoadDelay: (f) => {
      fire.delay = f;
      return stops;
    },
    onInteraction: (f) => {
      fire.interaction = f;
      return stops;
    },
    onError: (f) => {
      fire.error = f;
      return stops;
    },
  };
  const init = vi.fn();
  const capture = vi.fn();
  const load = vi.fn(async () => ({ initClientSentry: init, captureClientError: capture }));
  const started = loadSentryClientDeferred({ dsn: opts.dsn, triggers, load });
  return { fire, init, capture, load, started, stops };
}

describe("loadSentryClientDeferred", () => {
  it("with no DSN wires nothing and never requests the SDK module", () => {
    const t = setup({ dsn: undefined });
    expect(t.started).toBe(false);
    expect(t.load).not.toHaveBeenCalled();
  });

  it("does not load at start, only once a trigger fires", () => {
    const t = setup();
    expect(t.started).toBe(true);
    expect(t.load).not.toHaveBeenCalled();
  });

  it("loads after the post-load delay", async () => {
    const t = setup();
    t.fire.delay();
    await vi.waitFor(() => expect(t.init).toHaveBeenCalledWith(DSN));
  });

  it("loads on first interaction", async () => {
    const t = setup();
    t.fire.interaction();
    await vi.waitFor(() => expect(t.init).toHaveBeenCalledWith(DSN));
  });

  it("loads on a first error and replays it after init", async () => {
    const t = setup();
    const err = new Error("boom");
    t.fire.error(err);
    await vi.waitFor(() => expect(t.capture).toHaveBeenCalledWith(err, DSN));
    expect(t.init.mock.invocationCallOrder[0] ?? 0).toBeLessThan(
      t.capture.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("loads only once however many triggers fire, and stops listening", async () => {
    const t = setup();
    t.fire.delay();
    t.fire.interaction();
    t.fire.error("a");
    t.fire.error("b");
    await vi.waitFor(() => expect(t.capture).toHaveBeenCalledTimes(2));
    expect(t.load).toHaveBeenCalledTimes(1);
    expect(t.init).toHaveBeenCalledTimes(1);
    expect(t.stops).toHaveBeenCalled();
  });

  it("bounds the queue, dropping the oldest", async () => {
    const t = setup();
    for (let i = 0; i < MAX_QUEUED_ERRORS + 5; i++) t.fire.error(i);
    await vi.waitFor(() => expect(t.capture).toHaveBeenCalledTimes(MAX_QUEUED_ERRORS));
    expect(t.capture.mock.calls[0]?.[0]).toBe(5);
    expect(t.capture.mock.calls.at(-1)?.[0]).toBe(MAX_QUEUED_ERRORS + 4);
  });

  it("swallows a failed load so monitoring never breaks the page", async () => {
    const t = setup();
    t.load.mockRejectedValueOnce(new Error("chunk blocked"));
    t.fire.delay();
    await vi.waitFor(() => expect(t.stops).toHaveBeenCalled());
    expect(t.capture).not.toHaveBeenCalled();
  });
});

describe("reportClientError", () => {
  it("does nothing without a DSN", () => {
    expect(() => reportClientError(new Error("x"), undefined)).not.toThrow();
  });
});
