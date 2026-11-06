import { afterEach, describe, expect, it, vi } from "vitest";
import { countingSender, MAIL_COUNT_TIMEOUT_MS } from "./production-mail";

const inner = { send: vi.fn(async () => ({ ok: true }) as never) };
const email = {} as never;

describe("countingSender", () => {
  afterEach(() => vi.useRealTimers());

  it("returns the send's result without waiting on a hung counter", async () => {
    vi.useFakeTimers();
    const sender = countingSender(inner, () => new Promise<void>(() => {}));
    let done = false;
    const result = sender.send(email).then((r) => {
      done = true;
      return r;
    });
    await vi.advanceTimersByTimeAsync(MAIL_COUNT_TIMEOUT_MS - 1);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    await expect(result).resolves.toEqual({ ok: true });
  });

  it("swallows a counter error and a synchronous throw", async () => {
    await expect(
      countingSender(inner, () => Promise.reject(new Error("down"))).send(email),
    ).resolves.toEqual({ ok: true });
    await expect(
      countingSender(inner, () => {
        throw new Error("down");
      }).send(email),
    ).resolves.toEqual({ ok: true });
  });
});
